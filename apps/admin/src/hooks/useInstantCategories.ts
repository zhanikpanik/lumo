import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';

export interface InstantCategory {
  id: string;
  name: string;
  color_hex: string;
  sort_order: number;
}

export function useInstantCategories() {
  const db = getInstantClient();
  const venueId = useVenueId();

  // Request the venue relation so we can filter by it
  const result = db.useQuery({
    categories: {
      $: {
        where: {
          venue: venueId,
        },
      },
    },
  });

  const data: InstantCategory[] = (result.data?.categories ?? [])
    .map(c => ({
      id: c.id,
      name: c.name,
      color_hex: c.color || '#4A2C2A',
      sort_order: c.sortOrder,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  return { data, isLoading: result.isLoading, error: result.error };
}
