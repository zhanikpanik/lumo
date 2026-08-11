import type { PrintAdapter, PrintOutcome, PrintPayload } from '@lumo/data';

/**
 * Development printer simulator. Always succeeds with a 200ms delay
 * to mimic real printer latency. Injected into the app layer when no
 * physical printer is available.
 */
export function createSimulatorPrintAdapter(
  options: { latencyMs?: number; alwaysOutcome?: PrintOutcome } = {},
): PrintAdapter {
  const { latencyMs = 200, alwaysOutcome } = options;

  return {
    async print(payload: PrintPayload): Promise<PrintOutcome> {
      const delay = latencyMs + Math.random() * 100;
      await new Promise((resolve) => setTimeout(resolve, delay));

      const outcome = alwaysOutcome ?? 'printed';
      console.log(
        `[PrintSimulator] Ticket ${payload.ticketId} | order #${payload.orderNumber} | ` +
        `${payload.snapshot.kind} | ${payload.snapshot.lines.length} lines | ` +
        `attempt ${payload.attempt} → ${outcome}`,
      );
      return outcome;
    },
  };
}
