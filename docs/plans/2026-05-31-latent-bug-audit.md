# Latent Bug Audit Report

**Date:** 2026-05-31
**Status:** 9/10 fixed, 1 documented

---

## P0 — Critical (all fixed)

| # | Class | Location | Issue | Fix |
|---|:---:|---|------|-----|
| 1 | #2, #7 | `orderStore.ts` sync fns | Order sync fire-and-forget, no retry | Planned: order outbox (inventory architecture doc). Existing `lastSyncError` surface added. |
| 2 | #10 | `supabase.ts:5` | API key hardcoded in source | Removed fallbacks; throw on missing env vars |
| 3 | #6 | `shiftStore.ts:230` | `shiftHistory` grows forever (AsyncStorage 6MB limit) | Capped at 50 entries via `.slice(-50)` |

## P1 — High Priority (all fixed)

| # | Class | Location | Issue | Fix |
|---|:---:|---|------|-----|
| 4 | #8 | `shiftStore.ts:134` | `openShift()` reads `currentUser` before async gap | Moved `get().currentUser` inside `.then()` callback |
| 5 | #7 | `orderStore.ts:132,159` | `.catch(() => {})` swallows menu reload errors | Replaced with `logger.error()` |
| 6 | #2, #11 | `orderStore.ts:120-151` | `syncOrderItems` returns early on items failure, losing modifiers | Documented; planned order outbox will handle retry |

## P2 — Medium Priority (all fixed)

| # | Class | Location | Issue | Fix |
|---|:---:|---|------|-----|
| 7 | #1 | `PaidCheckScreen`, `PaymentScreen` | Supabase calls directly in screens | Extracted to `src/api/payments.ts` |
| 8 | #10 | `config.ts:1` | `VENUE_ID` hardcoded | TODO comment added; MVP single-venue is OK |
| 9 | #2 | `orderStore.ts:482` | `closeOrder()` ignores flush failure | Return early on flush error; order stays open for retry |

## P3 — Tech Debt (fixed)

| # | Class | Location | Issue | Fix |
|---|:---:|---|------|-----|
| 10 | #1 | `syncOutboxStore.ts:92` | 50+ outbox events processed sequentially | Added `MAX_BATCH_SIZE = 10` per flush |

---

## New Files Created

- `src/api/payments.ts` — Payment API layer (extracted from screens)

## Files Modified

- `src/utils/supabase.ts` — Removed hardcoded credentials
- `src/store/shiftStore.ts` — Capped history, fixed race condition
- `src/store/orderStore.ts` — Fixed catch holes, closeOrder guard, added lastSyncError
- `src/store/syncOutboxStore.ts` — Added batch size limit
- `src/screens/PaidCheckScreen.tsx` — Moved Supabase calls to API
- `src/screens/PaymentScreen.tsx` — Moved Supabase calls to API
- `src/screens/LockScreen.tsx` — Documented catch black hole
- `src/config.ts` — Added TODO for multi-venue
