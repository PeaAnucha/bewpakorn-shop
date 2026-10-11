-- BewpakornShop: Phase 5 — ลำดับ Shop ID (ลากวางจัดเรียงได้ ภายในแต่ละแมพ)
-- รันหลัง 004 ใน Supabase SQL Editor

begin;

alter table public.shop_ids add column if not exists sort_order integer;

-- ตั้งลำดับเริ่มต้นแยกตามแมพ ตามลำดับที่เห็นอยู่ตอนนี้ (เวลาที่สร้าง)
update public.shop_ids s set sort_order = r.rn
  from (select id, row_number() over (partition by map_id order by created_at, id)::int as rn from public.shop_ids) r
 where s.id = r.id and s.sort_order is null;

-- เพิ่มใหม่ หรือย้ายไปแมพอื่น -> ไปต่อท้ายของแมพนั้นอัตโนมัติ
create or replace function public.shop_ids_set_sort() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.sort_order is null then
      select coalesce(max(sort_order), 0) + 1 into new.sort_order from public.shop_ids where map_id is not distinct from new.map_id;
    end if;
  elsif new.map_id is distinct from old.map_id and new.sort_order is not distinct from old.sort_order then
    select coalesce(max(sort_order), 0) + 1 into new.sort_order from public.shop_ids where map_id is not distinct from new.map_id;
  end if;
  return new;
end $$;
create trigger trg_shop_ids_sort before insert or update of map_id on public.shop_ids
  for each row execute function public.shop_ids_set_sort();

-- บันทึกลำดับของแมพหนึ่งทั้งชุด: p_ids = รหัส Shop ID เรียงตามลำดับที่ต้องการ
create or replace function public.reorder_shop_ids(p_ids text[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_perm('shopids', 'edit') then raise exception 'ไม่มีสิทธิ์จัดเรียง Shop ID'; end if;
  update public.shop_ids s set sort_order = v.ord::int
    from unnest(p_ids) with ordinality as v(id, ord)
   where s.id = v.id and s.sort_order is distinct from v.ord::int;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.reorder_shop_ids(text[]) to authenticated;
revoke execute on function public.reorder_shop_ids(text[]) from anon, public;

commit;
