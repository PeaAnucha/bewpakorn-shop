-- ลบ RPC นับสต็อกรุ่นเก่า หลังหน้าเว็บเปลี่ยนไปใช้ apply_stock_count_round (014) แล้ว
--
-- รันไฟล์นี้ "หลัง" deploy หน้าเว็บชุดที่ใช้ apply_stock_count_round ขึ้นเว็บหลักแล้วเท่านั้น
-- ถ้ารันก่อน หน้าเว็บรุ่นเก่าที่ยังเปิดอยู่จะบันทึกผลนับไม่ได้
--
-- เหตุผล: save_stock_count เขียนยอดทับโดยไม่ตรวจยอดเดิม (expected_stock) ไม่ตรวจแมพที่ข้าม
-- และไม่ตรวจไอดีที่โดนแบน ถ้าเก็บไว้ หน้าเว็บรุ่นเก่าที่ค้างอยู่ในเบราว์เซอร์ยังเขียนยอดทับได้
begin;

drop function if exists public.save_stock_count(jsonb, jsonb);
drop function if exists public.save_stock_count_round(jsonb, jsonb);

commit;
