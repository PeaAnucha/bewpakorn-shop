-- BewpakornShop: Phase 3 — ตรรกะสินค้า/เซ็ต (bundle)/ghost/นับสต็อก ย้ายจาก Code.gs มาไว้ที่ฐานข้อมูล
-- รันหลัง 002 ใน Supabase SQL Editor

begin;

-- ───────── 1) คำนวณสต็อกของ Bundle (เหมือน calcBundleStock เดิม) ─────────
-- สต็อกเซ็ต = ค่าต่ำสุดของ floor(สต็อกส่วนประกอบ / จำนวนต่อชุด)
--  • สินค้าในระบบ: ใช้สต็อกจากตาราง products (ข้ามถ้าหาไม่เจอ เหมือนเดิม)
--  • Ghost (productId ขึ้นต้น __ghost__:): ใช้สต็อกจากตาราง ghost_items เป็นหลัก
--    (ถ้ายังไม่มีในตารางจะ fallback เป็น ghostStock ที่ฝังใน JSON)
create or replace function public.calc_bundle_stock(items jsonb) returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  it jsonb; pid text; ratio int; sub_stock int; found boolean; minv int := null; gname text;
begin
  if items is null or jsonb_typeof(items) <> 'array' then return 0; end if;
  for it in select * from jsonb_array_elements(items) loop
    pid := it->>'productId';
    if pid is null or pid = '' then continue; end if;
    ratio := case when (it->>'ratio') ~ '^\s*\d+(\.\d+)?\s*$' and (it->>'ratio')::numeric >= 1
                  then floor((it->>'ratio')::numeric)::int else 1 end;
    if pid like '\_\_ghost\_\_:%' then
      gname := lower(trim(coalesce(nullif(it->>'ghostName',''), substr(pid, 11))));
      select g.stock into sub_stock from public.ghost_items g where lower(trim(g.name)) = gname limit 1;
      if not found then
        sub_stock := case when (it->>'ghostStock') ~ '^\s*-?\d+' then floor((it->>'ghostStock')::numeric)::int else 0 end;
      end if;
    else
      select p.stock into sub_stock from public.products p where p.id = pid and not p.is_bundle;
      if not found then continue; end if;
    end if;
    sub_stock := floor(greatest(coalesce(sub_stock,0),0)::numeric / ratio)::int;
    if minv is null or sub_stock < minv then minv := sub_stock; end if;
  end loop;
  return coalesce(minv, 0);
end $$;

-- ───────── 2) คำนวณสต็อกเซ็ตใหม่อัตโนมัติเมื่อสินค้า/ghost เปลี่ยน ─────────
create or replace function public.recalc_bundle_stocks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;   -- กันวนซ้ำ
  update public.products b
     set stock = public.calc_bundle_stock(b.bundle_items)
   where b.is_bundle and b.stock is distinct from public.calc_bundle_stock(b.bundle_items);
  return null;
end $$;

create trigger trg_products_recalc after insert or update or delete on public.products
  for each statement execute function public.recalc_bundle_stocks();
create trigger trg_ghost_recalc after insert or update or delete on public.ghost_items
  for each statement execute function public.recalc_bundle_stocks();

-- เปลี่ยนแค่ลำดับ (sort_order) ไม่ต้องอัปเดตเวลา "อัปเดตล่าสุด" (เหมือน bulkUpdateSort เดิม)
create or replace function public.products_touch() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - 'sort_order' - 'updated_at') is distinct from (to_jsonb(old) - 'sort_order' - 'updated_at') then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;
drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.products_touch();

-- ───────── 3) RPC: บันทึกสินค้า (เพิ่ม/แก้) พร้อมลงทะเบียน Ghost อัตโนมัติ ─────────
-- เหมือน addProduct/updateProduct + syncGhostStockFromBundles เดิม แต่ทำในธุรกรรมเดียว
create or replace function public.save_product(p_id text, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id text := nullif(p_id, '');
  is_b boolean := coalesce((p->>'is_bundle')::boolean, false);
  items jsonb := '[]'::jsonb;
  it jsonb; gname text; gstock int; clean_items jsonb := '[]'::jsonb;
begin
  if v_id is null then
    if not public.has_perm('products','add') then raise exception 'ไม่มีสิทธิ์เพิ่มสินค้า'; end if;
  else
    if not public.has_perm('products','edit') then raise exception 'ไม่มีสิทธิ์แก้ไขสินค้า'; end if;
  end if;
  if coalesce(trim(p->>'name'),'') = '' then raise exception 'กรุณากรอกชื่อสินค้า'; end if;

  if is_b and jsonb_typeof(p->'bundle_items') = 'array' then
    items := p->'bundle_items';
    for it in select * from jsonb_array_elements(items) loop
      if (it->>'productId') like '\_\_ghost\_\_:%' then
        gname := trim(coalesce(nullif(it->>'ghostName',''), substr(it->>'productId', 11)));
        if gname = '' then continue; end if;
        gstock := greatest(case when (it->>'ghostStock') ~ '^\s*-?\d+' then floor((it->>'ghostStock')::numeric)::int else 0 end, 0);
        update public.ghost_items set stock = gstock where lower(trim(name)) = lower(gname);
        if not found then
          insert into public.ghost_items(name, stock, note) values (gname, gstock, 'ระบบบันทึกอัตโนมัติจากเซ็ตสินค้า');
        end if;
        clean_items := clean_items || jsonb_build_array(jsonb_build_object(
          'productId', '__ghost__:' || gname, 'ratio', coalesce(it->'ratio', '1'::jsonb), 'ghostName', gname));
      else
        clean_items := clean_items || jsonb_build_array(it - 'ghostStock' - 'ghostName');
      end if;
    end loop;
  end if;

  if v_id is null then
    insert into public.products(name, map_id, shop_id_ref, stock, description, status, image_url, is_bundle, bundle_items, sort_order)
    values (trim(p->>'name'), nullif(p->>'map_id',''), nullif(p->>'shop_id_ref',''),
            greatest(coalesce(nullif(p->>'stock','')::int,0),0), nullif(p->>'description',''),
            coalesce(nullif(p->>'status',''),'active'), nullif(p->>'image_url',''), is_b, clean_items,
            nullif(p->>'sort_order','')::int)
    returning id into v_id;
  else
    update public.products set
      name = trim(p->>'name'), map_id = nullif(p->>'map_id',''), shop_id_ref = nullif(p->>'shop_id_ref',''),
      stock = case when is_b then stock else greatest(coalesce(nullif(p->>'stock','')::int,0),0) end,
      description = nullif(p->>'description',''), status = coalesce(nullif(p->>'status',''),'active'),
      image_url = nullif(p->>'image_url',''), is_bundle = is_b, bundle_items = clean_items,
      sort_order = nullif(p->>'sort_order','')::int
    where id = v_id;
    if not found then raise exception 'ไม่พบสินค้า'; end if;
  end if;

  -- คำนวณสต็อกเซ็ตของสินค้านี้ทันที (กรณี trigger ระดับ statement ยังไม่เห็น ghost ที่เพิ่งเพิ่ม)
  update public.products b set stock = public.calc_bundle_stock(b.bundle_items)
   where b.id = v_id and b.is_bundle and b.stock is distinct from public.calc_bundle_stock(b.bundle_items);
  return v_id;
end $$;

-- ───────── 4) RPC: บันทึกผลนับสต็อกทีเดียว (เหมือน batchUpdateStock เดิม) ─────────
-- p_products: [{id, stock}]  (เซ็ต/bundle ถูกข้าม เพราะคำนวณอัตโนมัติ)
-- p_ghosts:   [{id, stock}]
create or replace function public.save_stock_count(p_products jsonb default '[]', p_ghosts jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_p int := 0; n_g int := 0;
begin
  if not public.has_perm('products','edit') then raise exception 'ไม่มีสิทธิ์แก้ไขสต็อก'; end if;
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

-- ───────── 5) RPC: บันทึกลำดับสินค้าหลายตัวพร้อมกัน (เหมือน bulkUpdateSort เดิม) ─────────
-- p_items: [{id, sort}]  sort เป็น null = ล้างลำดับ
create or replace function public.bulk_update_sort(p_items jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_perm('products','edit') then raise exception 'ไม่มีสิทธิ์จัดเรียงสินค้า'; end if;
  update public.products p set sort_order = v.sort
    from jsonb_to_recordset(coalesce(p_items,'[]')) as v(id text, sort int)
   where p.id = v.id and p.sort_order is distinct from v.sort;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.save_product(text, jsonb), public.save_stock_count(jsonb, jsonb),
  public.bulk_update_sort(jsonb) to authenticated;
revoke execute on function public.save_product(text, jsonb), public.save_stock_count(jsonb, jsonb),
  public.bulk_update_sort(jsonb), public.calc_bundle_stock(jsonb), public.recalc_bundle_stocks() from anon, public;

commit;
