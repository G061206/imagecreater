create table if not exists public.ai_models (
  id text primary key,
  name text not null,
  provider text not null,
  badge text not null default '标准',
  enabled boolean not null default true,
  ratios text[] not null default array['1:1']::text[],
  sizes text[] not null default array['1K']::text[],
  qualities text[] not null default array['标准']::text[],
  credit_cost integer not null check (credit_cost > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ai_models (id, name, provider, badge, ratios, sizes, qualities, credit_cost)
values
  ('google/gemini-3.1-flash-image', 'Nano Banana 2', 'Google', '快速', array['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'], array['1K','2K','4K'], array['标准','高清','超高清'], 8),
  ('google/gemini-3-pro-image', 'Nano Banana Pro', 'Google', '专业', array['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'], array['1K','2K','4K'], array['标准','高清','超高清'], 16),
  ('openai/gpt-image-2', 'GPT Image 2', 'OpenAI', '精细', array['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'], array['1024','1536','2048'], array['标准','高清','超高清'], 14),
  ('x-ai/grok-imagine-image-quality', 'Grok Imagine Image Quality', 'xAI', 'Quality', array['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9'], array['1K','2K','4K'], array['标准','高清','超高清'], 12)
on conflict (id) do update set
  name = excluded.name,
  provider = excluded.provider,
  badge = excluded.badge,
  ratios = excluded.ratios,
  sizes = excluded.sizes,
  qualities = excluded.qualities,
  credit_cost = excluded.credit_cost,
  updated_at = now();

drop trigger if exists ai_models_set_updated_at on public.ai_models;
create trigger ai_models_set_updated_at
  before update on public.ai_models
  for each row execute procedure public.set_updated_at();

alter table public.ai_models enable row level security;

create policy "models_read_authenticated"
  on public.ai_models for select
  to authenticated
  using (true);

create policy "models_admin_update"
  on public.ai_models for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on table public.ai_models from anon, authenticated;
grant select, update on table public.ai_models to authenticated;

create table if not exists public.generation_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  model_id text not null references public.ai_models(id),
  prompt text not null check (char_length(prompt) between 1 and 2000),
  parameters jsonb not null default '{}'::jsonb,
  image_count integer not null default 1 check (image_count between 1 and 4),
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  credit_cost integer not null check (credit_cost > 0),
  provider_cost numeric(12,6),
  provider_request_ids text[] not null default '{}'::text[],
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists generation_tasks_user_created_idx on public.generation_tasks(user_id, created_at desc);
create index if not exists generation_tasks_status_created_idx on public.generation_tasks(status, created_at desc);

create table if not exists public.generation_assets (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.generation_tasks(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0),
  created_at timestamptz not null default now()
);

create index if not exists generation_assets_task_idx on public.generation_assets(task_id);

alter table public.generation_tasks enable row level security;
alter table public.generation_assets enable row level security;

create policy "tasks_read_own_or_admin"
  on public.generation_tasks for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "assets_read_own_or_admin"
  on public.generation_assets for select
  to authenticated
  using (exists (
    select 1 from public.generation_tasks task
    where task.id = generation_assets.task_id
      and (task.user_id = (select auth.uid()) or (select private.is_admin()))
  ));

revoke all on table public.generation_tasks from anon, authenticated;
revoke all on table public.generation_assets from anon, authenticated;
grant select on table public.generation_tasks to authenticated;
grant select on table public.generation_assets to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-images', 'generated-images', false, 20971520, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.reserve_generation_task(
  p_user_id uuid,
  p_model_id text,
  p_prompt text,
  p_parameters jsonb,
  p_image_count integer
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_base_cost integer;
  v_multiplier integer;
  v_total_cost integer;
  v_task_id uuid;
  v_new_credits integer;
begin
  if p_image_count not between 1 and 4 then
    raise exception 'INVALID_IMAGE_COUNT';
  end if;

  select credit_cost into v_base_cost
  from public.ai_models
  where id = p_model_id and enabled = true;

  if v_base_cost is null then
    raise exception 'MODEL_UNAVAILABLE';
  end if;

  v_multiplier := case p_parameters ->> 'quality'
    when '超高清' then 4
    when '高清' then 2
    else 1
  end;
  v_total_cost := v_base_cost * v_multiplier * p_image_count;

  update public.profiles
  set credits = credits - v_total_cost
  where id = p_user_id
    and status = 'active'
    and credits >= v_total_cost
  returning credits into v_new_credits;

  if v_new_credits is null then
    raise exception 'INSUFFICIENT_CREDITS_OR_INACTIVE';
  end if;

  insert into public.generation_tasks (
    user_id, model_id, prompt, parameters, image_count, credit_cost
  ) values (
    p_user_id, p_model_id, p_prompt, p_parameters, p_image_count, v_total_cost
  ) returning id into v_task_id;

  return jsonb_build_object(
    'task_id', v_task_id,
    'credit_cost', v_total_cost,
    'credits_remaining', v_new_credits
  );
end;
$$;

create or replace function public.complete_generation_task(
  p_task_id uuid,
  p_provider_request_ids text[],
  p_provider_cost numeric
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.generation_tasks
  set status = 'completed',
      provider_request_ids = coalesce(p_provider_request_ids, '{}'::text[]),
      provider_cost = p_provider_cost,
      completed_at = now(),
      error_message = null
  where id = p_task_id and status = 'processing';
end;
$$;

create or replace function public.fail_generation_task(
  p_task_id uuid,
  p_error_message text,
  p_refund boolean default true
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_task public.generation_tasks;
begin
  select * into v_task
  from public.generation_tasks
  where id = p_task_id
  for update;

  if v_task.id is null or v_task.status <> 'processing' then
    return;
  end if;

  update public.generation_tasks
  set status = 'failed',
      error_message = left(coalesce(p_error_message, 'Generation failed'), 1000),
      completed_at = now()
  where id = p_task_id;

  if p_refund then
    update public.profiles
    set credits = credits + v_task.credit_cost
    where id = v_task.user_id;
  end if;
end;
$$;

revoke all on function public.reserve_generation_task(uuid,text,text,jsonb,integer) from public, anon, authenticated;
revoke all on function public.complete_generation_task(uuid,text[],numeric) from public, anon, authenticated;
revoke all on function public.fail_generation_task(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.reserve_generation_task(uuid,text,text,jsonb,integer) to service_role;
grant execute on function public.complete_generation_task(uuid,text[],numeric) to service_role;
grant execute on function public.fail_generation_task(uuid,text,boolean) to service_role;
