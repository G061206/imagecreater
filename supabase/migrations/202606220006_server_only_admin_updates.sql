revoke update (role, plan, credits, status) on table public.profiles from authenticated;

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));