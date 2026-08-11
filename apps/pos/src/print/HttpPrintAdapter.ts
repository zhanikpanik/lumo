import type { PrintAdapter, PrintOutcome, PrintPayload } from '@lumo/data';

/**
 * HTTP Print Adapter — sends receipts to the Print Bridge.
 *
 * The bridge runs as a separate Node.js process that converts
 * JSON receipt data to ESC/POS and forwards to the printer via TCP.
 *
 * Configure via EXPO_PUBLIC_PRINT_BRIDGE_URL env var.
 * Falls back to simulator when bridge is unreachable.
 */

export interface BridgeReceiptData {
  title: string;
  subtitle?: string;
  orderNumber: string;
  table?: string;
  waiter?: string;
  date: string;
  lines: Array<{ left: string; right?: string }>;
  total: string;
  paymentMethod?: string;
  footer?: string;
}

/** Map PrintPayload → bridge receipt JSON */
export function payloadToReceipt(
  payload: PrintPayload,
  venueName?: string,
): BridgeReceiptData {
  const lines: BridgeReceiptData['lines'] = [];

  for (const item of payload.snapshot.lines) {
    const qty = item.quantity > 1 ? `${item.quantity} x ` : '';
    lines.push({ left: `${qty}${item.name}`, right: undefined });

    if (item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        lines.push({ left: `  + ${mod}` });
      }
    }
    if (item.comment) {
      lines.push({ left: `  ⌐ ${item.comment}` });
    }
  }

  const kindLabel = payload.snapshot.kind === 'addition'
    ? 'ДОБАВЛЕНИЕ'
    : payload.snapshot.kind === 'cancellation'
    ? 'ОТМЕНА'
    : undefined;

  return {
    title: venueName || 'RESTAURANT',
    subtitle: kindLabel,
    orderNumber: payload.orderNumber,
    table: payload.table || undefined,
    date: new Date(payload.createdAt).toLocaleString('ru-RU'),
    lines,
    total: '', // Kitchen tickets don't show price
    footer: kindLabel === 'ОТМЕНА' ? '!!! ОТМЕНА !!!' : undefined,
  };
}

export interface HttpPrintAdapterOptions {
  bridgeUrl: string;
  venueName?: string;
  timeoutMs?: number;
}

/**
 * Creates a PrintAdapter that sends receipts to the Print Bridge via HTTP.
 * Falls back to 'failed' if bridge is unreachable.
 */
export function createHttpPrintAdapter(
  options: HttpPrintAdapterOptions,
): PrintAdapter {
  const { bridgeUrl, venueName, timeoutMs = 10_000 } = options;

  return {
    async print(payload: PrintPayload): Promise<PrintOutcome> {
      const receipt = payloadToReceipt(payload, venueName);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(`${bridgeUrl}/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(receipt),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text();
          console.error(`[PrintBridge] HTTP ${res.status}: ${body}`);
          return 'failed';
        }

        const result = await res.json() as { bytes?: number };
        console.log(
          `[PrintBridge] Ticket ${payload.ticketId} | order #${payload.orderNumber} | ` +
          `${payload.snapshot.kind} | ${result.bytes} bytes → sent`,
        );
        return 'printed';
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          console.error(`[PrintBridge] Timeout after ${timeoutMs}ms`);
          return 'uncertain';
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[PrintBridge] Error: ${msg}`);
        return 'failed';
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Check if the bridge is reachable */
export async function checkBridgeStatus(bridgeUrl: string): Promise<{
  online: boolean;
  printer?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${bridgeUrl}/status`, { signal: AbortSignal.timeout(3000) });
    return await res.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { online: false, error: msg };
  }
}
