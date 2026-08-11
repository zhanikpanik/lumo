/** JSON line shape sent to Postgres RPC (snake_case keys). */
export type ConsumptionLineRpc = {
  order_item_id: string;
  product_id: string;
  quantity: number;
  modifier_ids: string[];
};

export type FinalizeOrderConsumptionPayload = {
  venueId: string;
  orderId: string;
  occurredAt: string;
  /** Client-side outbox dedupe; server idempotency is by order_id. */
  idempotencyKey: string;
  lines: ConsumptionLineRpc[];
  shiftId?: string | null;
  /** When true (default), RPC returns insufficient_stock if stock_items would go negative. */
  strictInsufficientStock?: boolean;
};

export type FinalizeConsumptionResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; error: string; detail?: Record<string, unknown> };

export type RefundOrderPayload = {
  venueId: string;
  orderId: string;
  shiftId?: string | null;
  actorUserId?: string | null;
  reason?: string | null;
  occurredAt?: string;
};

export type RefundOrderResult =
  | {
      ok: true;
      duplicate: boolean;
      payment_method?: string;
      payment_amount?: number;
      reversed_movements?: number;
    }
  | { ok: false; error: string; detail?: Record<string, unknown> };

export type CancelRefundPayload = {
  venueId: string;
  orderId: string;
  actorUserId?: string | null;
  occurredAt?: string;
};

export type CancelRefundResult =
  | {
      ok: true;
      duplicate: boolean;
      payment_method?: string;
      payment_amount?: number;
      restored_movements?: number;
    }
  | { ok: false; error: string; detail?: Record<string, unknown> };

export type ConsumptionOutboxEvent = {
  idempotencyKey: string;
  payload: FinalizeOrderConsumptionPayload;
  createdAt: string;
  retries: number;
  lastError?: string;
  /** Structured detail from the last failed RPC response (server-side context). */
  lastDetail?: Record<string, unknown>;
};

export type ConsumptionDeadLetterStatus = 'open' | 'acknowledged' | 'resolved';

export type ConsumptionDeadLetter = {
  idempotency_key: string;
  venue_id: string;
  order_id: string | null;
  shift_id: string | null;
  payload: FinalizeOrderConsumptionPayload;
  retries: number;
  last_error: string | null;
  status: ConsumptionDeadLetterStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  last_seen_at: string;
};

export type RecordDeadLetterPayload = {
  venueId: string;
  idempotencyKey: string;
  payload: FinalizeOrderConsumptionPayload;
  retries: number;
  lastError?: string | null;
};

export type DeadLetterResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; error: string; detail?: Record<string, unknown> };

export const saleConsumptionIdempotencyKey = (orderId: string) => `${orderId}:sale_consumption`;
