import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { init } from '@instantdb/admin';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) {
  throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
}

const port = Number(process.env.ACTIVATION_VERIFY_PORT ?? '3101');
const baseUrl = `http://127.0.0.1:${port}`;
const db = init({ appId, adminToken });
const ownerToken = await db.auth.createToken({ email: 'owner@alto-coffee.test' });
const ownerUser = await db.auth.getUser({ email: 'owner@alto-coffee.test' });
if (!ownerUser) throw new Error('Owner fixture user was not found');
const deviceEmail = `revoke-fixture-${randomUUID()}@devices.invalid`;
await db.auth.createToken({ email: deviceEmail });
const deviceUser = await db.auth.getUser({ email: deviceEmail });
if (!deviceUser) throw new Error('Could not create revoke fixture auth user');
const membershipData = await db.query({
  memberships: {
    $: { where: { 'user.id': ownerUser.id, status: 'active' }, limit: 1 },
    venue: {},
  },
});
const venueLink = membershipData.memberships[0]?.venue;
const venue = Array.isArray(venueLink) ? venueLink[0] : venueLink;
if (!venue) throw new Error('An active owner venue is required');
const deviceId = randomUUID();
const authorizationId = randomUUID();
const occurredAt = new Date().toISOString();
await db.transact([
  db.tx.devices[deviceId]
    .update({
      installationId: `revoke-fixture-${deviceId}`,
      label: 'Revoke fixture',
      platform: 'test',
      status: 'active',
      createdAt: occurredAt,
    })
    .link({ venue: venue.id, authUser: deviceUser.id }),
  db.tx.deviceAuthorizations[authorizationId]
    .update({ status: 'active', activatedAt: occurredAt })
    .link({ device: deviceId, venue: venue.id, activatedBy: ownerUser.id }),
  db.tx.venues[venue.id].link({ activeDeviceUsers: [deviceUser.id] }),
]);
async function waitForWorker() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // The listener is still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Activation worker did not become ready within 5 seconds');
}

const devices = await db.query({
  devices: { $: { where: { id: deviceId }, limit: 1 }, authorizations: {} },
});
const device = devices.devices[0];
if (!device) throw new Error('Revoke fixture device was not found');

process.env.PORT = String(port);
// The worker reads PORT while loading and owns the server lifecycle.
const { server } = await import('../server.mjs');

try {
  await waitForWorker();

  const response = await fetch(`${baseUrl}/v1/devices/${device.id}/revoke`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  const responseBody = await response.json();
  assert.equal(response.status, 200, `owner can revoke a device: ${JSON.stringify(responseBody)}`);
  assert.deepEqual(responseBody, { deviceId: device.id, status: 'revoked' });

  const [updatedDevices, deviceView] = await Promise.all([
    db.query({ devices: { authorizations: {} } }),
    db.asUser({ email: deviceEmail }).query({ venues: {} }),
  ]);
  const updatedDevice = updatedDevices.devices.find((candidate) => candidate.id === device.id);
  assert.equal(updatedDevice?.status, 'revoked', 'revocation changes the device status');
  assert.ok(
    updatedDevice?.authorizations.every((authorization) => authorization.status === 'revoked'),
    'revocation closes every active authorization',
  );
  assert.deepEqual(deviceView.venues, [], 'a revoked tablet no longer sees its venue');

  console.log('Verified activation revoke: owner revokes the fixture device and its venue access ends immediately.');
} finally {
  if (server.listening) {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  await db.transact([
    db.tx.venues[venue.id].unlink({ activeDeviceUsers: [deviceUser.id] }),
    db.tx.deviceAuthorizations[authorizationId].delete(),
    db.tx.devices[deviceId].delete(),
  ]);
}
