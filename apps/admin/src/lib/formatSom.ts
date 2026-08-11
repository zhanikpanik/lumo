/** Whole som for list display (avoids fractional som noise in tables). */
export function somRounded(n: number | null | undefined): number {
  return Math.round(Number(n) || 0);
}
