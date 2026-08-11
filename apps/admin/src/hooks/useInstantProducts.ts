import { getInstantClient } from '@/data/instant';
import { adminProductsQuery } from '@lumo/data';
import { useVenueId } from './useVenueId';

export interface InstantProduct {
  id: string;
  name: string;
  kind: 'dish' | 'ingredient';
  priceTiyin: number;
  costTiyin: number;
  unit: string;
  sortOrder: number;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
}

export function useInstantProducts() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(adminProductsQuery(venueId));

  const data: InstantProduct[] = (result.data?.products ?? []).map(p => ({
    id: p.id,
    name: p.name,
    kind: p.kind as 'dish' | 'ingredient',
    priceTiyin: p.priceTiyin,
    costTiyin: p.costTiyin,
    unit: p.unit,
    sortOrder: p.sortOrder,
    status: p.status,
    categoryId: p.category?.id ?? null,
    categoryName: p.category?.name ?? null,
  }));

  return { data, isLoading: result.isLoading, error: result.error };
}

export function useInstantDishes() {
  const { data: all, ...rest } = useInstantProducts();
  return { data: all.filter(p => p.kind === 'dish'), ...rest };
}

export function useInstantIngredients() {
  const { data: all, ...rest } = useInstantProducts();
  return { data: all.filter(p => p.kind === 'ingredient'), ...rest };
}
