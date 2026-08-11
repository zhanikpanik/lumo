import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { init } from '@instantdb/admin';
import { instantSchema, verifyEmployeePin } from '@lumo/data';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
process.env.PORT = process.env.STAFF_HTTP_TEST_PORT ?? '3104';

const db = init({ appId, adminToken, schema: instantSchema });
const runId = randomUUID();
const now = new Date().toISOString();
const organizationId = randomUUID();
const venueId = randomUUID();
const membershipId = randomUUID();
const deviceId = randomUUID();
const authorizationId = randomUUID();
const ownerEmail = `staff-owner-${runId}@alto-coffee.test`;
const deviceEmail = `staff-device-${runId}@devices.invalid`;
const ownerToken = await db.auth.createToken({ email: ownerEmail });
const deviceToken = await db.auth.createToken({ email: deviceEmail });
const owner = await db.auth.getUser({ email: ownerEmail });
const deviceUser = await db.auth.getUser({ email: deviceEmail });
if (!owner || !deviceUser) throw new Error('Could not create staff HTTP identities');

await db.transact([
  db.tx.organizations[organizationId].update({ slug: `staff-http-${runId}`, name: 'Staff HTTP fixture', createdAt: now }),
  db.tx.venues[venueId]
    .update({
      slug: `staff-http-${runId}`, name: 'Staff HTTP fixture', currency: 'KGS', timeZone: 'Asia/Bishkek',
      venueType: 'restaurant', trackGuests: false, createdAt: now, version: 0,
    })
    .link({ organization: organizationId, ownerUsers: [owner.id], activeDeviceUsers: [deviceUser.id] }),
  db.tx.memberships[membershipId]
    .update({ role: 'owner', status: 'active', createdAt: now })
    .link({ organization: organizationId, venue: venueId, user: owner.id }),
  db.tx.devices[deviceId]

    .update({ installationId: `staff-http-${runId}`, label: 'Staff HTTP device', platform: 'web', status: 'active', createdAt: now })
    .link({ venue: venueId, authUser: deviceUser.id }),
  db.tx.deviceAuthorizations[authorizationId]
    .update({ status: 'active', activatedAt: now })
    .link({ device: deviceId, venue: venueId, activatedBy: owner.id }),
]);

const credentialFor = (employee) =>
  Array.isArray(employee.pinCredential) ? employee.pinCredential[0] : employee.pinCredential;

const externalBaseUrl = process.env.STAFF_HTTP_BASE_URL?.replace(/\/$/, '');
const server = externalBaseUrl ? null : (await import('../server.mjs')).server;
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${process.env.PORT}`;

async function waitForServer() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/healthz`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Staff HTTP fixture worker did not become ready');
}

async function staffCommand(kind, operationId, payload) {
  const response = await fetch(`${baseUrl}/v1/admin/staff-commands`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind, operationId, venueId, payload }),
  });
  return { status: response.status, body: await response.json() };
}

async function adminCommand(kind, operationId, payload) {
  const response = await fetch(`${baseUrl}/v1/admin/operational-commands`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind, operationId, venueId, payload }),
  });
  return { status: response.status, body: await response.json() };
}

async function cleanup() {
  const scoped = await db.query({
    auditEvents: { $: { where: { venueId } } },
    commandClaims: { $: { where: { venueId } } },
    commandOperations: { $: { where: { venueId } } },
    employeePinCredentials: { $: { where: { 'employee.venue.id': venueId } }, employee: {} },
    employees: { $: { where: { venueId } } },
    cashMovements: { $: { where: { venueId } } },
    shifts: { $: { where: { venueId } } },
  }).catch(() => null);
  if (scoped) {
    await db.transact([
      ...scoped.cashMovements.map((row) => db.tx.cashMovements[row.id].delete()),
      ...scoped.shifts.map((row) => db.tx.shifts[row.id].delete()),
      ...scoped.auditEvents.map((row) => db.tx.auditEvents[row.id].delete()),
      ...scoped.commandClaims.map((row) => db.tx.commandClaims[row.id].delete()),
      ...scoped.commandOperations.map((row) => db.tx.commandOperations[row.id].delete()),
      ...scoped.employeePinCredentials.map((row) => db.tx.employeePinCredentials[row.id].delete()),
      ...scoped.employees.map((row) => db.tx.employees[row.id].delete()),
    ]).catch(() => {});
  }
  await db.transact([
    db.tx.deviceAuthorizations[authorizationId].delete(),
    db.tx.devices[deviceId].delete(),
    db.tx.memberships[membershipId].delete(),
    db.tx.venues[venueId].delete(),
    db.tx.organizations[organizationId].delete(),
  ]).catch(() => {});
  await db.auth.signOut({ id: owner.id }).catch(() => {});
  await db.auth.signOut({ id: deviceUser.id }).catch(() => {});
}

try {
  await waitForServer();
  const createOperationId = `create-employee-${runId}`;
  const created = await staffCommand('create-employee', createOperationId, {
    displayName: 'Credential Fixture', email: null, role: 'waiter', pin: '123456',
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.credentialsVersion, 1);
  const replay = await staffCommand('create-employee', createOperationId, {
    displayName: 'Credential Fixture', email: null, role: 'waiter', pin: '123456',
  });
  assert.deepEqual(replay, created, 'credential creation replay must return the committed result');

  const credentialData = await db.query({
    employees: { $: { where: { id: created.body.employeeId }, limit: 1 }, pinCredential: {} },
  });
  const employee = credentialData.employees[0];
  assert.ok(employee);
  assert.equal(Object.hasOwn(employee, 'pin'), false, 'employee rows must not contain plaintext PIN');
  assert.equal(await verifyEmployeePin(credentialFor(employee), '123456'), true);

  const deviceClient = db.asUser({ email: deviceEmail });
  const visibleToDevice = await deviceClient.query({
    employees: { $: { where: { id: employee.id }, limit: 1 }, pinCredential: {} },
  });
  assert.equal(credentialFor(visibleToDevice.employees[0]).credentialsVersion, 1);

  const ownerClient = db.asUser({ email: ownerEmail });
  const hiddenCredentials = await ownerClient.query({ employeePinCredentials: {} });
  assert.equal(hiddenCredentials.employeePinCredentials.length, 0, 'admin clients must not read PIN verifiers');
  const anonymousClient = db.asUser({ guest: true });
  const anonymousCredentials = await anonymousClient.query({ employeePinCredentials: {} });
  assert.equal(anonymousCredentials.employeePinCredentials.length, 0, 'anonymous clients must not read PIN verifiers');

  const reset = await staffCommand('reset-employee-pin', `reset-pin-${runId}`, {
    employeeId: employee.id, pin: '654321',
  });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal(reset.body.credentialsVersion, 2);
  const resetData = await db.query({
    employees: { $: { where: { id: employee.id }, limit: 1 }, pinCredential: {} },
  });
  assert.equal(await verifyEmployeePin(credentialFor(resetData.employees[0]), '123456'), false);
  assert.equal(await verifyEmployeePin(credentialFor(resetData.employees[0]), '654321'), true);

  const updated = await staffCommand('update-employee', `update-employee-${runId}`, {
    employeeId: employee.id,
    displayName: 'Updated Credential Fixture',
    email: `updated-${runId}@alto-coffee.test`,
    role: 'cashier',
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  const updatedEmployee = await db.query({
    employees: { $: { where: { id: employee.id }, limit: 1 } },
  });
  assert.equal(updatedEmployee.employees[0].displayName, 'Updated Credential Fixture');
  assert.equal(updatedEmployee.employees[0].role, 'cashier');
  assert.equal(updatedEmployee.employees[0].version, 2);

  const shiftId = randomUUID();
  await db.transact(
    db.tx.shifts[shiftId]
      .update({
        venueId,
        operationId: `admin-shift-${runId}`,
        openedAt: now,
        startingCashTiyin: 10_000,
        status: 'open',
        createdAt: now,
        version: 0,
      })
      .link({ venue: venueId, openedBy: employee.id }),
  );
  const addedMovement = await adminCommand('add-cash-movement', `add-admin-cash-${runId}`, {
    shiftId,
    movementType: 'expense',
    amountTiyin: 500,
    note: 'Fixture expense',
    occurredAt: now,
  });
  assert.equal(addedMovement.status, 200, JSON.stringify(addedMovement.body));
  const cashMovementId = addedMovement.body.cashMovementId;
  const updatedMovement = await adminCommand('update-cash-movement', `update-admin-cash-${runId}`, {
    cashMovementId,
    patch: { amountTiyin: 750, note: 'Updated fixture expense' },
  });
  assert.equal(updatedMovement.status, 200, JSON.stringify(updatedMovement.body));
  const updatedShift = await adminCommand('update-shift', `update-admin-shift-${runId}`, {
    shiftId,
    patch: { openingNote: 'Reviewed by admin' },
  });
  assert.equal(updatedShift.status, 200, JSON.stringify(updatedShift.body));
  const deletedMovement = await adminCommand('delete-cash-movement', `delete-admin-cash-${runId}`, {
    cashMovementId,
  });
  assert.equal(deletedMovement.status, 200, JSON.stringify(deletedMovement.body));
  const adminState = await db.query({
    shifts: { $: { where: { id: shiftId }, limit: 1 } },
    cashMovements: { $: { where: { id: cashMovementId }, limit: 1 } },
  });
  assert.equal(adminState.shifts[0].openingNote, 'Reviewed by admin');
  assert.equal(adminState.shifts[0].version, 4);
  assert.equal(adminState.cashMovements.length, 0);

  const duplicatePin = await staffCommand('create-employee', `duplicate-pin-${runId}`, {
    displayName: 'Duplicate PIN', email: null, role: 'cashier', pin: '654321',
  });
  assert.equal(duplicatePin.status, 409, JSON.stringify(duplicatePin.body));
  assert.equal(duplicatePin.body.code, 'pin_in_use');

  const pinAsBearer = await fetch(`${baseUrl}/v1/admin/staff-commands`, {
    method: 'POST',
    headers: { authorization: 'Bearer 654321', 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'reset-employee-pin',
      operationId: `pin-as-bearer-${runId}`,
      venueId,
      payload: { employeeId: employee.id, pin: '111111' },
    }),
  });
  assert.equal(pinAsBearer.status, 401, 'a PIN must never authorize a server mutation');

  const unlockResponse = await fetch(`${baseUrl}/v1/pos/unlock-attempts`, {
    method: 'POST',
    headers: { authorization: `Bearer ${deviceToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ attempts: [
      { id: `failure-${runId}`, occurredAt: now, outcome: 'failure' },
      { id: `success-${runId}`, occurredAt: now, outcome: 'success', employeeId: employee.id },
    ] }),
  });
  assert.equal(unlockResponse.status, 200, await unlockResponse.text());
  const audits = await db.query({ auditEvents: { $: { where: { venueId } } } });
  assert.equal(audits.auditEvents.filter((event) => event.action.startsWith('offline_unlock_')).length, 2);

  const deactivated = await staffCommand('deactivate-employee', `deactivate-${runId}`, {
    employeeId: employee.id,
  });
  assert.equal(deactivated.status, 200, JSON.stringify(deactivated.body));
  assert.equal(deactivated.body.credentialsVersion, 3);
  const deactivatedData = await db.query({
    employees: { $: { where: { id: employee.id }, limit: 1 }, pinCredential: {} },
  });
  assert.equal(deactivatedData.employees[0].status, 'inactive');
  assert.equal(await verifyEmployeePin(credentialFor(deactivatedData.employees[0]), '654321'), false);

  console.log('Verified trusted PIN create/reset/deactivate, verifier privacy, versioning, replay, uniqueness, and offline attempt audit.');
} finally {
  if (server?.listening) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  await cleanup();
}
