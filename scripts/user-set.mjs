// สร้าง/แก้บัญชีผู้ใช้ (ต้องใช้ secret key จึงรันบนเครื่องคุณเท่านั้น ไม่ผ่านหน้าเว็บ)
//   npm run user:set -- "username" "PIN" --roles "staff,admin_สำรอง" --employee "<id พนักงาน>" --name "ชื่อที่แสดง"
//   npm run user:set -- "username" "PIN ใหม่"        (ถ้าบัญชีมีอยู่แล้ว = รีเซ็ต PIN)
//   npm run user:set -- "username" --roles "staff"    (แก้เฉพาะ Role โดยไม่เปลี่ยน PIN)
// หน้าเว็บ (พนักงาน → สร้างบัญชี / รีเซ็ต PIN) จะสร้างคำสั่งนี้ให้คัดลอกไปรัน
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { toEmail, toPassword } from './lib/auth.mjs';

const args = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) { flags[args[i].slice(2)] = args[i + 1]; i++; } else pos.push(args[i]);
}
const [username, pin] = pos;
const fail = (m) => { console.error('❌ ' + m); process.exit(1); };

if (!username) fail('ใช้: npm run user:set -- "username" "PIN" [--roles "a,b"] [--employee "id"] [--name "ชื่อ"]');
if (pin !== undefined && pin.trim().length < 6) fail('PIN ต้องมีอย่างน้อย 6 ตัวอักษร');
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) fail('ตั้งค่า SUPABASE_URL และ SUPABASE_SECRET_KEY ในไฟล์ .env ก่อน (รันในโฟลเดอร์หลักของโปรเจค)');
const sb = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// ตรวจข้อมูลอ้างอิงก่อนแตะบัญชีใดๆ
const roles = flags.roles ? flags.roles.split(',').map((s) => s.trim()).filter(Boolean) : null;
if (roles) {
  const { data, error } = await sb.from('roles').select('name');
  if (error) fail(error.message);
  const known = new Set(data.map((r) => r.name));
  const bad = roles.filter((r) => !known.has(r));
  if (bad.length) fail(`ไม่พบ Role: ${bad.join(', ')} (มี: ${[...known].join(', ')})`);
  if (!roles.length) fail('ต้องระบุอย่างน้อย 1 Role');
}
if (flags.employee) {
  const { data, error } = await sb.from('employees').select('id').eq('id', flags.employee).maybeSingle();
  if (error) fail(error.message);
  if (!data) fail(`ไม่พบพนักงานรหัส ${flags.employee}`);
}

const { data: allUsers, error: uerr } = await sb.from('app_users').select('id, username');
if (uerr) fail(uerr.message);
const row = allUsers.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());

// หา/สร้างผู้ใช้ใน Supabase Auth
const email = toEmail(username);
let authId;
for (let page = 1; !authId; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) fail('listUsers: ' + error.message);
  authId = data.users.find((u) => u.email === email)?.id;
  if (data.users.length < 200) break;
}
if (pin !== undefined) {
  if (authId) {
    const { error } = await sb.auth.admin.updateUserById(authId, { password: toPassword(pin) });
    if (error) fail('ตั้ง PIN ไม่สำเร็จ: ' + error.message);
    console.log('✓ ตั้ง PIN ใหม่แล้ว');
  } else {
    const { data, error } = await sb.auth.admin.createUser({ email, password: toPassword(pin), email_confirm: true, user_metadata: { username } });
    if (error) fail('สร้างบัญชีไม่สำเร็จ: ' + error.message);
    authId = data.user.id;
    console.log('✓ สร้างบัญชีใน Supabase Auth แล้ว');
  }
} else if (!authId) {
  fail('บัญชีนี้ยังไม่มี ต้องระบุ PIN เพื่อสร้างบัญชีใหม่');
}

// ตาราง app_users
const patch = { auth_user_id: authId };
if (roles) patch.roles = roles;
if (flags.employee) patch.employee_id = flags.employee;
if (flags.name) patch.display_name = flags.name;
if (row) {
  const { error } = await sb.from('app_users').update(patch).eq('id', row.id);
  if (error) fail('อัปเดตข้อมูลผู้ใช้ไม่สำเร็จ: ' + error.message);
  console.log(`✓ อัปเดตผู้ใช้ "${row.username}"`);
} else {
  const { error } = await sb.from('app_users').insert({ username: username.trim(), roles: roles ?? ['staff'], display_name: flags.name ?? null, employee_id: flags.employee ?? null, auth_user_id: authId });
  if (error) fail('เพิ่มข้อมูลผู้ใช้ไม่สำเร็จ: ' + error.message);
  console.log(`✓ เพิ่มผู้ใช้ "${username.trim()}" (roles: ${(roles ?? ['staff']).join(', ')})`);
}
console.log('✅ เสร็จ ผู้ใช้ล็อกอินด้วย username และ PIN นี้ได้ทันที');
