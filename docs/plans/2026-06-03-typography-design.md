# Typography Design — Inter Font Migration

**Date:** 2026-06-03
**Goal:** Replace system fonts with Inter (neutral grotesque) for readability, som sign support, and consistent POS typography.
**Status:** Implemented ✅

## Context
- React Native/Expo POS app (r_keeper clone), landscape tablet, dark theme
- Currently: system fonts only, no fontFamily anywhere, relies on fontWeight
- Needs: som sign (U+20C0) for currency display, neutral grotesque, high readability

## System Map
- **Players:** Restaurant staff (waiters/cashiers) — need instant order recognition
- **Constraint:** Font must be local (offline kiosk), must support U+20C0 som sign
- **Leverage point:** Centralized theme/fonts.ts — single source of truth

## Decision
- **Font:** Inter (SIL OFL license)
- **Weights:** Regular (400), Medium (500), Bold (700)
- **Glyphs:** Full Cyrillic + U+20C0 som sign (added Inter v4, Nov 2024)
- **Loading:** Local .ttf files via expo-font

## Approach Chosen
**Option A — Centralized `theme.fonts` constant.** Minimal touching of components, same architecture as existing theme/colors.ts, easy to swap fonts later.

## Implementation Steps
1. Create `assets/fonts/` directory
2. Download Inter-Regular.ttf, Inter-Medium.ttf, Inter-Bold.ttf (SIL OFL)
3. Create `src/theme/fonts.ts` with font constants
4. Load fonts in App.tsx via `useFonts` from expo-font
5. Add `fontFamily: theme.fonts.regular` (or .medium/.bold) to all TextStyle definitions

## Open Questions
- [ ] Should we also add Inter Display variant for large headings (LockScreen 28px)?
- [ ] Existing fontWeight usage: keep or replace with explicit Medium/Bold fontFamily?

## Next Steps
1. Download Inter font files
2. Create theme/fonts.ts
3. Wire up App.tsx
4. Apply to all components
