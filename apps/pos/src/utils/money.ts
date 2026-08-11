/**
 * Money utilities — all internal amounts are in TIYIN (1/100 som).
 * Conversion happens ONLY at Supabase boundaries and display.
 *
 * 1 som = 100 tiyin
 * 100 tiyin = 1 som
 */

/** Convert som (float from Supabase) to tiyin (integer for internal use) */
export function somToTiyin(som: number | null | undefined): number {
  return Math.round((Number(som) || 0) * 100);
}

/** Convert tiyin (integer) to som (float for Supabase) */
export function tiyinToSom(tiyin: number): number {
  return tiyin / 100;
}

/** Format tiyin for display: "1 234 сом" */
export function formatTiyin(tiyin: number): string {
  const som = tiyin / 100;
  return (
    som
      .toFixed(som % 1 === 0 ? 0 : 0) // always whole som for now — restaurant prices don't have fractional som
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  );
}

/** Format tiyin as "1 234" without currency symbol */
export function formatTiyinNumber(tiyin: number): string {
  const som = tiyin / 100;
  return som
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
