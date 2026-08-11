import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { init } from '@instantdb/admin';
import { TEST_VENUE_IDS as IDS, instantSchema } from '@lumo/data';
import { runInstantCommand } from '../instant-command-runner.mjs';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
const db = init({ appId, adminToken, schema: instantSchema });
const occurredAt = new Date().toISOString();
const runId = randomUUID();
const operationIds = [];
const eventIds = [];

function auditStep(eventId, action) {
  eventIds.push(eventId);
  return db.tx.auditEvents[eventId]
    .update({ venueId: IDS.venue, action, occurredAt, metadata: { runId } })
    .link({ organization: IDS.organization, venue: IDS.venue });
}

async function run({ operationId, payload, claims = [], database = db, action = 'command_runner_fixture' }) {
  operationIds.push(`${IDS.venue}:${operationId}`);
  return runInstantCommand({
    db: database,
    operationId,
    venueId: IDS.venue,
    kind: 'integration-fixture',
    payload,
    deviceId: IDS.deviceTablet1,
    actorEmployeeId: IDS.employeeWaiter,
    claims,
    occurredAt,
  }, async () => {
    const eventId = randomUUID();
    return {
      steps: [auditStep(eventId, action)],
      result: { eventId, accepted: true },
    };
  });
}

try {
  const replayOperationId = `runner-replay-${runId}`;
  const first = await run({ operationId: replayOperationId, payload: { b: 2, a: 1 } });
  const replay = await run({ operationId: replayOperationId, payload: { a: 1, b: 2 } });
  assert.deepEqual(replay, first, 'equivalent replay returns the committed result');
  assert.equal(eventIds.length, 1, 'replay does not rebuild the command effect');

  await assert.rejects(
    run({ operationId: replayOperationId, payload: { a: 1, b: 3 } }),
    (error) => error.code === 'operation_payload_mismatch' && error.statusCode === 409,
  );

  const sharedClaim = [{ resourceType: 'fixture', resourceId: runId, expectedVersion: 7 }];
  const concurrent = await Promise.allSettled([
    run({ operationId: `runner-race-a-${runId}`, payload: { contender: 'a' }, claims: sharedClaim }),
    run({ operationId: `runner-race-b-${runId}`, payload: { contender: 'b' }, claims: sharedClaim }),
  ]);
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = concurrent.find((result) => result.status === 'rejected');
  assert.equal(rejected?.reason?.code, 'resource_conflict');

  let loseResponse = true;
  const responseLossDb = {
    tx: db.tx,
    query: (...args) => db.query(...args),
    transact: async (...args) => {
      const result = await db.transact(...args);
      if (loseResponse) {
        loseResponse = false;
        throw new Error('simulated response loss after commit');
      }
      return result;
    },
  };
  const lostResponseResult = await run({
    operationId: `runner-response-loss-${runId}`,
    payload: { value: 'committed' },
    database: responseLossDb,
  });
  assert.equal(lostResponseResult.accepted, true, 'committed result survives response loss');

  const unavailableDb = {
    tx: db.tx,
    query: (...args) => db.query(...args),
    transact: async () => { throw new Error('simulated infrastructure outage'); },
  };
  const retryOperationId = `runner-infrastructure-${runId}`;
  await assert.rejects(
    run({ operationId: retryOperationId, payload: { retry: true }, database: unavailableDb }),
    /simulated infrastructure outage/,
  );
  const retryResult = await run({ operationId: retryOperationId, payload: { retry: true } });
  assert.equal(retryResult.accepted, true, 'infrastructure failures remain retryable');

  console.log('Verified atomic command claims, canonical replay, mismatch rejection, response loss, and infrastructure retry.');
} finally {
  const records = await db.query({
    commandOperations: { $: { where: { operationKey: { $in: operationIds } } }, claims: {} },
  });
  const operations = records.commandOperations;
  const claimIds = operations.flatMap((operation) => operation.claims ?? []).map((claim) => claim.id);
  await db.transact([
    ...claimIds.map((id) => db.tx.commandClaims[id].delete()),
    ...operations.map((operation) => db.tx.commandOperations[operation.id].delete()),
    ...eventIds.map((id) => db.tx.auditEvents[id].delete()),
  ]).catch(() => {});
}
