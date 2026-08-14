import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRequestHash, runInstantCommand } from './instant-command-runner.mjs';

const chainCollection = new Proxy({}, {
  get: (_target, id) => ({
    update: (fields) => ({
      link: (links) => ({ id, fields, links }),
    }),
  }),
});

test('preflight combines replay lookup and skips domain build', async () => {
  const payload = { orderId: 'order-1' };
  let query;
  let built = false;
  const db = {
    query: async (value) => {
      query = value;
      return {
        orders: [{ id: 'order-1' }],
        commandOperations: [{
          kind: 'add-order-line',
          requestHash: canonicalRequestHash(payload),
          status: 'committed',
          resultJson: JSON.stringify({ orderItemId: 'item-1' }),
        }],
      };
    },
  };

  const result = await runInstantCommand({
    db,
    operationId: 'operation-1',
    venueId: 'venue-1',
    kind: 'add-order-line',
    payload,
    preflight: { orders: { $: { where: { id: 'order-1' }, limit: 1 } } },
  }, async () => {
    built = true;
    throw new Error('build must not run for a replay');
  });

  assert.deepEqual(result, { orderItemId: 'item-1' });
  assert.equal(built, false);
  assert.deepEqual(query.orders.$.where, { id: 'order-1' });
  assert.deepEqual(query.commandOperations.$.where, { operationKey: 'venue-1:operation-1' });
});

test('preflight data is reused by the domain build', async () => {
  const transactions = [];
  const db = {
    query: async () => ({
      orders: [{ id: 'order-1', version: 3 }],
      commandOperations: [],
    }),
    tx: {
      commandOperations: chainCollection,
      commandClaims: chainCollection,
    },
    transact: async (steps) => { transactions.push(steps); },
  };

  const result = await runInstantCommand({
    db,
    operationId: 'operation-2',
    venueId: 'venue-1',
    kind: 'add-order-line',
    payload: { orderId: 'order-1' },
    preflight: { orders: { $: { where: { id: 'order-1' }, limit: 1 } } },
  }, async (_command, references) => {
    assert.deepEqual(references.orders, [{ id: 'order-1', version: 3 }]);
    return { claims: [], steps: [{ effect: 'line-added' }], result: { orderItemId: 'item-2' } };
  });

  assert.deepEqual(result, { orderItemId: 'item-2' });
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].length, 2);
  assert.deepEqual(transactions[0][1], { effect: 'line-added' });
});
