-- BewpakornShop: Phase 4 (ไม่บังคับ) — เลิกใช้ระบบตารางงาน / โหวตวันหยุด / เช็กอิน
-- ⚠️ ลบตารางและข้อมูลเหล่านี้ถาวร: schedule, holiday_votes, holiday_locks, attendance_logs
--    ข้อมูลต้นฉบับยังอยู่ใน Google Sheet เดิม และไฟล์ xlsx ของคุณ (เก็บไว้เป็น backup)
-- รันเมื่อแน่ใจแล้วเท่านั้น ระบบใช้งานปกติได้แม้ยังไม่รันไฟล์นี้

begin;

drop table if exists public.holiday_votes cascade;
drop table if exists public.holiday_locks cascade;
drop table if exists public.attendance_logs cascade;
drop table if exists public.schedule cascade;

drop function if exists public.guard_holiday_vote();
drop function if exists public.force_attendance_ts();
drop function if exists public.can_approve_holiday();

-- สิทธิ์ของหน้าที่เลิกใช้
delete from public.permissions where page in ('schedule', 'holidays');

commit;
