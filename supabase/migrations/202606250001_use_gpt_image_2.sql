insert into public.ai_models (id, name, provider, badge, ratios, sizes, qualities, credit_cost, enabled)
values (
  'openai/gpt-image-2',
  'GPT Image 2',
  'OpenAI',
  '精细',
  array['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'],
  array['1024','1536','2048'],
  array['标准','高清','超高清'],
  14,
  true
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

update public.ai_models
set enabled = false,
    updated_at = now()
where id = 'openai/gpt-5.4-image-2';
