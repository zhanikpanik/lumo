import { createHash } from 'node:crypto';
import { canonicalJson, venueDay } from '@lumo/data';
import { runInstantCommand } from './instant-command-runner.mjs';

const PAGE_SIZE = 250;
const MAX_CONFLICT_RETRIES = 5;

export const ANALYTICS_PROJECTION_POLICY = Object.freeze({
  sourceRetention: 'operational-lifetime',
  checkpointRetention: 'source-lifetime',
  freshnessSloMs: 5 * 60_000,
  rebuildMode: 'full-financial-contribution-replay',
});

function deterministicUuid(kind, value) {
  const hex = createHash('sha256').update(`${kind}:${value}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function linkedId(value) {
  if (Array.isArray(value)) return value[0]?.id ?? null;
  return value?.id ?? null;
}

function safeInteger(value, name) {
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be a safe integer`);
  return value;
}

export function contributionDay(occurredAt, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(occurredAt));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function aggregateFinancialContributions(contributions) {
  const ordered = [...contributions].sort((left, right) =>
    String(left.contributionKey).localeCompare(String(right.contributionKey)));
  const aggregate = {
    revenueTiyin: 0,
    orderCount: 0,
    foodCostTiyin: 0,
    cashExpenseTiyin: 0,
  };
  const sourceRows = [];
  for (const contribution of ordered) {
    const revenueDeltaTiyin = safeInteger(contribution.revenueDeltaTiyin, 'revenueDeltaTiyin');
    const foodCostDeltaTiyin = safeInteger(contribution.foodCostDeltaTiyin, 'foodCostDeltaTiyin');
    const cashDeltaTiyin = safeInteger(contribution.cashDeltaTiyin, 'cashDeltaTiyin');
    aggregate.revenueTiyin += revenueDeltaTiyin;
    aggregate.foodCostTiyin += foodCostDeltaTiyin;
    if (contribution.kind === 'sale') aggregate.orderCount += 1;
    sourceRows.push({
      contributionKey: contribution.contributionKey,
      kind: contribution.kind,
      revenueDeltaTiyin,
      foodCostDeltaTiyin,
      cashDeltaTiyin,
      occurredAt: contribution.occurredAt,
    });
  }
  for (const [name, value] of Object.entries(aggregate)) safeInteger(value, name);
  return {
    ...aggregate,
    sourceCount: ordered.length,
    sourceHash: createHash('sha256').update(canonicalJson(sourceRows)).digest('hex'),
  };
}

async function queryAll(db, namespace, queryForPage) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await db.query({ [namespace]: queryForPage(offset) });
    const page = result[namespace];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function venueRecord(db, venueId) {
  const result = await db.query({ venues: { $: { where: { id: venueId }, limit: 1 } } });
  const venue = result.venues[0];
  if (!venue) throw new Error('Venue was not found');
  if (typeof venue.timeZone !== 'string' || venue.timeZone.length === 0) {
    throw new Error('Venue timezone is required for analytics projection');
  }
  return venue;
}

async function contributionsForDay(db, venueId, timeZone, day) {
  const bounds = venueDay(timeZone, day);
  return queryAll(db, 'financialContributions', (offset) => ({
    $: {
      where: {
        'venue.id': venueId,
        occurredAt: { $gte: bounds.start, $lt: bounds.end },
      },
      order: { occurredAt: 'asc' },
      limit: PAGE_SIZE,
      offset,
    },
  }));
}

async function statsForDay(db, venueId, day) {
  const result = await db.query({
    venueDailyStats: {
      $: { where: { 'venue.id': venueId, day }, limit: 2 },
    },
  });
  if (result.venueDailyStats.length > 1) {
    throw new Error(`Multiple analytics rows exist for ${venueId}:${day}`);
  }
  return result.venueDailyStats[0] ?? null;
}

function checkpointStep(db, contribution, venueId, day, sourceHash, dayVersion, statsId, appliedAt) {
  return db.tx.analyticsProjectionCheckpoints[
    deterministicUuid('analytics-projection-checkpoint', contribution.contributionKey)
  ]
    .update({
      contributionKey: contribution.contributionKey,
      venueId,
      day,
      sourceHash,
      dayVersion,
      appliedAt,
    })
    .link({ venue: venueId, contribution: contribution.id, dailyStats: statsId });
}

async function recomputeDay(db, {
  venueId,
  timeZone,
  day,
  operationId,
  checkpointContribution = null,
}) {
  for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt += 1) {
    const contributions = await contributionsForDay(db, venueId, timeZone, day);
    const aggregate = aggregateFinancialContributions(contributions);
    const current = await statsForDay(db, venueId, day);
    const statsId = current?.id ?? deterministicUuid('venue-daily-stats', `${venueId}:${day}`);
    const currentVersion = Number.isSafeInteger(current?.version) ? current.version : 0;
    const nextVersion = current?.sourceHash === aggregate.sourceHash ? currentVersion : currentVersion + 1;
    const appliedAt = new Date().toISOString();

    try {
      return await runInstantCommand({
        db,
        operationId,
        venueId,
        kind: 'project-financial-contributions',
        payload: { day, sourceHash: aggregate.sourceHash, checkpointKey: checkpointContribution?.contributionKey ?? null },
      }, async () => {
        const changes = current?.sourceHash === aggregate.sourceHash
          ? []
          : [
              db.tx.venueDailyStats[statsId]
                .update({
                  statsKey: `${venueId}:${day}`,
                  venueId,
                  day,
                  revenueTiyin: aggregate.revenueTiyin,
                  orderCount: aggregate.orderCount,
                  foodCostTiyin: aggregate.foodCostTiyin,
                  cashExpenseTiyin: aggregate.cashExpenseTiyin,
                  sourceCount: aggregate.sourceCount,
                  sourceHash: aggregate.sourceHash,
                  version: nextVersion,
                  updatedAt: appliedAt,
                })
                .link({ venue: venueId }),
            ];
        if (checkpointContribution) {
          changes.push(checkpointStep(
            db,
            checkpointContribution,
            venueId,
            day,
            aggregate.sourceHash,
            nextVersion,
            statsId,
            appliedAt,
          ));
        }
        return {
          claims: current?.sourceHash === aggregate.sourceHash
            ? []
            : [{ resourceType: 'analytics-day', resourceId: day, expectedVersion: currentVersion }],
          steps: changes,
          result: { day, statsId, dayVersion: nextVersion, ...aggregate },
        };
      });
    } catch (error) {
      if (error?.code !== 'resource_conflict' || attempt === MAX_CONFLICT_RETRIES - 1) throw error;
    }
  }
  throw new Error('Analytics projection retry limit exhausted');
}

export async function projectFinancialContributionByKey(db, venueId, contributionKey) {
  const [venue, contributionResult, checkpointResult] = await Promise.all([
    venueRecord(db, venueId),
    db.query({
      financialContributions: {
        $: { where: { contributionKey }, limit: 1 },
        venue: {},
      },
    }),
    db.query({
      analyticsProjectionCheckpoints: { $: { where: { contributionKey }, limit: 1 } },
    }),
  ]);
  if (checkpointResult.analyticsProjectionCheckpoints[0]) {
    return { status: 'already_projected', contributionKey };
  }
  const contribution = contributionResult.financialContributions[0];
  if (!contribution || linkedId(contribution.venue) !== venueId) {
    throw new Error('Financial contribution was not found for venue');
  }
  const day = contributionDay(contribution.occurredAt, venue.timeZone);
  return recomputeDay(db, {
    venueId,
    timeZone: venue.timeZone,
    day,
    operationId: `analytics-contribution:${contributionKey}`,
    checkpointContribution: contribution,
  });
}

export async function rebuildVenueAnalytics(db, venueId, rebuildId) {
  const venue = await venueRecord(db, venueId);
  const [contributions, existingStats] = await Promise.all([
    queryAll(db, 'financialContributions', (offset) => ({
      $: {
        where: { 'venue.id': venueId },
        order: { occurredAt: 'asc' },
        limit: PAGE_SIZE,
        offset,
      },
    })),
    queryAll(db, 'venueDailyStats', (offset) => ({
      $: { where: { 'venue.id': venueId }, order: { day: 'asc' }, limit: PAGE_SIZE, offset },
    })),
  ]);
  const contributionsByDay = new Map();
  for (const contribution of contributions) {
    const day = contributionDay(contribution.occurredAt, venue.timeZone);
    const rows = contributionsByDay.get(day) ?? [];
    rows.push(contribution);
    contributionsByDay.set(day, rows);
  }
  const days = [...new Set([
    ...contributionsByDay.keys(),
    ...existingStats.map((stats) => stats.day),
  ])].sort();
  const projected = new Map();
  for (const day of days) {
    projected.set(day, await recomputeDay(db, {
      venueId,
      timeZone: venue.timeZone,
      day,
      operationId: `analytics-rebuild:${rebuildId}:${day}`,
    }));
  }

  const appliedAt = new Date().toISOString();
  const checkpointSteps = contributions.map((contribution) => {
    const day = contributionDay(contribution.occurredAt, venue.timeZone);
    const result = projected.get(day);
    return checkpointStep(
      db,
      contribution,
      venueId,
      day,
      result.sourceHash,
      result.dayVersion,
      result.statsId,
      appliedAt,
    );
  });
  for (let offset = 0; offset < checkpointSteps.length; offset += 100) {
    await db.transact(checkpointSteps.slice(offset, offset + 100));
  }

  const sourceHash = createHash('sha256')
    .update(canonicalJson([...contributionsByDay.entries()].map(([day, rows]) => ({
      day,
      sourceHash: aggregateFinancialContributions(rows).sourceHash,
    }))))
    .digest('hex');
  return { venueId, sourceCount: contributions.length, dayCount: days.length, sourceHash, rebuiltAt: appliedAt };
}

export function runDetachedProjection(project, onError = console.error) {
  queueMicrotask(() => {
    Promise.resolve().then(project).catch(onError);
  });
}
