insert into storage.buckets (
  id,
  name,
  public
)
values (
  'lecture-audio',
  'lecture-audio',
  false
)
on conflict (id) do nothing;
