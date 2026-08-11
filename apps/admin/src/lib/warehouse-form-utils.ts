/** Shared utilities for warehouse document forms (Delivery, WriteOff, Transfer). */

export function localDateTimeFromIso(iso: string) {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

export function qtyToString(q: number): string {
  if (!Number.isFinite(q)) return '';
  const s = String(q);
  if (s.includes('e')) return String(Math.round(q * 10000) / 10000);
  return s;
}
