# Permissions Policy (Current MVP)

## Context

- Deployment model: **single venue, single POS device**.
- Shift model: **one open shift per venue**.

## Actions by Role

| Action | Waiter | Cashier |
|---|---:|---:|
| Open shift | ✅ | ✅ |
| Close shift | ❌ | ✅ |
| Close check without payment | ❌ | ✅ |
| Refund / reopen paid check | ❌ | ✅ |

## Shift Requirement

- POS service routes require an open shift:
  - `Orders`
  - `Pos`
  - `Payment`
  - `PaidCheck`
  - `TablePicker`
- If no shift is open, app redirects to `OpenShift`.

## Notes

- Role checks are centralized in `src/utils/permissions.ts`.
- UI restrictions are enforced with defensive runtime guards in payment/refund handlers.
- This policy is intentionally minimal; can be expanded later with `admin`-specific rules.

