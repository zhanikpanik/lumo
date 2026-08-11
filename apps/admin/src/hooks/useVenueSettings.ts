import { useMutation } from '@tanstack/react-query';
import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';

export interface VenueRow {
  id: string;
  name: string | null;
  address: string | null;
  phone: string | null;
  daily_labor_cost: number | null;
}

export function useVenue() {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery({ venues: { $: { where: { id: venueId }, limit: 1 } } });
  const venue = result.data?.venues?.[0];
  return {
    data: venue ? {
      id: venue.id,
      name: venue.name,
      address: venue.address ?? null,
      phone: venue.phone ?? null,
      daily_labor_cost: venue.dailyLaborCostTiyin == null ? null : venue.dailyLaborCostTiyin / 100,
    } satisfies VenueRow : null,
    isLoading: result.isLoading,
    isError: Boolean(result.error),
    error: result.error,
  };
}

export function useUpdateVenue() {
  const db = getInstantClient();
  const venueId = useVenueId();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<VenueRow, 'name' | 'address' | 'phone' | 'daily_labor_cost'>>) => {
      const fields: Record<string, string | number> = {};
      if (patch.name != null) fields.name = patch.name;
      if (patch.address != null) fields.address = patch.address;
      if (patch.phone != null) fields.phone = patch.phone;
      if (patch.daily_labor_cost != null) fields.dailyLaborCostTiyin = Math.round(patch.daily_labor_cost * 100);
      if (Object.keys(fields).length > 0) {
        await db.transact(db.tx.venues[venueId].update(fields));
      }
    },
  });
}
