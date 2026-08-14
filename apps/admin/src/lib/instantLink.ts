export function instantOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function instantRecord(value: unknown): Record<string, unknown> | null {
  const linked = Array.isArray(value) ? value[0] : value;
  return linked && typeof linked === 'object' ? linked as Record<string, unknown> : null;
}
