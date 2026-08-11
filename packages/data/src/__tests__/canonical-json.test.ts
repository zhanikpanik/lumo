import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, CanonicalJsonError } from '../canonical-json.js';

test('equivalent request payloads have identical canonical JSON', () => {
  const left = { operationId: 'op-1', payload: { quantity: 2, modifiers: ['oat', 'hot'] } };
  const right = { payload: { modifiers: ['oat', 'hot'], quantity: 2 }, operationId: 'op-1' };

  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(
    canonicalJson(left),
    '{"operationId":"op-1","payload":{"modifiers":["oat","hot"],"quantity":2}}',
  );
});

test('array order remains part of the request identity', () => {
  assert.notEqual(canonicalJson({ values: [1, 2] }), canonicalJson({ values: [2, 1] }));
});

test('rejects values that cannot be represented deterministically', () => {
  assert.throws(() => canonicalJson({ amount: Number.NaN }), CanonicalJsonError);
  assert.throws(() => canonicalJson({ missing: undefined }), CanonicalJsonError);
  assert.throws(() => canonicalJson(new Date()), CanonicalJsonError);

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), CanonicalJsonError);
});
