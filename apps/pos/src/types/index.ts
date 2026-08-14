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
  sourceModifierId?: string;
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
  ownerEmployeeId?: string;
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

export type OrderActionType = 'transfer' | 'waiter' | 'guests' | 'delete' | null;

// ── Notifications ──
export type NotificationType = 'shift_ending' | 'order_stuck' | 'low_stock' | 'sync_error' | 'subscription';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  orderId?: string;
  createdAt: string; // ISO
  read: boolean;
}

export * from './inventory';


// ── Venue layout ──
export interface VenueTable {
  id: string;
  number: string;
  zone: string;
  capacity: number;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  size: string;
}

export interface VenueZone {
  id: string;
  name: string;
  tables: VenueTable[];
  cols: number;
  rows: number;
}

export type VenueType = 'restaurant' | 'takeaway';
