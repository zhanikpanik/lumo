/** Keeps digits and at most one decimal separator; stores `.` internally (comma allowed while typing). */
export function sanitizeDecimalString(raw: string): string {
  if (raw === '') return '';
  let seenSep = false;
  let out = '';
  for (const ch of raw.replace(/\s/g, '')) {
    if (ch >= '0' && ch <= '9') {
      out += ch;
    } else if ((ch === ',' || ch === '.') && !seenSep) {
      out += '.';
      seenSep = true;
    }
  }
  return out;
}

export function parseDecimalField(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Normalized suffix for quantity column (кг, л, мл, шт, or raw unit from DB). */
export function quantitySuffix(unit: string): string {
  const u = unit.trim().toLowerCase();
  if (!u) return '';
  if (u === 'кг' || u === 'kg') return 'кг';
  if (u === 'л' || u === 'l') return 'л';
  if (u === 'мл' || u === 'ml') return 'мл';
  if (u === 'шт' || u === 'pc' || u === 'шт.') return 'шт';
  return unit;
}
