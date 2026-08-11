/**
 * Immutable kitchen ticket model. A ticket is a frozen snapshot of order items
 * sent to the kitchen printer. Once transmitted, its content never changes.
 * Quantity additions and cancellations create separate tickets.
 */

export type TicketKind = 'initial' | 'addition' | 'cancellation';
export type TicketStatus = 'queued' | 'printing' | 'printed' | 'failed' | 'uncertain';

export interface TicketLineItem {
  name: string;
  quantity: number;
  modifiers: string[];
  comment?: string;
}

export interface TicketSnapshot {
  kind: TicketKind;
  lines: TicketLineItem[];
}

/** Wire format passed to a physical or simulated printer. */
export interface PrintPayload {
  ticketId: string;
  orderNumber: string;
  table: string;
  snapshot: TicketSnapshot;
  attempt: number;
  createdAt: string;
}

export type PrintOutcome = 'printed' | 'failed' | 'uncertain';

/**
 * Platform-specific printer driver. Each implementation receives immutable
 * ticket payloads and reports an outcome. A simulator is the default for
 * development; native implementations wrap Bluetooth / Wi-Fi printer SDKs.
 */
export interface PrintAdapter {
  print(payload: PrintPayload): Promise<PrintOutcome>;
}
