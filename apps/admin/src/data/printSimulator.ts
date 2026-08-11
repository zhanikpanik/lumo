import type { PrintAdapter, PrintOutcome, PrintPayload } from '@lumo/data';

export function createAdminSimulatorPrintAdapter(
  options: { latencyMs?: number; alwaysOutcome?: PrintOutcome } = {},
): PrintAdapter {
  const { latencyMs = 200, alwaysOutcome } = options;

  return {
    async print(payload: PrintPayload): Promise<PrintOutcome> {
      const delay = latencyMs + Math.random() * 100;
      await new Promise((resolve) => setTimeout(resolve, delay));

      const outcome = alwaysOutcome ?? 'printed';
      console.log(
        `[AdminPrintSim] Ticket ${payload.ticketId} | order #${payload.orderNumber} | ` +
        `${payload.snapshot.kind} | ${payload.snapshot.lines.length} lines | ` +
        `attempt ${payload.attempt} → ${outcome}`,
      );
      return outcome;
    },
  };
}
