insert into storage.buckets (
  id,
  name,
  public
)
values (
  'course-files',
  'course-files',
  false
)
on conflict (id) do nothing;
