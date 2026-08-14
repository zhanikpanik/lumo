import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveActivationChallenge,
  resolveAdminMembership,
  resolveDeviceActivation,
} from './activation-policy.mjs';

function membership(id, role, createdAt = '2026-08-11T10:00:00.000Z') {
  return { id: `membership-${id}`, role, createdAt, venue: [{ id, name: `Venue ${id}` }] };
}

test('an eligible single venue activates immediately', () => {
  const resolution = resolveDeviceActivation([membership('a', 'owner')]);

  assert.equal(resolution.kind, 'activate');
  assert.equal(resolution.membership.venue[0].id, 'a');
});

test('multiple eligible venues require an explicit selection in stable order', () => {
  const resolution = resolveDeviceActivation([
    membership('b', 'manager', '2026-08-11T11:00:00.000Z'),
    membership('ignored', 'waiter'),
    membership('a', 'owner', '2026-08-11T09:00:00.000Z'),
  ]);

  assert.equal(resolution.kind, 'select');
  assert.deepEqual(resolution.memberships.map((entry) => entry.venue[0].id), ['a', 'b']);
});

test('reactivation remains bound to the existing venue', () => {
  const allowed = resolveDeviceActivation([
    membership('a', 'owner'),
    membership('b', 'manager'),
  ], 'b');
  const forbidden = resolveDeviceActivation([membership('a', 'owner')], 'b');

  assert.equal(allowed.kind, 'activate');
  assert.equal(allowed.membership.venue[0].id, 'b');
  assert.equal(forbidden.kind, 'forbidden-existing');
});

test('admin commands accept only owner or manager membership for the requested venue', () => {
  const memberships = [
    membership('a', 'waiter'),
    membership('b', 'manager'),
    membership('c', 'owner'),
  ];

  assert.equal(resolveAdminMembership(memberships, 'b')?.id, 'membership-b');
  assert.equal(resolveAdminMembership(memberships, 'a'), null);
  assert.equal(resolveAdminMembership(memberships, 'missing'), null);
});

test('challenge accepts only the captured venue before expiry', () => {
  const challenge = {
    status: 'pending',
    expiresAt: '2026-08-11T10:10:00.000Z',
    venuesJson: JSON.stringify([
      { id: 'a', name: 'Venue A', membershipId: 'membership-a', organizationId: 'organization-a' },
      { id: 'b', name: 'Venue B', membershipId: 'membership-b', organizationId: 'organization-b' },
    ]),
  };

  const allowed = resolveActivationChallenge(challenge, 'b', Date.parse('2026-08-11T10:09:00.000Z'));
  assert.equal(allowed.kind, 'allowed');
  assert.equal(allowed.venue.membershipId, 'membership-b');
  assert.equal(resolveActivationChallenge(challenge, 'c', Date.parse('2026-08-11T10:09:00.000Z')).kind, 'forbidden');
  assert.equal(resolveActivationChallenge(challenge, 'b', Date.parse('2026-08-11T10:10:00.000Z')).kind, 'invalid');
  assert.equal(resolveActivationChallenge({ ...challenge, status: 'consumed' }, 'b', 0).kind, 'invalid');
});
