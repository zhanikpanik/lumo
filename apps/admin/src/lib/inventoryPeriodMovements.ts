import { getInstantClient } from '@/data/instant';
import type { AdminInventoryPeriodMovementRow } from '@/types/inventoryMovements';

const PAGE_SIZE = 250;

export function formatInventoryMovementPeriodHint(pFrom: string, pTo: string): string {
  const format = (value: string) => new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Справочно: движения с ${format(pFrom)} по ${format(pTo)}`;
}

export async function resolveInventoryMovementWindow(
  sessionId: string,
  warehouseId: string,
): Promise<{ pFrom: string; pTo: string; label: string } | null> {
  const db = getInstantClient();
  const { data: current } = await db.queryOnce({
    inventorySessions: {
      $: { where: { id: sessionId, 'warehouse.id': warehouseId }, limit: 1 },
    },
  });
  const session = current.inventorySessions[0];
  if (!session) return null;
  const pTo = new Date(session.conductedAt).toISOString();
  const { data: previous } = await db.queryOnce({
    inventorySessions: {
      $: {
        where: {
          'warehouse.id': warehouseId,
          status: 'posted',
          conductedAt: { $lt: new Date(pTo) },
        },
        order: { conductedAt: 'desc' },
        limit: 1,
      },
    },
  });
  const previousSession = (previous.inventorySessions ?? [])[0];
  const pFrom = previousSession
    ? new Date(previousSession.conductedAt).toISOString()
    : '1970-01-01T00:00:00.000Z';
  return { pFrom, pTo, label: formatInventoryMovementPeriodHint(pFrom, pTo) };
}

export async function fetchAdminInventoryPeriodMovements(
  venueId: string,
  warehouseId: string,
  pFrom: string,
  pTo: string,
): Promise<Map<string, AdminInventoryPeriodMovementRow>> {
  const db = getInstantClient();
  const output = new Map<string, AdminInventoryPeriodMovementRow>();

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: page } = await db.queryOnce({
      inventoryMovements: {
        $: {
          where: {
            'venue.id': venueId,
            'warehouse.id': warehouseId,
            occurredAt: { $gte: new Date(pFrom), $lt: new Date(pTo) },
          },
          order: { occurredAt: 'asc' },
          limit: PAGE_SIZE,
          offset,
        },
        product: {},
      },
    });
    const rows = page.inventoryMovements ?? [];
    for (const movement of rows) {
      const product = Array.isArray(movement.product) ? movement.product[0] : movement.product;
      if (!product?.id) continue;
      const current = output.get(product.id) ?? {
        product_id: product.id,
        consumption: 0,
        incoming_delivery: 0,
        writeoff_qty: 0,
        transfer_net: 0,
      };
      const quantity = movement.quantityDeltaMilli / 1000;
      if (movement.reason === 'sale' || movement.reason === 'refund' || movement.reason === 'cancel_refund') {
        current.consumption -= quantity;
      } else if (movement.reason.endsWith('_delivery') || movement.reason === 'initial_stock') {
        current.incoming_delivery += quantity;
      } else if (movement.reason.endsWith('_write_off')) {
        current.writeoff_qty -= quantity;
      } else if (movement.reason.endsWith('_transfer')) {
        current.transfer_net += quantity;
      }
      output.set(product.id, current);
    }
    if (rows.length < PAGE_SIZE) break;
  }

  return output;
}

export function mergePeriodMovementsIntoCountRows<
  T extends { id: string; incoming: number; consumption: number; writeoff: number },
>(rows: T[], movements: Map<string, AdminInventoryPeriodMovementRow>): T[] {
  return rows.map((row) => {
    const movement = movements.get(row.id);
    if (!movement) return { ...row };
    return {
      ...row,
      incoming: movement.incoming_delivery + Math.max(movement.transfer_net, 0),
      consumption: movement.consumption,
      writeoff: movement.writeoff_qty + Math.max(-movement.transfer_net, 0),
    };
  });
}
