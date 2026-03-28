create schema if not exists extensions;

do $$
begin
  if exists (
    select 1
    from pg_extension ext
    join pg_namespace nsp
      on nsp.oid = ext.extnamespace
    where ext.extname = 'vector'
      and nsp.nspname <> 'extensions'
  ) then
    execute 'alter extension vector set schema extensions';
  end if;
end
$$;
