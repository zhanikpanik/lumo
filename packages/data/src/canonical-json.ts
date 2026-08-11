export class CanonicalJsonError extends TypeError {}

export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();

  const serialize = (input: unknown): string => {
    if (input === null) return 'null';
    if (typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input);
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new CanonicalJsonError('Canonical JSON rejects non-finite numbers');
      return Object.is(input, -0) ? '0' : JSON.stringify(input);
    }
    if (typeof input !== 'object') {
      throw new CanonicalJsonError(`Canonical JSON rejects ${typeof input} values`);
    }
    if (ancestors.has(input)) throw new CanonicalJsonError('Canonical JSON rejects cyclic values');

    ancestors.add(input);
    try {
      if (Array.isArray(input)) return `[${input.map(serialize).join(',')}]`;
      const prototype = Object.getPrototypeOf(input);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new CanonicalJsonError('Canonical JSON accepts only plain objects and arrays');
      }
      return `{${Object.keys(input)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serialize((input as Record<string, unknown>)[key])}`)
        .join(',')}}`;
    } finally {
      ancestors.delete(input);
    }
  };

  return serialize(value);
}
