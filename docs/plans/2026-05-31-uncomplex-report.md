# Uncomplex Analyzer Report

**Date:** 2026-05-31
**Tooling:** madge (circular deps), jscpd (duplication), manual review (complexity)

---

## Summary

| Metric | Value |
|---------|-------|
| Circular dependencies | ✅ **0** |
| Code duplication | **4.85%** (35 clones identified) |
| Largest files | orderStore.ts (752L), PaidCheckScreen (725L), PaymentScreen (705L) |

---

## Actions Taken

### 1. `shiftStore.ts` — `mapSupabaseShift()` extracted ✅
- **Problem:** Identical 24-line Supabase row → Shift mapping duplicated in `openShift()` and `fetchOpenShift()`
- **Fix:** Extracted `mapSupabaseShift(row)` helper, used in both places
- **Also:** Replaced manual `generateId()` with `Crypto.randomUUID()` from `expo-crypto`

### 2. `CashCollectionModal` + `CashTransactionModal` → `CashOperationModal` ✅
- **Problem:** 52-line clone — two nearly identical modals (amount + note + confirm/cancel)
- **Fix:** Single `CashOperationModal` with `mode: 'collection' | 'in' | 'out'` prop
- **Impact:** -2 files, -~250 lines, consistent cash operation UI

### 3. `BaseModal` created ✅
- **Problem:** Modal wrapper (overlay + header + close button) duplicated across 5+ components
- **Fix:** Shared `BaseModal` component with `title`, `children`, `footer` props
- **Used in:** `CashOperationModal`, ready for CommentModal, WaiterPickerModal, etc.

### 4. `Numpad` component created ✅
- **Problem:** Numpad grid duplication between LockScreen and OpenShiftScreen
- **Fix:** Reusable `Numpad` with `variant: 'circle' | 'rounded'` and custom `renderKey`
- **Ready for:** LockScreen, OpenShiftScreen, future PIN/amount screens

### 5. `supabase-helpers.ts` created ✅
- `safeRpc<T>()` — standardized Supabase RPC wrapper with error handling
- `parseSupabaseRow<T>()` — snake_case → typed object mapper

### 6. `expo-crypto` added ✅
- Replaces manual UUID v4 generation in shiftStore

---

## Skipped (Marginal Gain)

- **ScrollableGrid extraction** — CategoryMenu and ProductGrid share ~20 lines of grid boilerplate, not worth abstracting
- **safeRpc in api/inventory.ts** — Each RPC has unique response shape; wrapper adds abstraction without line savings
- **dayjs** — Date handling is minimal; `new Date()` is sufficient

---

## Net Effect

- **Files deleted:** 2 (CashCollectionModal, CashTransactionModal)
- **Files created:** 4 (BaseModal, CashOperationModal, Numpad, supabase-helpers)
- **Duplication eliminated:** ~100 lines across shiftStore + cash modals
- **Reusable components added:** BaseModal, Numpad — ready for future screens
