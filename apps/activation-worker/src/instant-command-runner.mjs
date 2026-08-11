import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson } from '@lumo/data';


function commandError(message, code, statusCode, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

export function canonicalRequestHash(payload) {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

async function existingOperation(db, operationKey) {
  const data = await db.query({
    commandOperations: { $: { where: { operationKey }, limit: 1 } },
  });
  return data.commandOperations[0];
}

function replayResult(operation, kind, requestHash) {
  if (operation.kind !== kind || operation.requestHash !== requestHash) {
    throw commandError(
      'operationId was already used with a different command or payload',
      'operation_payload_mismatch',
      409,
    );
  }
  if (operation.status !== 'committed') {
    throw commandError('Operation has not committed', 'operation_not_committed', 503);
  }
  return JSON.parse(operation.resultJson);
}

export async function replayInstantCommand({ db, operationId, venueId, kind, payload }) {
  const operationKey = `${venueId}:${operationId}`;
  const operation = await existingOperation(db, operationKey);
  return operation
    ? { found: true, result: replayResult(operation, kind, canonicalRequestHash(payload)) }
    : { found: false };
}

export async function runInstantCommand(
  {
    db,
    operationId,
    venueId,
    kind,
    payload,
    deviceId,
    actorEmployeeId,
    adminUserId,
    claims = [],
    occurredAt = new Date().toISOString(),
  },
  build,
) {
  const operationKey = `${venueId}:${operationId}`;
  const requestHash = canonicalRequestHash(payload);
  const prior = await existingOperation(db, operationKey);
  if (prior) return replayResult(prior, kind, requestHash);

  const operationEntityId = randomUUID();
  const built = await build({ operationEntityId, operationKey });
  const effectiveClaims = built.claims ?? claims;
  const claimKeys = effectiveClaims.map(({ resourceType, resourceId, expectedVersion }) =>
    `${venueId}:${resourceType}:${resourceId}:${expectedVersion}`,
  );
  if (new Set(claimKeys).size !== claimKeys.length) {
    throw commandError('Command contains duplicate resource claims', 'duplicate_resource_claim', 400);
  }

  const { steps, result } = built;
  const resultJson = canonicalJson(result);
  const operationLinks = {
    venue: venueId,
    ...(deviceId ? { device: deviceId } : {}),
    ...(actorEmployeeId ? { actorEmployee: actorEmployeeId } : {}),
    ...(adminUserId ? { adminUser: adminUserId } : {}),
  };
  const operationStep = db.tx.commandOperations[operationEntityId]
    .update({
      operationKey,
      venueId,
      kind,
      requestHash,
      status: 'committed',
      resultJson,
      createdAt: occurredAt,
      committedAt: occurredAt,
    })
    .link(operationLinks);
  const claimSteps = effectiveClaims.map(({ resourceType, resourceId, expectedVersion }, index) =>
    db.tx.commandClaims[randomUUID()]
      .update({
        claimKey: claimKeys[index],
        operationKey,
        venueId,
        resourceType,
        resourceId,
        expectedVersion,
        createdAt: occurredAt,
      })
      .link({ operation: operationEntityId, venue: venueId }),
  );

  try {
    await db.transact([operationStep, ...claimSteps, ...steps]);
    return result;
  } catch (cause) {
    const committed = await existingOperation(db, operationKey);
    if (committed) return replayResult(committed, kind, requestHash);

    if (claimKeys.length > 0) {
      const conflicts = await db.query({
        commandClaims: {
          $: { where: { claimKey: { $in: claimKeys } }, limit: claimKeys.length },
          operation: {},
        },
      });
      if (conflicts.commandClaims.length > 0) {
        throw commandError('A resource changed before this command committed', 'resource_conflict', 409, {
          claimKeys: conflicts.commandClaims.map((claim) => claim.claimKey),
        });
      }
    }
    throw cause;
  }
}
