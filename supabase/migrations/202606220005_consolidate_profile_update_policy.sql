drop policy if exists "profiles_admin_update" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));