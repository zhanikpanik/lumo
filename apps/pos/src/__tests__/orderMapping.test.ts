/**
 * Order mapping: InstantDB rows → app Order types + sorting.
 *
 * Verifies that the waiter sees correct names, prices, statuses,
 * and that active orders always appear first.
 */
import {
  mapOrderRow,
  mapAndSortOrders,
  sortOrders,
  type InstantOrderRow,
} from '../utils/orderMapping';
import type { Order } from '../types';

// ── Helpers ───────────────────────────────────────────────

function makeRow(overrides?: Partial<InstantOrderRow>): InstantOrderRow {
  return {
    id: 'ord-1',
    openedAt: '2025-01-15T10:00:00Z',
    ...overrides,
  };
}

// ── mapOrderRow ───────────────────────────────────────────

describe('mapOrderRow', () => {
  it('maps basic fields', () => {
    const order = mapOrderRow(makeRow({
      number: 'A-42',
      status: 'active',
      source: 'pos',
      ownerEmployee: { displayName: 'Айжан' },
      zoneName: 'Зал',
      orderType: 'Общий',
      totalAmountTiyin: 35000,
      tableNumber: '5',
      table: [{ id: 'table-5' }],
    }));

    expect(order.number).toBe('A-42');
    expect(order.status).toBe('active');
    expect(order.waiter).toBe('Айжан');
    expect(order.zone).toBe('Зал');
    expect(order.totalAmount).toBe(35000);
    expect(order.tableNumber).toBe('5');
    expect(order.tableId).toBe('table-5');
  });

  it('defaults missing fields to safe values', () => {
    const order = mapOrderRow(makeRow());

    expect(order.number).toBe('');
    expect(order.status).toBe('active');
    expect(order.source).toBe('pos');
    expect(order.waiter).toBe('Кассир');
    expect(order.zone).toBe('');
    expect(order.type).toBe('Общий');
    expect(order.totalAmount).toBe(0);
    expect(order.tableNumber).toBe('');
    expect(order.tableId).toBe('');
    expect(order.isQuickCheck).toBe(false);
  });

  it('maps items with product name from snapshot or relation', () => {
    const order = mapOrderRow(makeRow({
      items: [
        { id: 'i1', productName: 'Латте (snapshot)', productPriceTiyin: 15000, quantity: 2 },
        { id: 'i2', product: { id: 'p2', name: 'Капучино', priceTiyin: 18000 }, quantity: 1 },
      ],
    }));

    expect(order.items).toHaveLength(2);
    expect(order.items[0].product.name).toBe('Латте (snapshot)');
    expect(order.items[0].product.price).toBe(15000);
    expect(order.items[0].quantity).toBe(2);
    // Snapshot takes precedence over relation
    expect(order.items[1].product.name).toBe('Капучино');
  });

  it('defaults item quantity to 1', () => {
    const order = mapOrderRow(makeRow({
      items: [{ id: 'i1', product: { id: 'p1', name: 'Test', priceTiyin: 1000 } }],
    }));

    expect(order.items[0].quantity).toBe(1);
  });

  it('maps modifiers', () => {
    const order = mapOrderRow(makeRow({
      items: [{
        id: 'i1',
        product: { id: 'p1', name: 'Латте', priceTiyin: 15000 },
        modifiers: [
          { id: 'm1', name: 'Овсяное молоко', priceTiyin: 3000 },
          { id: 'm2', priceTiyin: 0 },  // missing name
        ],
      }],
    }));

    expect(order.items[0].modifiers).toHaveLength(2);
    expect(order.items[0].modifiers[0]).toEqual({ id: 'm1', name: 'Овсяное молоко', price: 3000 });
    expect(order.items[0].modifiers[1]).toEqual({ id: 'm2', name: '', price: 0 });
  });
});

// ── sortOrders ────────────────────────────────────────────

describe('sortOrders', () => {
  it('active orders come before paid', () => {
    const orders: Order[] = [
      { id: '1', number: '', status: 'paid', waiter: '', openedAt: '2025-01-15T10:00:00Z', zone: '', type: '', totalAmount: 0, tableNumber: '', tableId: '', guestCount: 0, items: [] },
      { id: '2', number: '', status: 'active', waiter: '', openedAt: '2025-01-15T10:00:00Z', zone: '', type: '', totalAmount: 0, tableNumber: '', tableId: '', guestCount: 0, items: [] },
    ];

    const sorted = sortOrders(orders);
    expect(sorted[0].status).toBe('active');
    expect(sorted[1].status).toBe('paid');
  });

  it('cancelled orders come last', () => {
    const orders: Order[] = [
      { id: '1', number: '', status: 'cancelled', waiter: '', openedAt: '2025-01-15T10:00:00Z', zone: '', type: '', totalAmount: 0, tableNumber: '', tableId: '', guestCount: 0, items: [] },
      { id: '2', number: '', status: 'active', waiter: '', openedAt: '2025-01-15T10:00:00Z', zone: '', type: '', totalAmount: 0, tableNumber: '', tableId: '', guestCount: 0, items: [] },
      { id: '3', number: '', status: 'paid', waiter: '', openedAt: '2025-01-15T10:00:00Z', zone: '', type: '', totalAmount: 0, tableNumber: '', tableId: '', guestCount: 0, items: [] },
    ];

    const sorted = sortOrders(orders);
    expect(sorted.map((o) => o.status)).toEqual(['active', 'paid', 'cancelled']);
  });

  it('alert orders are grouped with active (same priority)', () => {
    const orders: Order[] = [
      { id: '1', number: '', status: 'alert', waiter: '', openedAt: '2025-01-15T10:00:00Z', zone: '', type: '', totalAmount: 0, tableNumber: '', tableId: '', guestCount: 0, items: [] },
      { id: '2', number: '', status: 'active', waiter: '', openedAt: '2025-01-15T10:00:00Z', zone: '', type: '', totalAmount: 0, tableNumber: '', tableId: '', guestCount: 0, items: [] },
    ];

    const sorted = sortOrders(orders);
    // Both are priority 0 — order within group depends on date
    expect(sorted.every((o) => o.status === 'alert' || o.status === 'active')).toBe(true);
  });

  it('within same status group, newest first', () => {
    const orders: Order[] = [
      { id: 'old', number: '', status: 'active', waiter: '', openedAt: '2025-01-15T10:00:00Z', zone: '', type: '', totalAmount: 0, tableNumber: '', tableId: '', guestCount: 0, items: [] },
      { id: 'new', number: '', status: 'active', waiter: '', openedAt: '2025-01-15T12:00:00Z', zone: '', type: '', totalAmount: 0, tableNumber: '', tableId: '', guestCount: 0, items: [] },
    ];

    const sorted = sortOrders(orders);
    expect(sorted[0].id).toBe('new');
    expect(sorted[1].id).toBe('old');
  });

  it('does not mutate the original array', () => {
    const orders: Order[] = [
      { id: '1', number: '', status: 'paid', waiter: '', openedAt: '2025-01-15T10:00:00Z', zone: '', type: '', totalAmount: 0, tableNumber: '', tableId: '', guestCount: 0, items: [] },
      { id: '2', number: '', status: 'active', waiter: '', openedAt: '2025-01-15T10:00:00Z', zone: '', type: '', totalAmount: 0, tableNumber: '', tableId: '', guestCount: 0, items: [] },
    ];
    const original = [...orders];

    sortOrders(orders);
    expect(orders).toEqual(original);
  });
});

// ── mapAndSortOrders ──────────────────────────────────────

describe('mapAndSortOrders', () => {
  it('returns empty array for empty input', () => {
    expect(mapAndSortOrders([])).toEqual([]);
  });

  it('maps and sorts in one pass', () => {
    const rows: InstantOrderRow[] = [
      makeRow({ id: 'paid-1', status: 'paid', openedAt: '2025-01-15T10:00:00Z' }),
      makeRow({ id: 'active-1', status: 'active', openedAt: '2025-01-15T11:00:00Z' }),
      makeRow({ id: 'cancelled-1', status: 'cancelled', openedAt: '2025-01-15T09:00:00Z' }),
    ];

    const result = mapAndSortOrders(rows);
    expect(result.map((o) => o.id)).toEqual(['active-1', 'paid-1', 'cancelled-1']);
  });
});
