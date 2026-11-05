-- Separate stock-count access from general product editing.
-- Run after 008_stock_count_round.sql.
begin;

-- Preserve existing access: anyone who could edit products can continue counting.
insert into public.permissions(role, page, actions)
select p.role, 'stockcount', array['view', 'edit']::text[]
from public.permissions p
where p.page = 'products' and 'edit' = any(p.actions)
on conflict (role, page) do nothing;

-- StockCount needs Account labels, but must not expose Shop ID passwords.
create or replace function public.get_stock_count_shop_ids()
returns table (id text, shop_id text, map_id text, sort_order integer)
language sql stable security definer set search_path = public as $$
  select s.id, s.shop_id, s.map_id, s.sort_order
  from public.shop_ids s
  where public.has_perm('stockcount', 'view')
$$;
revoke all on function public.get_stock_count_shop_ids() from public, anon;
grant execute on function public.get_stock_count_shop_ids() to authenticated;

-- Permit the StockCount page to read its source rows without granting product-page access.
drop policy if exists products_sel on public.products;
create policy products_sel on public.products for select to authenticated
  using (public.has_perm('products', 'view') or public.has_perm('stockcount', 'view'));

drop policy if exists ghost_sel on public.ghost_items;
create policy ghost_sel on public.ghost_items for select to authenticated
  using (public.has_perm('products', 'view') or public.has_perm('stockcount', 'view'));

drop policy if exists stock_history_recent_read on public.stock_history;
create policy stock_history_recent_read on public.stock_history for select to authenticated
  using (created_at >= now() - interval '3 days'
    and (public.has_perm('products', 'view') or public.has_perm('stockcount', 'view')));

drop policy if exists stock_count_round_own_read on public.stock_count_rounds;
create policy stock_count_round_own_read on public.stock_count_rounds
  for select to authenticated using (user_id = auth.uid() and public.has_perm('stockcount', 'view'));

create or replace function public.save_stock_count(p_products jsonb default '[]', p_ghosts jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_p int := 0; n_g int := 0;
begin
  if not public.has_perm('stockcount', 'edit') then raise exception 'ไม่มีสิทธิ์บันทึกผลนับสต็อก'; end if;
  update public.products p set stock = greatest(0, v.stock)
    from jsonb_to_recordset(coalesce(p_products,'[]')) as v(id text, stock int)
   where p.id = v.id and not p.is_bundle and p.stock is distinct from greatest(0, v.stock);
  get diagnostics n_p = row_count;
  update public.ghost_items g set stock = greatest(0, v.stock)
    from jsonb_to_recordset(coalesce(p_ghosts,'[]')) as v(id text, stock int)
   where g.id = v.id and g.stock is distinct from greatest(0, v.stock);
  get diagnostics n_g = row_count;
  return jsonb_build_object('products', n_p, 'ghosts', n_g);
end $$;

create or replace function public.save_stock_count_round(p_counted_ids jsonb, p_skipped_map_ids jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  if not public.has_perm('stockcount', 'edit') then raise exception 'ไม่มีสิทธิ์บันทึกสถานะรอบนับ'; end if;
  if jsonb_typeof(p_counted_ids) is distinct from 'array' or jsonb_typeof(p_skipped_map_ids) is distinct from 'array' then
    raise exception 'ข้อมูลรอบนับไม่ถูกต้อง';
  end if;

  insert into public.stock_count_rounds(user_id, counted_ids, skipped_map_ids, updated_at)
  values (v_user_id, p_counted_ids, p_skipped_map_ids, now())
  on conflict (user_id) do update set
    counted_ids = excluded.counted_ids,
    skipped_map_ids = excluded.skipped_map_ids,
    updated_at = excluded.updated_at;
end $$;

revoke all on function public.save_stock_count(jsonb, jsonb) from public, anon;
grant execute on function public.save_stock_count(jsonb, jsonb) to authenticated;
revoke all on function public.save_stock_count_round(jsonb, jsonb) from public, anon;
grant execute on function public.save_stock_count_round(jsonb, jsonb) to authenticated;

commit;
