export interface Category {
  id: string;
  name: string;
  colorHex: string;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  hasModifiers?: boolean;
}

export interface Modifier {
  id: string;
  name: string;
  price: number;
}

export interface OrderItem {
  id: string;
  product: Product;
  quantity: number;
  modifiers: Modifier[];
  comment?: string;
}

export type OrderStatus = 'active' | 'paid' | 'alert' | 'cancelled';

export type OrderSource = 'pos' | 'glovo' | 'yandex_eda';

export interface Order {
  id: string;
  number: string;
  status: OrderStatus;
  source?: OrderSource;
  externalOrderId?: string;
  waiter: string;
  openedAt: string;  // ISO string
  closedAt?: string;  // ISO string, set when paid/cancelled
  zone: string;
  type: string;
  totalAmount: number;
  tableNumber: string;
  tableId: string;       // links to FloorTable.id
  guestCount: number;
  items: OrderItem[];
  isQuickCheck?: boolean; // "Быстрый чек" — no table
  sentToKitchen?: boolean; // order sent to kitchen printer
  closeReason?: string;   // set when closed without payment
  comment?: string;       // order-level comment
  hasNote?: boolean;
  hasAlert?: boolean;
  hasEdit?: boolean;
}

export type TableStatus = 'free' | 'occupied' | 'reserved';

export interface Table {
  id: string;
  number: string;
  status: TableStatus;
  capacity: number;
  zone: string;
  currentOrderId?: string;
  amount?: number;
  timeSeated?: string;
}

export type ActiveAction = 'modifiers' | 'quantity' | 'course' | 'combo' | 'move' | 'comment' | 'delete' | null;

export * from './inventory';

export interface Shift {
  id: string;
  cashier: string;
  openedAt: Date;
  closedAt?: Date;
  startingCash: number;
  /** Physical cash counted when closing shift (set on close) */
  countedCash?: number;
  /** Server-calculated expected cash in drawer */
  expectedCash?: number;
  /** countedCash - expectedCash */
  cashDifference?: number;
  /** Sum of collection movements in current shift */
  cashCollectionsTotal?: number;
  /** Sum of float_in cash movements in current shift */
  cashFloatIn?: number;
  /** Sum of float_out cash movements in current shift */
  cashFloatOut?: number;
  // Running totals (updated on each payment)
  totalOrders: number;
  totalRevenue: number;
  cashPayments: number;
  cashTotal: number;
  cardPayments: number;
  cardTotal: number;
  otherPayments: number;
  otherTotal: number;
}
