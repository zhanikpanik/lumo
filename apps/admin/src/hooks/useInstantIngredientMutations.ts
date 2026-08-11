import { useCallback, useState } from 'react';
import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';
import { executeWarehouseCommand } from '@/data/warehouseCommands';

export interface IngredientInput {
  name: string;
  unit: string;
  warehouseIds: string[];
}

interface CreateIngredientInput extends IngredientInput {
  initialQuantityMilli: number;
}

function useWarehouseMutation<TInput, TResult>(
  kind: string,
  buildPayload: (input: TInput) => Record<string, unknown>,
) {
  const venueId = useVenueId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async (input: TInput): Promise<TResult> => {
    setLoading(true);
    setError(null);
    try {
      return await executeWarehouseCommand<TResult>(
        kind,
        crypto.randomUUID(),
        venueId,
        buildPayload(input),
      );
    } catch (cause) {
      const mutationError = cause instanceof Error ? cause : new Error('Command failed');
      setError(mutationError);
      throw mutationError;
    } finally {
      setLoading(false);
    }
  }, [buildPayload, kind, venueId]);

  return { mutate, loading, error };
}

const createPayload = (input: CreateIngredientInput) => ({ ...input });
const updatePayload = (input: IngredientInput & { productId: string }) => ({ ...input });

export function useInstantCreateIngredient() {
  const mutation = useWarehouseMutation<CreateIngredientInput, { productId: string }>(
    'create-ingredient',
    createPayload,
  );
  return { create: mutation.mutate, ...mutation };
}

export function useInstantUpdateIngredient() {
  const mutation = useWarehouseMutation<IngredientInput & { productId: string }, { productId: string }>(
    'update-ingredient',
    updatePayload,
  );
  return { update: mutation.mutate, ...mutation };
}

export function useInstantIngredient(productId: string | null) {
  const db = getInstantClient();
  const venueId = useVenueId();
  const result = db.useQuery(productId ? {
    products: {
      $: { where: { id: productId, kind: 'ingredient', 'venue.id': venueId }, limit: 1 },
      warehouses: {},
    },
  } : null);
  const product = result.data?.products?.[0];

  return {
    data: product ? {
      id: product.id,
      name: product.name,
      unit: product.unit,
      warehouseIds: (product.warehouses ?? []).map((warehouse) => warehouse.id),
    } : null,
    isLoading: result.isLoading,
    error: result.error,
  };
}
