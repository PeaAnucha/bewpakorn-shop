begin;

alter table public.stock_count_rounds
  add column if not exists round_id uuid not null default gen_random_uuid();

create or replace function public.apply_stock_count_round(
  p_action text,
  p_round_id uuid,
  p_map_id text default null,
  p_products jsonb default '[]',
  p_ghosts jsonb default '[]'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_round public.stock_count_rounds%rowtype;
  v_rows integer;
  v_keys jsonb;
begin
  if v_user is null or not public.has_perm('stockcount', 'edit') then
    raise exception 'ไม่มีสิทธิ์บันทึกผลนับสต็อก';
  end if;
  if p_action is null or p_action not in ('count', 'skip', 'restore', 'reset') then
    raise exception 'คำสั่งรอบนับไม่ถูกต้อง';
  end if;

  select * into v_round from public.stock_count_rounds where user_id = v_user for update;
  if not found and p_round_id is null then
    insert into public.stock_count_rounds(user_id) values (v_user)
      on conflict (user_id) do nothing returning * into v_round;
  elsif v_round.round_id is distinct from p_round_id then
    raise exception 'รอบนับเปลี่ยนไปแล้ว กรุณาตรวจรอบปัจจุบัน';
  end if;
  if v_round.round_id is null then
    raise exception 'รอบนับเปลี่ยนไปแล้ว กรุณาตรวจรอบปัจจุบัน';
  end if;

  if p_action = 'count' then
    if jsonb_typeof(p_products) is distinct from 'array'
      or jsonb_typeof(p_ghosts) is distinct from 'array' then
      raise exception 'ข้อมูลนับสต็อกไม่ถูกต้อง';
    end if;

    if jsonb_array_length(p_products) > 0 then
      update public.products p
        set stock = v.stock, updated_at = now()
        from jsonb_to_recordset(p_products) as v(id text, stock integer, expected_stock integer)
        where p.id = v.id and not p.is_bundle and p.status <> 'inactive'
          and v.stock >= 0 and p.stock = v.expected_stock
          and (p.map_id is null or not (v_round.skipped_map_ids ? p.map_id))
          and not exists (select 1 from public.shop_id_map_bans b
            where b.map_id = p.map_id and b.shop_id_id = p.shop_id_ref);
      get diagnostics v_rows = row_count;
      if v_rows <> jsonb_array_length(p_products) then
        raise exception 'ยอดหรือสถานะสินค้าเปลี่ยน กรุณาตรวจยอดล่าสุดแล้วกรอกใหม่';
      end if;
    end if;
    if jsonb_array_length(p_ghosts) > 0 then
      update public.ghost_items g
        set stock = v.stock, updated_at = now()
        from jsonb_to_recordset(p_ghosts) as v(id text, stock integer, expected_stock integer)
        where g.id = v.id and v.stock >= 0 and g.stock = v.expected_stock;
      get diagnostics v_rows = row_count;
      if v_rows <> jsonb_array_length(p_ghosts) then
        raise exception 'ยอด Ghost เปลี่ยน กรุณาตรวจยอดล่าสุดแล้วกรอกใหม่';
      end if;
    end if;

    select coalesce(jsonb_agg(distinct k), '[]') into v_keys
    from (
      select jsonb_array_elements_text(v_round.counted_ids) as k
      union all select 'p:' || (entry->>'id') from jsonb_array_elements(p_products) as t(entry)
      union all select 'g:' || (entry->>'id') from jsonb_array_elements(p_ghosts) as t(entry)
    ) as ids;
    v_round.counted_ids := v_keys;
  elsif p_action = 'skip' then
    if p_map_id is null or not exists (select 1 from public.maps where id = p_map_id) then
      raise exception 'ไม่พบแมพที่จะข้าม';
    end if;
    if not (v_round.skipped_map_ids ? p_map_id) then
      -- Use database values in place. Skipping must never write a cached quantity.
      update public.products p set updated_at = now()
      where p.map_id = p_map_id and p.status <> 'inactive' and not p.is_bundle
        and not exists (select 1 from public.shop_id_map_bans b
          where b.map_id = p.map_id and b.shop_id_id = p.shop_id_ref);

      update public.ghost_items g set updated_at = now()
      where lower(btrim(g.name)) in (
        select lower(btrim(coalesce(component->>'ghostName', substr(component->>'productId', 11))))
        from public.products p
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(p.bundle_items) = 'array' then p.bundle_items else '[]'::jsonb end
        ) as items(component)
        where p.map_id = p_map_id and p.status <> 'inactive' and p.is_bundle
          and left(component->>'productId', 10) = '__ghost__:'
          and not exists (select 1 from public.shop_id_map_bans b
            where b.map_id = p.map_id and b.shop_id_id = p.shop_id_ref)
      );
      v_round.skipped_map_ids := v_round.skipped_map_ids || jsonb_build_array(p_map_id);
    end if;
  elsif p_action = 'restore' then
    if p_map_id is null then raise exception 'ไม่พบแมพที่จะนำกลับมานับ'; end if;
    v_round.skipped_map_ids := v_round.skipped_map_ids - p_map_id;
  else
    v_round.counted_ids := '[]';
    v_round.skipped_map_ids := '[]';
    v_round.round_id := gen_random_uuid();
  end if;

  update public.stock_count_rounds
    set counted_ids = v_round.counted_ids, skipped_map_ids = v_round.skipped_map_ids,
        round_id = v_round.round_id, updated_at = now()
    where user_id = v_user
    returning * into v_round;

  return jsonb_build_object('round_id', v_round.round_id, 'counted_ids', v_round.counted_ids,
    'skipped_map_ids', v_round.skipped_map_ids, 'updated_at', v_round.updated_at);
end $$;

revoke all on function public.apply_stock_count_round(text, uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.apply_stock_count_round(text, uuid, text, jsonb, jsonb) to authenticated;

commit;
