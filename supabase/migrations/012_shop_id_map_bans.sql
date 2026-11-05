-- Persist shop ID bans per map. A ban only excludes products tied to that ID+map pair.
begin;

create table if not exists public.shop_id_map_bans (
  shop_id_id text not null references public.shop_ids(id) on delete cascade,
  map_id text not null references public.maps(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (shop_id_id, map_id)
);

alter table public.shop_id_map_bans enable row level security;
revoke all on public.shop_id_map_bans from anon, authenticated;
grant select, insert, delete on public.shop_id_map_bans to authenticated;

create policy shop_id_map_bans_select on public.shop_id_map_bans
  for select to authenticated
  using (public.has_perm('products', 'view')
    or public.has_perm('stockcount', 'view')
    or public.has_perm('shopids', 'view'));

create policy shop_id_map_bans_insert on public.shop_id_map_bans
  for insert to authenticated
  with check (public.has_perm('stockcount', 'edit'));

create policy shop_id_map_bans_delete on public.shop_id_map_bans
  for delete to authenticated
  using (public.has_perm('stockcount', 'edit'));

commit;
