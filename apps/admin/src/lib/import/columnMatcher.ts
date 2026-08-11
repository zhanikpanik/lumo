import type { ColumnMatchers, FieldMapping } from './types';

/**
 * Clean a header string for comparison:
 * - lowercase
 * - trim whitespace
 * - collapse multiple spaces
 * - remove leading/trailing punctuation
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[^a-zа-яё0-9]+|[^a-zа-яё0-9]+$/g, '');
}

/**
 * Score how well a column header matches a pattern.
 * Returns 0–1 where 1 is exact match, lower values are partial/contains matches.
 */
function scoreMatch(header: string, pattern: string): number {
  const h = normalize(header);
  const p = normalize(pattern);

  if (!h || !p) return 0;

  // Exact match
  if (h === p) return 1;

  // Header exactly contains pattern as a word
  const hWords = h.split(/\s+/);
  const pWords = p.split(/\s+/);
  if (pWords.every(pw => hWords.some(hw => hw === pw))) return 0.9;

  // Header contains the full pattern
  if (h.includes(p)) return 0.7;

  // Pattern contains the header (short header matching a longer pattern)
  if (p.includes(h)) return 0.5;

  // Word-level: how many pattern words appear in the header
  const matchedWords = pWords.filter(pw => h.includes(pw)).length;
  if (matchedWords > 0) {
    return (matchedWords / pWords.length) * 0.4;
  }

  return 0;
}

/**
 * Match a set of sheet headers against profile matchers.
 *
 * For each canonical field, finds the best-matching column index from headers.
 * A column can only be assigned to one canonical field (greedy best-match-first).
 *
 * @param headers - Column header strings from the sheet
 * @param matchers - Map of canonical field → array of pattern strings
 * @param minScore - Minimum score (0–1) to consider a match valid (default 0.3)
 */
export function matchColumns(
  headers: string[],
  matchers: ColumnMatchers,
  minScore = 0.3,
): FieldMapping {
  const resolved: Record<string, number> = {};
  const usedColumns = new Set<number>();

  // Build all (canonicalField, pattern, columnIndex, score) candidates
  interface Candidate {
    field: string;
    col: number;
    score: number;
  }
  const candidates: Candidate[] = [];

  for (const [field, patterns] of Object.entries(matchers)) {
    for (const pattern of patterns) {
      for (let col = 0; col < headers.length; col++) {
        const score = scoreMatch(headers[col]!, pattern);
        if (score >= minScore) {
          candidates.push({ field, col, score });
        }
      }
    }
  }

  // Sort by score descending (best matches first)
  candidates.sort((a, b) => b.score - a.score);

  // Greedy assignment: each column used at most once
  for (const c of candidates) {
    if (usedColumns.has(c.col)) continue;
    // For a field that already has a match, only replace if this is better
    if (c.col in resolved) {
      const existingScore = candidates.find(
        x => x.field === c.field && x.col === resolved[c.field],
      )?.score;
      if (existingScore !== undefined && c.score <= existingScore) continue;
    }
    resolved[c.field] = c.col;
    usedColumns.add(c.col);
  }

  // Collect unmatched columns
  const unmatched = headers
    .filter((_, i) => !usedColumns.has(i));

  return { resolved, unmatched };
}

/**
 * Score how well a set of sheet-to-headers matches a profile's detection markers.
 * Used by ImportProfile.detect() implementations.
 *
 * @param sheets - Map of sheet name → header row
 * @param markers - Array of patterns to look for across all sheets
 * @returns 0–1 confidence
 */
export function detectByMarkers(
  sheets: Record<string, string[]>,
  markers: string[],
): number {
  if (markers.length === 0) return 0;

  // Collect all headers from all sheets into one pool
  const allHeaders: string[] = [];
  for (const headers of Object.values(sheets)) {
    for (const h of headers) {
      if (h) allHeaders.push(normalize(h));
    }
  }

  const normalizedMarkers = markers.map(m => normalize(m));
  const hits = normalizedMarkers.filter(marker =>
    allHeaders.some(h => h.includes(marker)),
  ).length;

  return hits / markers.length;
}

/**
 * Find the best-matching sheet for an entity profile by trying to match
 * its matchers against each sheet's headers.
 *
 * @returns The sheet name with the highest field match count, or null.
 */
export function findBestSheet(
  sheets: Record<string, string[]>,
  entity: { matchers: ColumnMatchers; sheetPattern?: RegExp },
): string | null {
  let bestSheet: string | null = null;
  let bestScore = 0;

  for (const [sheetName, headers] of Object.entries(sheets)) {
    // If a sheetPattern is provided, use it as a filter hint
    if (entity.sheetPattern && !entity.sheetPattern.test(sheetName)) continue;

    const mapping = matchColumns(headers, entity.matchers, 0.3);
    const matchedCount = Object.keys(mapping.resolved).length;
    const totalFields = Object.keys(entity.matchers).length;
    const score = totalFields > 0 ? matchedCount / totalFields : 0;

    if (score > bestScore) {
      bestScore = score;
      bestSheet = sheetName;
    }
  }

  return bestScore > 0 ? bestSheet : null;
}
