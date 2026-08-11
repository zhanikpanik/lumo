import { v5 as uuidv5 } from 'uuid';

export type LogicalId = string & { readonly __brand: 'LogicalId' };

const SEGMENT = /^[a-z][a-z0-9-]*$/;
const OPERATION_NAMESPACE = 'bc06127e-7f60-4e15-8498-e3f5a14f0001';

/** Stable, human-readable identifiers for imports, seeds and external mappings. */
export function logicalId(kind: string, slug: string): LogicalId {
  if (!SEGMENT.test(kind) || !SEGMENT.test(slug)) {
    throw new TypeError('Logical ID kind and slug must be lowercase kebab-case');
  }

  return `${kind}:${slug}` as LogicalId;
}

/**
 * Produces a stable UUID for a child entity derived from one logical operation.
 * Retrying the exact command input therefore addresses the same records.
 */
export function deterministicId(kind: string, ...parts: readonly string[]): string {
  if (!SEGMENT.test(kind) || parts.length === 0 || parts.some((part) => part.length === 0)) {
    throw new TypeError('Deterministic ID requires a kebab-case kind and non-empty parts');
  }

  return uuidv5([kind, ...parts].join('\u001F'), OPERATION_NAMESPACE);
}

export const TEST_VENUE_IDS = {
  // Tenancy
  organization:          'bc06127e-7f60-4e15-8498-e3f5a14f0101',
  venue:                 'bc06127e-7f60-4e15-8498-e3f5a14f0102',
  membershipOwner:       'bc06127e-7f60-4e15-8498-e3f5a14f0103',
  membershipManager:     'bc06127e-7f60-4e15-8498-e3f5a14f0108',
  employeeWaiter:        'bc06127e-7f60-4e15-8498-e3f5a14f0104',
  employeePinWaiter:     'bc06127e-7f60-4e15-8498-e3f5a14f0105',
  employeeCashier:       'bc06127e-7f60-4e15-8498-e3f5a14f0109',
  employeePinCashier:    'bc06127e-7f60-4e15-8498-e3f5a14f0110',
  deviceTablet1:         'bc06127e-7f60-4e15-8498-e3f5a14f0106',
  deviceAuthTablet1:     'bc06127e-7f60-4e15-8498-e3f5a14f0107',
  deviceTablet2:         'bc06127e-7f60-4e15-8498-e3f5a14f0111',
  deviceAuthTablet2:     'bc06127e-7f60-4e15-8498-e3f5a14f0112',
  // Catalog
  categoryCoffee:        'bc06127e-7f60-4e15-8498-e3f5a14f0201',
  categoryTea:           'bc06127e-7f60-4e15-8498-e3f5a14f0202',
  productEspresso:       'bc06127e-7f60-4e15-8498-e3f5a14f0301',
  productLatte:          'bc06127e-7f60-4e15-8498-e3f5a14f0302',
  productTea:            'bc06127e-7f60-4e15-8498-e3f5a14f0303',
  productCoffeeBeans:    'bc06127e-7f60-4e15-8498-e3f5a14f0401',
  productMilk:           'bc06127e-7f60-4e15-8498-e3f5a14f0402',
  modGroupMilk:          'bc06127e-7f60-4e15-8498-e3f5a14f0501',
  modifierOatMilk:       'bc06127e-7f60-4e15-8498-e3f5a14f0502',
  recipeEspressoBeans:   'bc06127e-7f60-4e15-8498-e3f5a14f0601',
  recipeLatteBeans:      'bc06127e-7f60-4e15-8498-e3f5a14f0602',
  recipeLatteMilk:       'bc06127e-7f60-4e15-8498-e3f5a14f0603',
  // Floor plan
  zoneMain:              'bc06127e-7f60-4e15-8498-e3f5a14f0701',
  table1:                'bc06127e-7f60-4e15-8498-e3f5a14f0702',
  table2:                'bc06127e-7f60-4e15-8498-e3f5a14f0703',
  // Operations
  shiftOpen:             'bc06127e-7f60-4e15-8498-e3f5a14f0801',
  orderActive:           'bc06127e-7f60-4e15-8498-e3f5a14f0901',
  orderActiveItem:       'bc06127e-7f60-4e15-8498-e3f5a14f0902',
  orderPaid:             'bc06127e-7f60-4e15-8498-e3f5a14f0903',
  orderPaidItem1:        'bc06127e-7f60-4e15-8498-e3f5a14f0904',
  orderPaidItem2:        'bc06127e-7f60-4e15-8498-e3f5a14f0905',
  ticketActive:          'bc06127e-7f60-4e15-8498-e3f5a14f1001',
  ticketPaid:            'bc06127e-7f60-4e15-8498-e3f5a14f1002',
  paymentPaidCash:       'bc06127e-7f60-4e15-8498-e3f5a14f1101',
  cashMovementPaid:      'bc06127e-7f60-4e15-8498-e3f5a14f1201',
  inventoryCoffeeOpening:'bc06127e-7f60-4e15-8498-e3f5a14f1303',
  inventoryMilkOpening:  'bc06127e-7f60-4e15-8498-e3f5a14f1304',
  inventoryCoffeePaid:   'bc06127e-7f60-4e15-8498-e3f5a14f1301',
  inventoryMilkPaid:     'bc06127e-7f60-4e15-8498-e3f5a14f1302',
  fiscalReceiptPaid:     'bc06127e-7f60-4e15-8498-e3f5a14f1401',
  // Reused by the real dev permission scenario and removed by clean seed.
  integrationShift:        'bc06127e-7f60-4e15-8498-e3f5a14f1501',
  integrationOrder:        'bc06127e-7f60-4e15-8498-e3f5a14f1502',
  integrationOrderItem:    'bc06127e-7f60-4e15-8498-e3f5a14f1503',
  integrationTicket:       'bc06127e-7f60-4e15-8498-e3f5a14f1504',
  integrationPayment:      'bc06127e-7f60-4e15-8498-e3f5a14f1505',
} as const;
