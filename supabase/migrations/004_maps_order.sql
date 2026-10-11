-- BewpakornShop: Phase 4 — ลำดับแมพ (ลากวางจัดเรียงได้)
-- รันหลัง 003 ใน Supabase SQL Editor

begin;

-- ───────── ลำดับแมพ ─────────
alter table public.maps add column if not exists sort_order integer;

-- ตั้งลำดับเริ่มต้นตามลำดับที่เห็นอยู่ตอนนี้ (เรียงตามเวลาที่สร้าง)
update public.maps m set sort_order = s.rn
  from (select id, row_number() over (order by created_at, id)::int as rn from public.maps) s
 where m.id = s.id and m.sort_order is null;

-- แมพใหม่ที่ไม่ระบุลำดับ จะไปต่อท้ายสุดอัตโนมัติ
create or replace function public.maps_set_sort() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sort_order is null then
    select coalesce(max(sort_order), 0) + 1 into new.sort_order from public.maps;
  end if;
  return new;
end $$;
create trigger trg_maps_sort before insert on public.maps
  for each row execute function public.maps_set_sort();

-- บันทึกลำดับทั้งชุดในครั้งเดียว: p_ids = รหัสแมพเรียงตามลำดับที่ต้องการ
create or replace function public.reorder_maps(p_ids text[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_perm('maps', 'edit') then raise exception 'ไม่มีสิทธิ์จัดเรียงแมพ'; end if;
  update public.maps m set sort_order = v.ord::int
    from unnest(p_ids) with ordinality as v(id, ord)
   where m.id = v.id and m.sort_order is distinct from v.ord::int;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.reorder_maps(text[]) to authenticated;
revoke execute on function public.reorder_maps(text[]) from anon, public;

commit;
