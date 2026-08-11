import type { ImportProfile } from '../types';
import { posterProfile } from './poster';

/** Registry of all import profiles. Add new competitors here. */
export const profiles: ImportProfile[] = [posterProfile];

/**
 * Auto-detect which profile best matches the workbook.
 * Returns the profile with the highest confidence, or null if none match above the threshold.
 */
export function detectProfile(
  sheets: Record<string, string[]>,
  minConfidence = 0.3,
): { profile: ImportProfile; confidence: number } | null {
  let best: { profile: ImportProfile; confidence: number } | null = null;

  for (const profile of profiles) {
    const confidence = profile.detect(sheets);
    if (confidence > (best?.confidence ?? 0)) {
      best = { profile, confidence };
    }
  }

  if (best && best.confidence >= minConfidence) return best;
  return null;
}

/** Find a profile by its id string. */
export function getProfileById(id: string): ImportProfile | undefined {
  return profiles.find(p => p.id === id);
}
