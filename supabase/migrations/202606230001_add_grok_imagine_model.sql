insert into public.ai_models (id, name, provider, badge, ratios, sizes, qualities, credit_cost)
values (
  'x-ai/grok-imagine-image-quality',
  'Grok Imagine Image Quality',
  'xAI',
  'Quality',
  array['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9'],
  array['1K','2K','4K'],
  array['标准','高清','超高清'],
  12
)
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
