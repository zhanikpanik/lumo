import type { PrintAdapter, PrintPayload, PrintOutcome } from '@lumo/data';
import { createHttpPrintAdapter, checkBridgeStatus } from './HttpPrintAdapter';
import { createSimulatorPrintAdapter } from '../data/printSimulator';

/**
 * Print service — singleton adapter for the POS app.
 *
 * Uses HTTP bridge when EXPO_PUBLIC_PRINT_BRIDGE_URL is configured.
 * Falls back to simulator otherwise.
 *
 * Usage:
 *   import { getPrintAdapter } from '../print/printService';
 *   const adapter = getPrintAdapter();
 *   const outcome = await adapter.print(payload);
 */

let _adapter: PrintAdapter | null = null;

export function getPrintAdapter(): PrintAdapter {
  if (_adapter) return _adapter;

  const bridgeUrl = process.env.EXPO_PUBLIC_PRINT_BRIDGE_URL;

  if (bridgeUrl) {
    console.log(`[PrintService] Using HTTP bridge at ${bridgeUrl}`);
    _adapter = createHttpPrintAdapter({
      bridgeUrl,
      venueName: process.env.EXPO_PUBLIC_VENUE_NAME || 'ALTO COFFEE',
      timeoutMs: 10_000,
    });
  } else {
    console.log('[PrintService] No bridge URL configured, using simulator');
    _adapter = createSimulatorPrintAdapter();
  }

  return _adapter;
}

/** Reset adapter (e.g. after config change) */
export function resetPrintAdapter(): void {
  _adapter = null;
}

/** Check bridge connectivity (returns null when using simulator) */
export async function getBridgeStatus(): Promise<{
  online: boolean;
  printer?: string;
  error?: string;
} | null> {
  const bridgeUrl = process.env.EXPO_PUBLIC_PRINT_BRIDGE_URL;
  if (!bridgeUrl) return null;
  return checkBridgeStatus(bridgeUrl);
}

// ── Convenience: send a kitchen ticket ──────────────────────────

export async function printKitchenTicket(opts: {
  ticketId: string;
  orderNumber: string;
  table?: string;
  snapshot: PrintPayload['snapshot'];
  attempt?: number;
}): Promise<PrintOutcome> {
  const adapter = getPrintAdapter();
  return adapter.print({
    ticketId: opts.ticketId,
    orderNumber: opts.orderNumber,
    table: opts.table ?? '',
    snapshot: opts.snapshot,
    attempt: opts.attempt ?? 1,
    createdAt: new Date().toISOString(),
  });
}

// ── Convenience: send a guest receipt (пречек) ───────────────────

export async function printGuestReceipt(opts: {
  orderNumber: string;
  table?: string;
  waiter?: string;
  items: Array<{ name: string; quantity: number; price: number; modifiers?: string[] }>;
  subtotal: number;
  discount?: number;
  total: number;
}): Promise<PrintOutcome> {
  const adapter = getPrintAdapter();

  const lines = opts.items.map((item) => {
    const qty = item.quantity > 1 ? `${item.quantity} x ` : '';
    const price = `${item.price} с`;
    return {
      name: `${qty}${item.name}`,
      quantity: item.quantity,
      modifiers: item.modifiers ?? [],
      comment: undefined,
    };
  });

  return adapter.print({
    ticketId: `precheck-${opts.orderNumber}-${Date.now()}`,
    orderNumber: opts.orderNumber,
    table: opts.table ?? '',
    snapshot: { kind: 'initial' as const, lines },
    attempt: 1,
    createdAt: new Date().toISOString(),
  });
}
