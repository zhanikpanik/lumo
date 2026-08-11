import { getInstantClient } from '@/data/instant';

/**
 * Ingredient row matching the existing IngredientListItem contract
 * so WarehousesAdmin can swap data sources without UI changes.
 */
export interface InstantWarehouseIngredient {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  unit: string;
  is_active: boolean;
  workshop_id: string | null;
  workshop_name: string;
  warehouse_breakdown: { warehouse_id: string; warehouse_name: string; quantity: number }[];
}

const EMPTY_STOCK_QUERY = {
  stockItems: { $: { where: { id: '__none__' }, limit: 0 } },
};

export function useInstantWarehouseIngredients(warehouseId: string | null) {
  const db = getInstantClient();

  const query = warehouseId
    ? {
        stockItems: {
          $: { where: { 'warehouse.id': warehouseId } },
          product: {},
          warehouse: {},
        },
      }
    : EMPTY_STOCK_QUERY;

  const result = db.useQuery(query);

  const raw = result.data?.stockItems ?? [];
  const data: InstantWarehouseIngredient[] = raw
    .map((s) => {
      const rec = s as Record<string, unknown>;
      const product = (rec.product ?? {}) as Record<string, unknown>;
      const wh = (rec.warehouse ?? {}) as Record<string, unknown>;

      return {
        id: String(product.id ?? ''),
        name: String(product.name ?? ''),
        price: Number(product.costTiyin ?? 0) / 100,
        stock_quantity: Number(s.quantityMilli ?? 0) / 1000,
        unit: String(s.unit ?? product.unit ?? ''),
        is_active: String(product.status ?? 'active') === 'active',
        workshop_id: null,
        workshop_name: '',
        warehouse_breakdown: [
          {
            warehouse_id: String(wh.id ?? warehouseId ?? ''),
            warehouse_name: String(wh.name ?? ''),
            quantity: Number(s.quantityMilli ?? 0) / 1000,
          },
        ],
      } satisfies InstantWarehouseIngredient;
    })
    .filter((i) => i.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  return { data, isLoading: result.isLoading, error: result.error };
}
