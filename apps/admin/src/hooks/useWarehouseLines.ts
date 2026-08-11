import { useState, useMemo, useCallback } from 'react';

/**
 * Shared state management for document line items.
 * Each line must have a unique `key`, a `product_id`, and string fields.
 */
export function useWarehouseLines<T extends { key: number; product_id: string }>(
  createEmptyLine: () => T,
  convertItems?: (items: any[]) => T[],
  initialItems?: any[] | null,
) {
  const [lines, setLines] = useState<T[]>(() => {
    if (initialItems?.length && convertItems) return convertItems(initialItems);
    return [createEmptyLine()];
  });

  const usedIds = useMemo(
    () => new Set(lines.filter((l) => l.product_id).map((l) => l.product_id)),
    [lines],
  );

  const addRow = useCallback(
    () => setLines((prev) => [...prev, createEmptyLine()]),
    [createEmptyLine],
  );

  const removeLine = useCallback(
    (key: number) =>
      setLines((prev) =>
        prev.length === 1 ? [createEmptyLine()] : prev.filter((l) => l.key !== key),
      ),
    [createEmptyLine],
  );

  const patchLine = useCallback(
    <K extends keyof T>(key: number, field: K, value: T[K]) =>
      setLines((prev) =>
        prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)),
      ),
    [],
  );

  return { lines, setLines, addRow, removeLine, patchLine, usedIds };
}
