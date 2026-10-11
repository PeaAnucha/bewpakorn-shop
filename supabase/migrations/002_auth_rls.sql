-- BewpakornShop: Phase 2 — เชื่อม Supabase Auth + Row Level Security
-- รันหลัง 001 (หรือไฟล์ all-in-one) ใน Supabase SQL Editor

begin;

-- ───────── 1) เชื่อม app_users กับ Supabase Auth ─────────
-- PIN จะอยู่ใน Supabase Auth เท่านั้น (สคริปต์ create-auth-users สร้างให้)
-- จึงลบ pin_hash ออกจากตารางของเรา
alter table public.app_users add column if not exists auth_user_id uuid unique
  references auth.users(id) on delete cascade;
alter table public.app_users drop column if exists pin_hash;

-- ───────── 2) ฟังก์ชันช่วยเช็กสิทธิ์ (security definer = อ่านข้าม RLS ได้ภายในฟังก์ชันเท่านั้น) ─────────
create or replace function public.my_roles() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select roles from public.app_users where auth_user_id = auth.uid()), '{}')
$$;

create or replace function public.my_employee_id() returns text
language sql stable security definer set search_path = public as $$
  select employee_id from public.app_users where auth_user_id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select 'admin' = any(public.my_roles())
$$;

-- admin = ทำได้ทุกอย่าง (เหมือน isAdmin ในระบบเดิม); role อื่นดูจากตาราง permissions
create or replace function public.has_perm(p_page text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.permissions
    where role = any(public.my_roles()) and page = p_page and p_action = any(actions))
$$;

create or replace function public.can_approve_holiday() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_perm('schedule','approve') or public.has_perm('holidays','approve')
$$;

grant execute on function public.my_roles(), public.my_employee_id(), public.is_admin(),
  public.has_perm(text,text), public.can_approve_holiday() to authenticated;

-- ───────── 3) สิทธิ์ระดับตาราง ─────────
-- ผู้ใช้ที่ยังไม่ล็อกอิน (anon) เข้าตารางใดไม่ได้เลย
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ───────── 4) Policy ─────────
-- helper: สร้าง policy เขียน (add/edit/delete) ตาม page ใน permissions
do $$
declare r record;
begin
  for r in select * from (values
    ('maps','maps'), ('products','products'), ('shop_ids','shopids'),
    ('employees','employees'), ('schedule','schedule')
  ) as t(tbl, pg) loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_perm(%L,''add''))', r.tbl||'_ins', r.tbl, r.pg);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_perm(%L,''edit'')) with check (public.has_perm(%L,''edit''))', r.tbl||'_upd', r.tbl, r.pg, r.pg);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_perm(%L,''delete''))', r.tbl||'_del', r.tbl, r.pg);
  end loop;
end $$;

-- อ่าน
create policy maps_sel      on public.maps      for select to authenticated using (true);
create policy employees_sel on public.employees for select to authenticated using (true);
create policy schedule_sel  on public.schedule  for select to authenticated using (true);
create policy products_sel  on public.products  for select to authenticated using (public.has_perm('products','view'));
create policy shop_ids_sel  on public.shop_ids  for select to authenticated using (public.has_perm('shopids','view'));

-- roles / permissions / ranks / app_users
create policy roles_sel on public.roles for select to authenticated using (true);
create policy roles_all on public.roles for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy perms_sel on public.permissions for select to authenticated
  using (public.is_admin() or role = any(public.my_roles()));
create policy perms_all on public.permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy ranks_sel on public.ranks for select to authenticated using (true);
create policy ranks_all on public.ranks for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy app_users_sel on public.app_users for select to authenticated
  using (auth_user_id = auth.uid() or public.is_admin());
create policy app_users_all on public.app_users for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ghost items: ผูกกับสิทธิ์ products
create policy ghost_sel on public.ghost_items for select to authenticated using (public.has_perm('products','view'));
create policy ghost_ins on public.ghost_items for insert to authenticated with check (public.has_perm('products','add'));
create policy ghost_upd on public.ghost_items for update to authenticated using (public.has_perm('products','edit')) with check (public.has_perm('products','edit'));
create policy ghost_del on public.ghost_items for delete to authenticated using (public.has_perm('products','delete'));

-- วันหยุด: ทุกคนดูได้; พนักงานโหวตของตัวเอง; ผู้อนุมัติ/admin จัดการได้ทั้งหมด
create policy hv_sel on public.holiday_votes for select to authenticated using (true);
create policy hv_ins on public.holiday_votes for insert to authenticated
  with check (employee_id = public.my_employee_id() or public.can_approve_holiday());
create policy hv_upd on public.holiday_votes for update to authenticated
  using (public.can_approve_holiday() or (employee_id = public.my_employee_id() and status <> 'approved'))
  with check (public.can_approve_holiday() or employee_id = public.my_employee_id());
create policy hv_del on public.holiday_votes for delete to authenticated
  using (public.can_approve_holiday() or (employee_id = public.my_employee_id() and status <> 'approved'));

create policy hl_sel on public.holiday_locks for select to authenticated using (true);
create policy hl_all on public.holiday_locks for all to authenticated
  using (public.can_approve_holiday()) with check (public.can_approve_holiday());

-- เช็กอิน: ทุกคนดูได้; บันทึกได้เฉพาะของตัวเอง (admin บันทึกแทนคนอื่นได้); แก้/ลบ admin เท่านั้น
create policy att_sel on public.attendance_logs for select to authenticated using (true);
create policy att_ins on public.attendance_logs for insert to authenticated
  with check (employee_id = public.my_employee_id() or public.is_admin());
create policy att_upd on public.attendance_logs for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy att_del on public.attendance_logs for delete to authenticated using (public.is_admin());

-- ───────── 5) กฎธุรกิจที่เคยอยู่ใน Code.gs ย้ายมาเป็น trigger (ฝั่งฐานข้อมูลบังคับจริง) ─────────
create or replace function public.guard_holiday_vote() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  approver boolean := public.can_approve_holiday();
  conflict_days text;
begin
  -- พนักงานทั่วไป: สถานะเริ่มที่ pending เสมอ และเปลี่ยนสถานะเองไม่ได้
  if not approver then
    if tg_op = 'INSERT' then new.status := 'pending';
    elsif new.status is distinct from old.status then
      raise exception 'ไม่มีสิทธิ์เปลี่ยนสถานะการโหวต';
    end if;
  end if;

  if tg_op = 'INSERT' or new.voted_days is distinct from old.voted_days then
    if coalesce(cardinality(new.voted_days), 0) = 0 then raise exception 'ไม่มีวันที่ระบุ'; end if;
    if cardinality(new.voted_days) > 4 then raise exception 'เลือกวันหยุดได้สูงสุด 4 วัน'; end if;
    if not public.is_admin() and exists (
      select 1 from public.holiday_locks l
      where l.year_month = new.year_month and l.day = any(new.voted_days)) then
      raise exception 'มีบางวันที่ถูกล็อกไว้ ไม่สามารถโหวตได้';
    end if;
  end if;

  if tg_op = 'INSERT' or new.voted_days is distinct from old.voted_days
     or (new.status = 'approved' and old.status is distinct from 'approved') then
    select string_agg(distinct extract(day from s.day)::int::text, ', ') into conflict_days
    from public.schedule s
    where s.employee_id = new.employee_id and s.year_month = new.year_month
      and extract(day from s.day)::int = any(new.voted_days);
    if conflict_days is not null then
      raise exception 'มีการลงกะไว้แล้วในวันที่ %', conflict_days;
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_holiday_votes_updated on public.holiday_votes;
create trigger trg_holiday_votes_guard before insert or update on public.holiday_votes
  for each row execute function public.guard_holiday_vote();

-- เวลาเช็กอินใช้เวลาของเซิร์ฟเวอร์เสมอ (กันย้อนเวลา) ยกเว้น admin
create or replace function public.force_attendance_ts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then new.ts := now(); end if;
  return new;
end $$;
create trigger trg_attendance_ts before insert on public.attendance_logs
  for each row execute function public.force_attendance_ts();

commit;
