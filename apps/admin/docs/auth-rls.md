# Supabase Auth and RLS (production checklist)

This admin panel can require login by setting `VITE_REQUIRE_AUTH=true` and creating users in Supabase Auth (email/password or magic link).

## Recommended RLS model

1. **Never rely on the anon key alone** for production. Either:
   - Use **authenticated** JWTs and policies that check `auth.uid()`, or
   - Use a **service role** only on a trusted backend (not in the browser).

2. **Venue scoping**: add a table or claim that maps `auth.users` to `venue_id` (you already have `user_venues`). Policies should enforce:
   - `SELECT/INSERT/UPDATE/DELETE` only where `venue_id` matches the user’s venues.

3. **Example policy sketch** (adjust to your schema):

```sql
CREATE POLICY "orders_venue_member"
ON orders FOR ALL
USING (
  venue_id IN (
    SELECT venue_id FROM user_venues
    WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  )
);
```

4. **Warehouse tables** (`warehouse_*`) should follow the same pattern: restrict by `venue_id` from `user_venues`.

5. **Floor plan** (`zones`, `tables`): same venue check; POS devices may use a separate role or service account.

## Local development

With `VITE_REQUIRE_AUTH=false`, the app does not redirect to `/login`. Migrations in this repo may use permissive policies (`USING (true)`) for development — **replace these before production**.

## References

- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Auth Helpers](https://supabase.com/docs/guides/auth)
