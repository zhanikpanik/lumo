export function commandVersionRepair(currentVersion, maxClaimedVersion) {
  const validVersion = Number.isSafeInteger(currentVersion) && currentVersion >= 0;
  const normalizedVersion = validVersion ? currentVersion : 0;
  const hasClaim = Number.isSafeInteger(maxClaimedVersion) && maxClaimedVersion >= 0;
  const nextVersion = hasClaim
    ? Math.max(normalizedVersion, maxClaimedVersion + 1)
    : normalizedVersion;

  return {
    nextVersion,
    needsRepair: !validVersion || nextVersion !== normalizedVersion,
    staleClaim: hasClaim && maxClaimedVersion >= normalizedVersion,
  };
}

export const commandVersionResources = [
  { entity: 'venues', resourceType: 'venue', versionField: 'version' },
  { entity: 'tables', resourceType: 'table', versionField: 'version' },
  { entity: 'shifts', resourceType: 'shift', versionField: 'version' },
  { entity: 'orders', resourceType: 'order', versionField: 'version' },
  { entity: 'employees', resourceType: 'employee', versionField: 'version' },
  { entity: 'employeePinCredentials', resourceType: 'employee-pin-credential', versionField: 'credentialsVersion' },
  { entity: 'cashMovements', resourceType: 'cash-movement', versionField: 'version' },
  { entity: 'products', resourceType: 'product', versionField: 'version' },
  { entity: 'stockItems', resourceType: 'stock-item', versionField: 'version' },
  { entity: 'deliveryDocuments', resourceType: 'delivery-document', versionField: 'version' },
  { entity: 'writeOffDocuments', resourceType: 'write-off-document', versionField: 'version' },
  { entity: 'transferDocuments', resourceType: 'transfer-document', versionField: 'version' },
  { entity: 'inventorySessions', resourceType: 'inventory-session', versionField: 'version' },
  { entity: 'venueDailyStats', resourceType: 'analytics-day', versionField: 'version' },
];

export function planCommandVersionRepairs(data) {
  const maxClaimedVersion = new Map();
  for (const claim of data.commandClaims ?? []) {
    if (!Number.isSafeInteger(claim.expectedVersion) || claim.expectedVersion < 0) continue;
    const key = `${claim.resourceType}:${claim.resourceId}`;
    maxClaimedVersion.set(key, Math.max(maxClaimedVersion.get(key) ?? -1, claim.expectedVersion));
  }

  return commandVersionResources.flatMap(({ entity, resourceType, versionField }) =>
    (data[entity] ?? []).flatMap((record) => {
      const claimedVersion = maxClaimedVersion.get(`${resourceType}:${record.id}`);
      const repair = commandVersionRepair(record[versionField], claimedVersion);
      return repair.needsRepair
        ? [{ entity, record, versionField, nextVersion: repair.nextVersion, staleClaim: repair.staleClaim }]
        : [];
    }),
  );
}
