import assert from 'node:assert/strict';
import test from 'node:test';
import { cashBalanceTiyin, cashMovementDeltaTiyin } from '../money.js';
import { selectCurrentOpenShift } from '../commands/shifts.js';

test('cash balance follows signed POS ledger movements', () => {
  const balance = cashBalanceTiyin(1_000, [
    { movementType: 'sale', amountTiyin: 60_000 },
    { movementType: 'refund', amountTiyin: -60_000 },
    { movementType: 'cancel_refund', amountTiyin: 60_000 },
    { movementType: 'float_in', amountTiyin: 10_000 },
    { movementType: 'float_out', amountTiyin: 5_000 },
    { movementType: 'collection', amountTiyin: 2_000 },
  ]);

  assert.equal(balance, 64_000);
});

test('cash out types are deductions even when stored as positive amounts', () => {
  assert.equal(cashMovementDeltaTiyin({ movementType: 'float_out', amountTiyin: 500 }), -500);
  assert.equal(cashMovementDeltaTiyin({ movementType: 'collection', amountTiyin: 700 }), -700);
});

test('current shift ignores contradictory closed rows and picks the latest valid open shift', () => {
  const current = selectCurrentOpenShift([
    { id: 'closed-status', status: 'closed', openedAt: '2026-08-20T08:00:00Z' },
    { id: 'contradictory', status: 'open', openedAt: '2026-08-21T08:00:00Z', closedAt: '2026-08-21T16:00:00Z' },
    { id: 'older-valid', status: 'open', openedAt: '2026-08-19T08:00:00Z' },
    { id: 'latest-valid', status: 'open', openedAt: '2026-08-20T08:00:00Z' },
  ]);

  assert.equal(current?.id, 'latest-valid');
});
