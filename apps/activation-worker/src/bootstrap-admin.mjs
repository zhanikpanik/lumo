import { randomUUID } from 'node:crypto';
import { init } from '@instantdb/admin';

const {
  INSTANT_APP_ID: appId,
  INSTANT_ADMIN_TOKEN: adminToken,
  ADMIN_EMAIL: email,
  ADMIN_ORGANIZATION_ID: organizationId,
  ADMIN_ORGANIZATION_NAME: organizationName = 'Alto Coffee',
  ADMIN_ORGANIZATION_SLUG: organizationSlug = `organization-${organizationId}`,
  ADMIN_VENUE_ID: venueId,
  ADMIN_VENUE_NAME: venueName = 'Alto Coffee Bishkek',
  ADMIN_VENUE_SLUG: venueSlug = `venue-${venueId}`,
  ADMIN_CURRENCY: currency = 'KGS',
  ADMIN_TIME_ZONE: timeZone = 'Asia/Bishkek',
  ADMIN_VENUE_TYPE: venueType = 'restaurant',
  ADMIN_ROLE: role = 'owner',
} = process.env;

const required = {
  INSTANT_APP_ID: appId,
  INSTANT_ADMIN_TOKEN: adminToken,
  ADMIN_EMAIL: email,
  ADMIN_ORGANIZATION_ID: organizationId,
  ADMIN_VENUE_ID: venueId,
};
const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length > 0) {
  throw new Error(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required`);
}
if (role !== 'owner' && role !== 'manager') {
  throw new Error('ADMIN_ROLE must be owner or manager');
}

const db = init({ appId, adminToken });
const normalizedEmail = email.trim().toLowerCase();
let user = await db.auth.getUser({ email: normalizedEmail });
if (!user) {
  // Provision the identity before its first interactive sign-in.
  // The generated custom token is discarded; only the resulting user ID is used.
  await db.auth.createToken({ email: normalizedEmail });
  user = await db.auth.getUser({ email: normalizedEmail });
}
if (!user) throw new Error('Instant user could not be created');

const now = new Date().toISOString();
const venueResult = await db.query({
  venues: { $: { where: { id: venueId }, limit: 1 }, organization: {} },
});
let venue = venueResult.venues[0];
let organization = Array.isArray(venue?.organization) ? venue.organization[0] : venue?.organization;

if (venue && organization?.id !== organizationId) {
  throw new Error('Venue is linked to a different organization');
}
if (!venue) {
  const organizationResult = await db.query({
    organizations: { $: { where: { id: organizationId }, limit: 1 } },
  });
  const setupSteps = [
    db.tx.venues[venueId]
      .update({
        slug: venueSlug,
        name: venueName,
        currency,
        timeZone,
        venueType,
        trackGuests: false,
        createdAt: now,
        version: 0,
      })
      .link({ organization: organizationId }),
  ];
  if (!organizationResult.organizations[0]) {
    setupSteps.unshift(
      db.tx.organizations[organizationId].update({
        slug: organizationSlug,
        name: organizationName,
        createdAt: now,
      }),
    );
  }
  await db.transact(setupSteps);
  venue = { id: venueId };
  organization = { id: organizationId };
}
if (!organization?.id) throw new Error('Venue organization was not found');

const memberships = await db.query({ memberships: { user: {}, venue: {}, organization: {} } });
const existing = memberships.memberships.find((membership) => {
  const membershipUser = Array.isArray(membership.user) ? membership.user[0] : membership.user;
  const membershipVenue = Array.isArray(membership.venue) ? membership.venue[0] : membership.venue;
  return membershipUser?.id === user.id && membershipVenue?.id === venueId;
});


const roleLink = role === 'owner'
  ? db.tx.venues[venueId].link({ ownerUsers: [user.id] }).unlink({ managerUsers: [user.id] })
  : db.tx.venues[venueId].link({ managerUsers: [user.id] }).unlink({ ownerUsers: [user.id] });
if (existing) {
  await db.transact([
    db.tx.memberships[existing.id].update({ role, status: 'active' }),
    roleLink,
  ]);
  console.log(`Activated existing ${role} membership for venue ${venueId}.`);
} else {
  const membershipId = randomUUID();
  await db.transact([
    db.tx.memberships[membershipId]
      .update({ role, status: 'active', createdAt: now })
      .link({ user: user.id, venue: venueId, organization: organization.id }),
    roleLink,
  ]);
  console.log(`Created ${role} membership for venue ${venueId}.`);
}
