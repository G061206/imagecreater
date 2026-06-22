drop function if exists public.update_my_profile(text, text);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant update (full_name, avatar_url) on table public.profiles to authenticated;

create index if not exists generation_tasks_model_idx
  on public.generation_tasks(model_id);