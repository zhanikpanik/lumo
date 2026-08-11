import { randomBytes } from 'node:crypto';
import {
  EMPLOYEE_PIN_CREDENTIAL_TTL_MS,
  deriveEmployeePinVerifier,
  deterministicId,
  employeePinLookupHash,
  validateEmployeePin,
} from '@lumo/data';
import { replayInstantCommand, runInstantCommand } from './instant-command-runner.mjs';

const EMPLOYEE_ROLES = new Set(['owner', 'manager', 'cashier', 'waiter']);

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

function linked(value) {
  return Array.isArray(value) ? value[0] : value;
}

async function employeeById(db, employeeId) {
  const result = await db.query({
    employees: { $: { where: { id: employeeId }, limit: 1 }, venue: {}, pinCredential: {} },
  });
  return result.employees[0];
}

async function organizationIdForVenue(db, venueId) {
  const result = await db.query({
    venues: { $: { where: { id: venueId }, limit: 1 }, organization: {} },
  });
  const organization = linked(result.venues[0]?.organization);
  if (!organization?.id) throw commandError('Venue organization was not found', 'not_found', 404);
  return organization.id;
}

async function assertPinAvailable(db, venueId, employeeId, pinLookupHash) {
  const result = await db.query({
    employeePinCredentials: {
      $: { where: { pinLookupHash }, limit: 1 },
      employee: {},
    },
  });
  const existingEmployee = linked(result.employeePinCredentials[0]?.employee);
  if (existingEmployee && existingEmployee.id !== employeeId) {
    throw commandError('This PIN is already assigned in the venue', 'pin_in_use', 409);
  }
}

async function credentialFields(db, venueId, employeeId, pin, currentVersion) {
  validateEmployeePin(pin);
  const pinLookupHash = employeePinLookupHash(venueId, pin);
  await assertPinAvailable(db, venueId, employeeId, pinLookupHash);
  const pinSalt = randomBytes(16).toString('hex');
  const pinVerifier = await deriveEmployeePinVerifier(pin, pinSalt);
  const now = new Date();
  return {
    now: now.toISOString(),
    fields: {
      pinSalt,
      pinVerifier,
      pinLookupHash,
      credentialsVersion: currentVersion + 1,
      expiresAt: new Date(now.getTime() + EMPLOYEE_PIN_CREDENTIAL_TTL_MS).toISOString(),
      updatedAt: now.toISOString(),
    },
  };
}

async function createEmployee(db, adminUserId, operationId, venueId, payload) {
  const displayName = nonEmptyString(payload.displayName, 'displayName');
  const role = nonEmptyString(payload.role, 'role');
  if (!EMPLOYEE_ROLES.has(role)) throw commandError('Unsupported employee role');
  const pin = nonEmptyString(payload.pin, 'pin');
  const employeeId = deterministicId('employee', `${venueId}:${operationId}`);
  const credentialId = deterministicId('employee-pin-credential', employeeId);
  const credential = await credentialFields(db, venueId, employeeId, pin, 0);
  const organizationId = await organizationIdForVenue(db, venueId);
  return runInstantCommand(
    { db, adminUserId, operationId, venueId, kind: 'create-employee', payload },
    async ({ operationEntityId }) => ({
      steps: [
        db.tx.employees[employeeId]
          .update({
            venueId,
            displayName,
            role,
            status: 'active',
            ...(typeof payload.email === 'string' && payload.email.trim() ? { email: payload.email.trim().toLowerCase() } : {}),
            version: 1,
            createdAt: credential.now,
          })
          .link({ venue: venueId }),
        db.tx.employeePinCredentials[credentialId]
          .update(credential.fields)
          .link({ employee: employeeId }),
        db.tx.auditEvents[deterministicId('staff-credential-audit', `${venueId}:${operationId}`)]
          .update({
            venueId,
            action: 'employee_credential_created',
            occurredAt: credential.now,
            metadata: { employeeId, credentialsVersion: credential.fields.credentialsVersion },
          })
          .link({ organization: organizationId, venue: venueId, adminUser: adminUserId, operation: operationEntityId }),
      ],
      result: {
        employeeId,
        credentialsVersion: credential.fields.credentialsVersion,
        expiresAt: credential.fields.expiresAt,
      },
    }),
  );
}

async function resetEmployeePin(db, adminUserId, operationId, venueId, payload) {
  const employeeId = nonEmptyString(payload.employeeId, 'employeeId');
  const employee = await employeeById(db, employeeId);
  if (!employee || employee.venueId !== venueId) throw commandError('Employee was not found', 'not_found', 404);
  const existingCredential = linked(employee.pinCredential);
  const credentialId = existingCredential?.id ?? deterministicId('employee-pin-credential', employeeId);
  const currentVersion = Number.isSafeInteger(existingCredential?.credentialsVersion)
    ? existingCredential.credentialsVersion
    : 0;
  const credential = await credentialFields(db, venueId, employeeId, nonEmptyString(payload.pin, 'pin'), currentVersion);
  const organizationId = await organizationIdForVenue(db, venueId);
  return runInstantCommand(
    { db, adminUserId, operationId, venueId, kind: 'reset-employee-pin', payload },
    async ({ operationEntityId }) => ({
      claims: [{ resourceType: 'employee-pin-credential', resourceId: credentialId, expectedVersion: currentVersion }],
      steps: [
        db.tx.employeePinCredentials[credentialId]
          .update(credential.fields)
          .link({ employee: employeeId }),
        db.tx.auditEvents[deterministicId('staff-credential-audit', `${venueId}:${operationId}`)]
          .update({
            venueId,
            action: 'employee_credential_reset',
            occurredAt: credential.now,
            metadata: { employeeId, credentialsVersion: credential.fields.credentialsVersion },
          })
          .link({ organization: organizationId, venue: venueId, adminUser: adminUserId, operation: operationEntityId }),
      ],
      result: {
        employeeId,
        credentialsVersion: credential.fields.credentialsVersion,
        expiresAt: credential.fields.expiresAt,
      },
    }),
  );
}

async function updateEmployee(db, adminUserId, operationId, venueId, payload) {
  const employeeId = nonEmptyString(payload.employeeId, 'employeeId');
  const employee = await employeeById(db, employeeId);
  if (!employee || employee.venueId !== venueId) throw commandError('Employee was not found', 'not_found', 404);
  const displayName = nonEmptyString(payload.displayName, 'displayName');
  const role = nonEmptyString(payload.role, 'role');
  if (!EMPLOYEE_ROLES.has(role)) throw commandError('Unsupported employee role');
  const currentEmployeeVersion = Number.isSafeInteger(employee.version) ? employee.version : 0;
  const existingCredential = linked(employee.pinCredential);
  const currentCredentialsVersion = Number.isSafeInteger(existingCredential?.credentialsVersion)
    ? existingCredential.credentialsVersion
    : 0;
  const credential = payload.pin
    ? await credentialFields(db, venueId, employeeId, nonEmptyString(payload.pin, 'pin'), currentCredentialsVersion)
    : null;
  const credentialId = existingCredential?.id ?? deterministicId('employee-pin-credential', employeeId);
  const now = credential?.now ?? new Date().toISOString();
  const organizationId = await organizationIdForVenue(db, venueId);
  return runInstantCommand(
    { db, adminUserId, operationId, venueId, kind: 'update-employee', payload },
    async ({ operationEntityId }) => ({
      claims: [
        { resourceType: 'employee', resourceId: employeeId, expectedVersion: currentEmployeeVersion },
        ...(credential ? [{
          resourceType: 'employee-pin-credential',
          resourceId: credentialId,
          expectedVersion: currentCredentialsVersion,
        }] : []),
      ],
      steps: [
        db.tx.employees[employeeId].update({
          displayName,
          role,
          version: currentEmployeeVersion + 1,
          ...(typeof payload.email === 'string' && payload.email.trim()
            ? { email: payload.email.trim().toLowerCase() }
            : { email: undefined }),
        }),
        ...(credential ? [
          db.tx.employeePinCredentials[credentialId]
            .update(credential.fields)
            .link({ employee: employeeId }),
        ] : []),
        db.tx.auditEvents[deterministicId('staff-profile-audit', `${venueId}:${operationId}`)]
          .update({
            venueId,
            action: 'employee_updated',
            occurredAt: now,
            metadata: {
              employeeId,
              credentialsVersion: credential?.fields.credentialsVersion ?? currentCredentialsVersion,
              credentialReset: Boolean(credential),
            },
          })
          .link({ organization: organizationId, venue: venueId, adminUser: adminUserId, operation: operationEntityId }),
      ],
      result: {
        employeeId,
        credentialsVersion: credential?.fields.credentialsVersion ?? currentCredentialsVersion,
      },
    }),
  );
}

async function deactivateEmployee(db, adminUserId, operationId, venueId, payload) {
  const employeeId = nonEmptyString(payload.employeeId, 'employeeId');
  const employee = await employeeById(db, employeeId);
  if (!employee || employee.venueId !== venueId) throw commandError('Employee was not found', 'not_found', 404);
  const existingCredential = linked(employee.pinCredential);
  if (!existingCredential) throw commandError('Employee credential was not found', 'not_found', 404);
  const currentVersion = Number.isSafeInteger(existingCredential.credentialsVersion)
    ? existingCredential.credentialsVersion
    : 0;
  const nextVersion = currentVersion + 1;
  const now = new Date().toISOString();
  const organizationId = await organizationIdForVenue(db, venueId);
  return runInstantCommand(
    { db, adminUserId, operationId, venueId, kind: 'deactivate-employee', payload },
    async ({ operationEntityId }) => ({
      claims: [
        {
          resourceType: 'employee-pin-credential',
          resourceId: existingCredential.id,
          expectedVersion: currentVersion,
        },
        {
          resourceType: 'employee',
          resourceId: employeeId,
          expectedVersion: Number.isSafeInteger(employee.version) ? employee.version : 0,
        },
      ],
      steps: [
        db.tx.employees[employeeId].update({
          status: 'inactive',
          version: (Number.isSafeInteger(employee.version) ? employee.version : 0) + 1,
        }),
        db.tx.employeePinCredentials[existingCredential.id].update({
          pinSalt: randomBytes(16).toString('hex'),
          pinVerifier: 'revoked',
          pinLookupHash: `revoked:${venueId}:${employeeId}:${nextVersion}`,
          credentialsVersion: nextVersion,
          expiresAt: '1970-01-01T00:00:00.000Z',
          updatedAt: now,
        }),
        db.tx.auditEvents[deterministicId('staff-credential-audit', `${venueId}:${operationId}`)]
          .update({
            venueId,
            action: 'employee_deactivated',
            occurredAt: now,
            metadata: { employeeId, credentialsVersion: nextVersion },
          })
          .link({ organization: organizationId, venue: venueId, adminUser: adminUserId, operation: operationEntityId }),
      ],
      result: { employeeId, credentialsVersion: nextVersion },
    }),
  );
}

const handlers = {
  'create-employee': createEmployee,
  'update-employee': updateEmployee,
  'reset-employee-pin': resetEmployeePin,
  'deactivate-employee': deactivateEmployee,
};

export async function runStaffCommand({ db, adminUserId, operationId, venueId, kind, payload }) {
  const replay = await replayInstantCommand({ db, operationId, venueId, kind, payload: payload ?? {} });
  if (replay.found) return replay.result;
  const handler = handlers[kind];
  if (!handler) throw commandError('Unknown staff command kind', 'unknown_command', 404);
  return handler(db, adminUserId, operationId, venueId, payload ?? {});
}
