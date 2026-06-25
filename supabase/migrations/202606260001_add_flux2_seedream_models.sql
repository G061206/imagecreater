insert into public.ai_models (id, name, provider, badge, ratios, sizes, qualities, credit_cost, enabled)
values
  ('black-forest-labs/flux.2-klein-4b', 'FLUX.2 Klein 4B', 'Black Forest Labs', 'Klein', array['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'], array['1K','2K','4K'], array['标准','高清','超高清'], 8, true),
  ('bytedance-seed/seedream-4.5', 'Seedream 4.5', 'ByteDance Seed', 'Seedream', array['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'], array['1K','2K','4K'], array['标准','高清','超高清'], 10, true),
  ('black-forest-labs/flux.2-max', 'FLUX.2 Max', 'Black Forest Labs', 'Max', array['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'], array['1K','2K','4K'], array['标准','高清','超高清'], 16, true)
on conflict (id) do update set
  name = excluded.name,
  provider = excluded.provider,
  badge = excluded.badge,
  ratios = excluded.ratios,
  sizes = excluded.sizes,
  qualities = excluded.qualities,
  credit_cost = excluded.credit_cost,
  enabled = true,
  updated_at = now();
