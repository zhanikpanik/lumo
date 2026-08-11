import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateFinancialContributions,
  contributionDay,
  runDetachedProjection,
} from './analytics-projector.mjs';

const contributions = [
  {
    contributionKey: 'venue:refund',
    kind: 'refund',
    revenueDeltaTiyin: -4_000,
    foodCostDeltaTiyin: -1_200,
    cashDeltaTiyin: -4_000,
    occurredAt: '2026-08-10T19:00:00.000Z',
  },
  {
    contributionKey: 'venue:sale',
    kind: 'sale',
    revenueDeltaTiyin: 12_000,
    foodCostDeltaTiyin: 3_500,
    cashDeltaTiyin: 12_000,
    occurredAt: '2026-08-10T18:30:00.000Z',
  },
  {
    contributionKey: 'venue:card-sale',
    kind: 'sale',
    revenueDeltaTiyin: 8_000,
    foodCostDeltaTiyin: 2_000,
    cashDeltaTiyin: 0,
    occurredAt: '2026-08-10T20:00:00.000Z',
  },
];

test('financial contribution replay produces one deterministic daily aggregate', () => {
  const first = aggregateFinancialContributions(contributions);
  const reordered = aggregateFinancialContributions([...contributions].reverse());
  assert.deepEqual(first, reordered);
  assert.deepEqual(
    {
      revenueTiyin: first.revenueTiyin,
      orderCount: first.orderCount,
      foodCostTiyin: first.foodCostTiyin,
      cashExpenseTiyin: first.cashExpenseTiyin,
      sourceCount: first.sourceCount,
    },
    {
      revenueTiyin: 16_000,
      orderCount: 2,
      foodCostTiyin: 4_300,
      cashExpenseTiyin: 0,
      sourceCount: 3,
    },
  );
});

test('contribution day follows the venue timezone rather than UTC', () => {
  assert.equal(contributionDay('2026-08-10T19:00:00.000Z', 'Asia/Bishkek'), '2026-08-11');
});

test('a projection outage is reported asynchronously and cannot reject payment', async () => {
  let reported;
  runDetachedProjection(
    async () => { throw new Error('analytics unavailable'); },
    (error) => { reported = error; },
  );
  assert.equal(reported, undefined);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(reported?.message ?? '', /analytics unavailable/);
});
