/** Minimal shift bounds for matching a transaction timestamp to an open shift */
export type ShiftInterval = {
  id: string;
  openIso: string;
  closeIso: string | null;
};

/**
 * Returns shift id if `isoDatetime` falls in [opened_at, closed_at] (or still open: +∞).
 */
export function matchShiftIdForTimestamp(isoDatetime: string, shifts: ShiftInterval[]): string | null {
  const ts = new Date(isoDatetime).getTime();
  if (Number.isNaN(ts)) return null;
  for (const s of shifts) {
    const open = new Date(s.openIso).getTime();
    const close = s.closeIso ? new Date(s.closeIso).getTime() : Number.POSITIVE_INFINITY;
    if (ts >= open && ts <= close) return s.id;
  }
  return null;
}
