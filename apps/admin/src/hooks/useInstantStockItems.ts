import { getInstantClient } from '@/data/instant';
import { stockItemsByWarehouseQuery } from '@lumo/data';

export interface InstantStockItem {
  id: string;
  productId: string;
  productName: string;
  quantityMilli: number;
  unit: string;
  updatedAt: string;
}

const EMPTY_STOCK_QUERY = {
  stockItems: { $: { where: { id: '__none__' }, limit: 0 } },
};

export function useInstantStockItems(warehouseId: string | null) {
  const db = getInstantClient();

  const query = warehouseId ? stockItemsByWarehouseQuery(warehouseId) : EMPTY_STOCK_QUERY;
  const result = db.useQuery(query);

  const raw = result.data?.stockItems ?? [];
  const data: InstantStockItem[] = raw.map((s) => ({
    id: s.id,
    productId: (s as Record<string, unknown>).product
      ? String(((s as Record<string, unknown>).product as Record<string, unknown>).id)
      : '',
    productName: (s as Record<string, unknown>).product
      ? String(((s as Record<string, unknown>).product as Record<string, unknown>).name)
      : '',
    quantityMilli: s.quantityMilli,
    unit: s.unit,
    updatedAt: new Date(s.updatedAt).toISOString(),
  }));

  return { data, isLoading: result.isLoading, error: result.error };
}
