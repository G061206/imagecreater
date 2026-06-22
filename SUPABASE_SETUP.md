# Supabase account setup

## 1. Create the database objects

Open the Supabase SQL Editor for the target project and run:

`supabase/migrations/202606220001_profiles.sql`

This creates the `profiles` table, signup trigger, role checks, account credits, row-level security policies, and the restricted profile-update function.

## 2. Configure email authentication

In Supabase Authentication:

- Enable the Email provider.
- Keep email confirmation enabled for production.
- Set the local Site URL to `http://localhost:4173` while developing.
- Add `http://localhost:4173` to Redirect URLs.
- Configure a custom SMTP provider before production use.

## 3. Configure the frontend

Create `app/.env.local` from `app/.env.example` and set:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-publishable-key
```

Only use the anonymous publishable key in the browser. Never add the Supabase service-role key to a `VITE_` variable.

## 4. Create the first administrator

Register the first account through Prism, confirm its email, then run this once in the SQL Editor:

```sql
update public.profiles
set role = 'admin'
where email = 'you@example.com';
```

After signing in again, the account menu will show the administrator dashboard and its live user-management screen.
