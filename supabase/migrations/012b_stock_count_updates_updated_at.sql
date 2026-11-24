-- Refresh updated_at when inventory is counted, including unchanged values.
begin;

-- Keep an explicitly supplied updated_at (used by count RPCs); otherwise touch it
-- only when product data changes. Reordering still leaves it unchanged.
create or replace function public.products_touch() returns trigger
language plpgsql as $$
begin
  if new.updated_at is distinct from old.updated_at then
    return new;
  elsif (to_jsonb(new) - 'sort_order' - 'updated_at')
     is distinct from (to_jsonb(old) - 'sort_order' - 'updated_at') then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

-- Every confirmed count refreshes updated_at, even when the stock value is unchanged.
create or replace function public.save_stock_count(p_products jsonb default '[]', p_ghosts jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_p int := 0; n_g int := 0;
begin
  if not public.has_perm('stockcount', 'edit') then raise exception 'ไม่มีสิทธิ์บันทึกผลนับสต็อก'; end if;
  update public.products p
     set stock = greatest(0, v.stock), updated_at = now()
    from jsonb_to_recordset(coalesce(p_products, '[]')) as v(id text, stock int)
   where p.id = v.id and not p.is_bundle;
  get diagnostics n_p = row_count;
  update public.ghost_items g
     set stock = greatest(0, v.stock), updated_at = now()
    from jsonb_to_recordset(coalesce(p_ghosts, '[]')) as v(id text, stock int)
   where g.id = v.id;
  get diagnostics n_g = row_count;
  return jsonb_build_object('products', n_p, 'ghosts', n_g);
end $$;

commit;
