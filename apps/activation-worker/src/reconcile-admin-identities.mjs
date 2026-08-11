import { init } from '@instantdb/admin';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken, APPLY } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');

const db = init({ appId, adminToken });
const data = await db.query({
  $users: { memberships: { venue: {} } },
  venues: { ownerUsers: {}, managerUsers: {} },
});

const linkedId = (value) => (Array.isArray(value) ? value[0]?.id : value?.id) ?? null;
const ids = (values) => new Set((values ?? []).map((value) => value.id));
const desired = new Map(data.venues.map((venue) => [venue.id, { owner: new Set(), manager: new Set() }]));
const emailOwners = new Map();
const issues = [];

for (const user of data.$users) {
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : null;
  if (!email) {
    if ((user.memberships ?? []).some((membership) => membership.status === 'active' && (membership.role === 'owner' || membership.role === 'manager'))) {
      issues.push({ type: 'admin_user_missing_email', userId: user.id });
    }
  } else {
    const prior = emailOwners.get(email);
    if (prior && prior !== user.id) issues.push({ type: 'duplicate_normalized_email', email, userIds: [prior, user.id] });
    emailOwners.set(email, user.id);
  }

  for (const membership of user.memberships ?? []) {
    if (membership.status !== 'active' || (membership.role !== 'owner' && membership.role !== 'manager')) continue;
    const venueId = linkedId(membership.venue);
    if (!venueId || !desired.has(venueId)) {
      issues.push({ type: 'membership_missing_venue', membershipId: membership.id, userId: user.id });
      continue;
    }
    desired.get(venueId)[membership.role].add(user.id);
  }
}

const changes = [];
for (const venue of data.venues) {
  const target = desired.get(venue.id);
  for (const role of ['owner', 'manager']) {
    const label = role === 'owner' ? 'ownerUsers' : 'managerUsers';
    const current = ids(venue[label]);
    const add = [...target[role]].filter((userId) => !current.has(userId));
    const remove = [...current].filter((userId) => !target[role].has(userId));
    if (add.length || remove.length) changes.push({ venueId: venue.id, label, add, remove });
  }
}

if (issues.length > 0) {
  console.error(JSON.stringify({ status: 'blocked', issues, changes }, null, 2));
  process.exitCode = 1;
} else if (APPLY === '1') {
  const operations = changes.flatMap(({ venueId, label, add, remove }) => [
    ...(add.length ? [db.tx.venues[venueId].link({ [label]: add })] : []),
    ...(remove.length ? [db.tx.venues[venueId].unlink({ [label]: remove })] : []),
  ]);
  if (operations.length) await db.transact(operations);
  console.log(JSON.stringify({ status: 'ok', applied: true, changes }, null, 2));
} else {
  console.log(JSON.stringify({ status: changes.length ? 'changes_required' : 'ok', applied: false, changes }, null, 2));
  if (changes.length) process.exitCode = 2;
}
