const ADMIN_ROLES = new Set(['owner', 'manager']);

function linkedId(value) {
  const linked = Array.isArray(value) ? value[0] : value;
  return linked?.id ?? null;
}

export function resolveDeviceActivation(memberships, existingVenueId = null) {
  const eligible = memberships
    .filter((membership) => ADMIN_ROLES.has(membership.role))
    .sort((left, right) => {
      const created = String(left.createdAt).localeCompare(String(right.createdAt));
      return created || String(linkedId(left.venue)).localeCompare(String(linkedId(right.venue)));
    });

  if (eligible.length === 0) return { kind: 'forbidden' };
  if (existingVenueId) {
    const membership = eligible.find((candidate) => linkedId(candidate.venue) === existingVenueId);
    return membership ? { kind: 'activate', membership } : { kind: 'forbidden-existing' };
  }
  if (eligible.length === 1) return { kind: 'activate', membership: eligible[0] };
  return { kind: 'select', memberships: eligible };
}

export function resolveAdminMembership(memberships, venueId) {
  return memberships.find(
    (membership) => linkedId(membership.venue) === venueId && ADMIN_ROLES.has(membership.role),
  ) ?? null;
}

export function resolveActivationChallenge(challenge, venueId, now = Date.now()) {
  if (
    !challenge ||
    challenge.status !== 'pending' ||
    !Number.isFinite(Date.parse(challenge.expiresAt)) ||
    Date.parse(challenge.expiresAt) <= now
  ) {
    return { kind: 'invalid' };
  }

  try {
    const venues = JSON.parse(challenge.venuesJson);
    if (!Array.isArray(venues)) return { kind: 'invalid' };
    const venue = venues.find((candidate) =>
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.id === 'string' &&
      typeof candidate.membershipId === 'string' &&
      candidate.id === venueId
    );
    return venue ? { kind: 'allowed', venue } : { kind: 'forbidden' };
  } catch {
    return { kind: 'invalid' };
  }
}
