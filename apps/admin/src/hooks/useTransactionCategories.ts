import { useMutation } from '@tanstack/react-query';
import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';

export interface TxCategory {
  id: string;
  venue_id: string;
  name: string;
  type: 'expense' | 'income';
  sort_order: number;
}

export function useTransactionCategories(type?: 'expense' | 'income') {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery({
    cashTransactionCategories: {
      $: { where: { 'venue.id': venueId }, order: { sortOrder: 'asc' } },
    },
  });
  const data = (result.data?.cashTransactionCategories ?? [])
    .filter((category) => !type || category.type === type)
    .map((category) => ({
      id: category.id,
      venue_id: venueId,
      name: category.name,
      type: category.type as 'expense' | 'income',
      sort_order: category.sortOrder,
    }))
    .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name, 'ru'));

  return {
    data,
    isLoading: result.isLoading,
    isError: Boolean(result.error),
    error: result.error,
  };
}

export function useAddCategory() {
  const db = getInstantClient();
  const venueId = useVenueId();
  return useMutation({
    mutationFn: async (category: { name: string; type: 'expense' | 'income' }) => {
      const id = crypto.randomUUID();
      await db.transact(
        db.tx.cashTransactionCategories[id]
          .update({
            venueId,
            name: category.name,
            type: category.type,
            sortOrder: Date.now(),
            createdAt: new Date().toISOString(),
          })
          .link({ venue: venueId }),
      );
    },
  });
}

export function useDeleteCategory() {
  const db = getInstantClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await db.transact(db.tx.cashTransactionCategories[id].delete());
    },
  });
}
