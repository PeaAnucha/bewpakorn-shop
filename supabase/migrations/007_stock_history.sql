-- Stock change history with a three-day retention window.
begin;

create table if not exists public.stock_history (
  id bigint generated always as identity primary key,
  item_type text not null check (item_type in ('product', 'ghost')),
  item_id text not null,
  item_name text not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  old_stock integer,
  new_stock integer,
  actor_id uuid,
  actor_username text,
  created_at timestamptz not null default now()
);
create index if not exists stock_history_created_idx on public.stock_history (created_at desc);

alter table public.stock_history enable row level security;
revoke all on public.stock_history from anon, authenticated;
grant select on public.stock_history to authenticated;
create policy stock_history_recent_read on public.stock_history
  for select to authenticated
  using (created_at >= now() - interval '3 days' and public.has_perm('products', 'view'));

create or replace function public.audit_stock_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_username text;
  v_type text := case when tg_table_name = 'products' then 'product' else 'ghost' end;
  v_id text;
  v_name text;
  v_old integer;
  v_new integer;
  v_action text;
begin
  if tg_op = 'UPDATE' and old.stock is not distinct from new.stock then return new; end if;

  select username into v_username from public.app_users where auth_user_id = v_actor limit 1;
  if tg_op = 'INSERT' then
    v_id := new.id; v_name := new.name; v_old := null; v_new := new.stock; v_action := 'created';
  elsif tg_op = 'UPDATE' then
    v_id := new.id; v_name := new.name; v_old := old.stock; v_new := new.stock; v_action := 'updated';
  else
    v_id := old.id; v_name := old.name; v_old := old.stock; v_new := null; v_action := 'deleted';
  end if;

  insert into public.stock_history(item_type, item_id, item_name, action, old_stock, new_stock, actor_id, actor_username)
  values (v_type, v_id, v_name, v_action, v_old, v_new, v_actor, v_username);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger products_stock_history
  after insert or update or delete on public.products
  for each row execute function public.audit_stock_change();
create trigger ghost_stock_history
  after insert or update or delete on public.ghost_items
  for each row execute function public.audit_stock_change();

create or replace function public.purge_old_stock_history() returns void
language sql security definer set search_path = public as $$
  delete from public.stock_history where created_at < now() - interval '3 days';
$$;
revoke all on function public.purge_old_stock_history() from public, anon, authenticated;

-- Supabase Cron (pg_cron) physically removes expired rows hourly.
create extension if not exists pg_cron with schema pg_catalog;
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'purge-stock-history') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-stock-history';
  end if;
  if exists (select 1 from cron.job where jobname = 'purge-stock-history-cron-runs') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-stock-history-cron-runs';
  end if;
  perform cron.schedule('purge-stock-history', '0 * * * *', 'select public.purge_old_stock_history();');
  perform cron.schedule('purge-stock-history-cron-runs', '30 0 * * *',
    $$delete from cron.job_run_details where end_time < now() - interval '3 days'$$);
end $do$;

commit;
