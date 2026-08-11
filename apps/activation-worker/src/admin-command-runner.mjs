import { deterministicId } from '@lumo/data';
import { replayInstantCommand, runInstantCommand } from './instant-command-runner.mjs';

const CASH_MOVEMENT_TYPES = new Set(['expense', 'income', 'collection']);

function commandError(message, code = 'invalid_request', statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function nonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw commandError(`${name} is required`);
  return value.trim();
}

function safeInteger(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw commandError(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

function versionOf(entity, name) {
  if (!Number.isSafeInteger(entity?.version) || entity.version < 0) {
    throw commandError(`${name} is missing a valid version`, 'invalid_resource_version', 409);
  }
  return entity.version;
}

function linked(value) {
  return Array.isArray(value) ? value[0] : value;
}

async function entityById(db, namespace, id, nested = {}) {
  const result = await db.query({
    [namespace]: { $: { where: { id }, limit: 1 }, ...nested },
  });
  return result[namespace][0];
}

function requireVenueEntity(entity, venueId, name) {
  if (!entity || entity.venueId !== venueId) throw commandError(`${name} was not found`, 'not_found', 404);
  return entity;
}

function claim(resourceType, resourceId, expectedVersion) {
  return { resourceType, resourceId, expectedVersion };
}

function optionalText(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw commandError(`${name} must be a string`);
  return value;
}

function isoDate(value, name) {
  const date = new Date(nonEmptyString(value, name));
  if (Number.isNaN(date.getTime())) throw commandError(`${name} must be a valid ISO date`);
  return date.toISOString();
}

async function addCashMovement(db, adminUserId, operationId, venueId, payload) {
  const shiftId = nonEmptyString(payload.shiftId, 'shiftId');
  const movementType = nonEmptyString(payload.movementType, 'movementType');
  if (!CASH_MOVEMENT_TYPES.has(movementType)) throw commandError('Unsupported movementType');
  const amountTiyin = safeInteger(payload.amountTiyin, 'amountTiyin', 1);
  const shift = requireVenueEntity(await entityById(db, 'shifts', shiftId), venueId, 'Shift');
  const shiftVersion = versionOf(shift, 'Shift');
  const movementId = deterministicId('admin-cash-movement', venueId, operationId);
  const now = new Date().toISOString();
  return runInstantCommand(
    { db, adminUserId, operationId, venueId, kind: 'add-cash-movement', payload },
    async () => ({
      claims: [claim('shift', shiftId, shiftVersion), claim('cash-movement', movementId, 0)],
      steps: [
        db.tx.cashMovements[movementId]
          .update({
            venueId,
            operationId,
            movementType,
            amountTiyin,
            note: optionalText(payload.note, 'note'),
            occurredAt: isoDate(payload.occurredAt, 'occurredAt'),
            createdAt: now,
            version: 1,
          })
          .link({ venue: venueId, shift: shiftId }),
        db.tx.shifts[shiftId].update({ version: shiftVersion + 1 }),
      ],
      result: { cashMovementId: movementId },
    }),
  );
}

async function updateCashMovement(db, adminUserId, operationId, venueId, payload) {
  const movementId = nonEmptyString(payload.cashMovementId, 'cashMovementId');
  const movement = requireVenueEntity(
    await entityById(db, 'cashMovements', movementId, { shift: {} }),
    venueId,
    'Cash movement',
  );
  const shift = requireVenueEntity(linked(movement.shift), venueId, 'Shift');
  const movementVersion = Number.isSafeInteger(movement.version) ? movement.version : 0;
  const shiftVersion = versionOf(shift, 'Shift');
  const patch = payload.patch ?? {};
  const fields = { version: movementVersion + 1 };
  if (patch.amountTiyin !== undefined) fields.amountTiyin = safeInteger(patch.amountTiyin, 'amountTiyin', 1);
  if (patch.note !== undefined) fields.note = optionalText(patch.note, 'note');
  if (patch.occurredAt !== undefined) fields.occurredAt = isoDate(patch.occurredAt, 'occurredAt');
  return runInstantCommand(
    { db, adminUserId, operationId, venueId, kind: 'update-cash-movement', payload },
    async () => ({
      claims: [
        claim('cash-movement', movementId, movementVersion),
        claim('shift', shift.id, shiftVersion),
      ],
      steps: [
        db.tx.cashMovements[movementId].update(fields),
        db.tx.shifts[shift.id].update({ version: shiftVersion + 1 }),
      ],
      result: { cashMovementId: movementId },
    }),
  );
}

async function deleteCashMovement(db, adminUserId, operationId, venueId, payload) {
  const movementId = nonEmptyString(payload.cashMovementId, 'cashMovementId');
  const movement = requireVenueEntity(
    await entityById(db, 'cashMovements', movementId, { shift: {} }),
    venueId,
    'Cash movement',
  );
  const shift = requireVenueEntity(linked(movement.shift), venueId, 'Shift');
  const movementVersion = Number.isSafeInteger(movement.version) ? movement.version : 0;
  const shiftVersion = versionOf(shift, 'Shift');
  return runInstantCommand(
    { db, adminUserId, operationId, venueId, kind: 'delete-cash-movement', payload },
    async () => ({
      claims: [
        claim('cash-movement', movementId, movementVersion),
        claim('shift', shift.id, shiftVersion),
      ],
      steps: [
        db.tx.cashMovements[movementId].delete(),
        db.tx.shifts[shift.id].update({ version: shiftVersion + 1 }),
      ],
      result: { cashMovementId: movementId, deleted: true },
    }),
  );
}

async function updateShift(db, adminUserId, operationId, venueId, payload) {
  const shiftId = nonEmptyString(payload.shiftId, 'shiftId');
  const shift = requireVenueEntity(await entityById(db, 'shifts', shiftId), venueId, 'Shift');
  const currentVersion = versionOf(shift, 'Shift');
  const patch = payload.patch ?? {};
  const fields = { version: currentVersion + 1 };
  if (patch.openedAt !== undefined) fields.openedAt = isoDate(patch.openedAt, 'openedAt');
  if (patch.closedAt !== undefined) fields.closedAt = isoDate(patch.closedAt, 'closedAt');
  if (patch.startingCashTiyin !== undefined) fields.startingCashTiyin = safeInteger(patch.startingCashTiyin, 'startingCashTiyin');
  if (patch.countedCashTiyin !== undefined) fields.countedCashTiyin = patch.countedCashTiyin === null
    ? undefined
    : safeInteger(patch.countedCashTiyin, 'countedCashTiyin');
  if (patch.openingNote !== undefined) fields.openingNote = optionalText(patch.openingNote, 'openingNote');
  if (patch.closingNote !== undefined) fields.closingNote = optionalText(patch.closingNote, 'closingNote');
  return runInstantCommand(
    { db, adminUserId, operationId, venueId, kind: 'update-shift', payload },
    async () => ({
      claims: [claim('shift', shiftId, currentVersion)],
      steps: [db.tx.shifts[shiftId].update(fields)],
      result: { shiftId },
    }),
  );
}

const handlers = {
  'add-cash-movement': addCashMovement,
  'update-cash-movement': updateCashMovement,
  'delete-cash-movement': deleteCashMovement,
  'update-shift': updateShift,
};

export async function runAdminCommand({ db, adminUserId, operationId, venueId, kind, payload }) {
  const replay = await replayInstantCommand({ db, operationId, venueId, kind, payload: payload ?? {} });
  if (replay.found) return replay.result;
  const handler = handlers[kind];
  if (!handler) throw commandError('Unknown admin command kind', 'unknown_command', 404);
  return handler(db, adminUserId, operationId, venueId, payload ?? {});
}
