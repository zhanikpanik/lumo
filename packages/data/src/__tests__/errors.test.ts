import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainError, domainErrorFrom, guardActiveOrder, guardShiftState } from '../errors.js';

// ── domainErrorFrom ───────────────────────────────────────

test('maps "unique idempotency" rejection to duplicate_operation', () => {
  const err = domainErrorFrom(new Error('unique idempotency key violation'));
  assert.equal(err.code, 'duplicate_operation');
  assert.ok(err instanceof DomainError);
});

test('maps "permission denied" to permission_denied', () => {
  const err = domainErrorFrom(new Error('Permission denied for table orders'));
  assert.equal(err.code, 'permission_denied');
});

test('maps "not found" to order_not_found', () => {
  const err = domainErrorFrom(new Error('Order not found'));
  assert.equal(err.code, 'order_not_found');
});

test('falls back to provided fallback code for unknown errors', () => {
  const err = domainErrorFrom(new Error('something weird'), 'invalid_state_transition');
  assert.equal(err.code, 'invalid_state_transition');
});

test('falls back to permission_denied by default', () => {
  const err = domainErrorFrom(new Error('unknown'));
  assert.equal(err.code, 'permission_denied');
});

test('passes through DomainError unchanged', () => {
  const original = new DomainError('test', 'order_already_paid');
  const result = domainErrorFrom(original);
  assert.equal(result, original);
});

test('handles string causes', () => {
  const err = domainErrorFrom('permission denied');
  assert.equal(err.code, 'permission_denied');
});

test('handles null/undefined causes', () => {
  const err = domainErrorFrom(null);
  assert.equal(err.code, 'permission_denied');
  assert.ok(err.message.includes('Unknown'));
});

// ── guardActiveOrder ──────────────────────────────────────

test('allows editing an active order', () => {
  assert.equal(guardActiveOrder('active', 'ord-1'), null);
});

test('blocks a paid order', () => {
  const err = guardActiveOrder('paid', 'ord-1');
  assert.ok(err !== null);
  assert.equal(err!.code, 'order_already_paid');
  assert.ok(err!.message.includes('ord-1'));
});

test('blocks a cancelled order', () => {
  const err = guardActiveOrder('cancelled', 'ord-1');
  assert.ok(err !== null);
  assert.equal(err!.code, 'order_already_cancelled');
});

test('allows an alert order (still editable)', () => {
  assert.equal(guardActiveOrder('alert', 'ord-1'), null);
});

// ── guardShiftState ───────────────────────────────────────

test('allows opening when no shift exists', () => {
  assert.equal(guardShiftState(null, 'open'), null);
});

test('blocks opening when shift already exists', () => {
  const err = guardShiftState({ status: 'open' }, 'open');
  assert.ok(err !== null);
  assert.equal(err!.code, 'shift_already_open');
});

test('allows closing an open shift', () => {
  assert.equal(guardShiftState({ status: 'open' }, 'close'), null);
});

test('blocks closing when no shift exists', () => {
  const err = guardShiftState(null, 'close');
  assert.ok(err !== null);
  assert.equal(err!.code, 'shift_not_found');
});

test('blocks closing when shift already closed', () => {
  const err = guardShiftState({ status: 'closed' }, 'close');
  assert.ok(err !== null);
  assert.equal(err!.code, 'shift_already_closed');
});

test('blocks closing undefined shift', () => {
  const err = guardShiftState(undefined, 'close');
  assert.ok(err !== null);
  assert.equal(err!.code, 'shift_not_found');
});
