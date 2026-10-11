// สร้างผู้ใช้ใน Supabase Auth จากชีต Users ใน xlsx (username + PIN เดิม) แล้วผูกกับ app_users
// ย้ายรูปโปรไฟล์ base64 ไป Storage ด้วย รันซ้ำได้ (ถ้ามีผู้ใช้อยู่แล้วจะอัปเดต PIN ให้ตรงกับไฟล์)
//   npm run auth:users
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { toEmail, toPassword } from './lib/auth.mjs';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) { console.error('❌ ตั้งค่า SUPABASE_URL และ SUPABASE_SECRET_KEY ในไฟล์ .env ก่อน'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(process.env.XLSX_PATH || 'data/stock.xlsx');
const ws = wb.getWorksheet('Users');
const head = []; ws.getRow(1).eachCell((c, i) => { head[i] = String(c.value ?? '').trim(); });
const cell = (v) => (v && typeof v === 'object' && 'text' in v ? v.text : v);
const users = [];
ws.eachRow((row, n) => {
  if (n === 1) return;
  const o = {}; head.forEach((h, i) => { if (h) o[h] = cell(row.getCell(i).value); });
  if (o.username) users.push({ username: String(o.username).trim(), pin: String(o.pin ?? '').trim(), avatar: o.profilePic ? String(o.profilePic) : null, id: String(o.id) });
});

await sb.storage.createBucket('avatars', { public: true, fileSizeLimit: '2MB' }).catch(() => {});

// หา auth user ที่มีอยู่แล้ว (กรณีรันซ้ำ)
const existing = new Map();
for (let page = 1; ; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error('❌ listUsers:', error.message); process.exit(1); }
  data.users.forEach((u) => existing.set(u.email, u));
  if (data.users.length < 200) break;
}

let failed = 0;
for (const u of users) {
  const email = toEmail(u.username);
  if (!u.pin) { console.log(`✗ ${u.username}: ไม่มี PIN ข้าม`); failed++; continue; }
  let authId = existing.get(email)?.id;
  if (authId) {
    const { error } = await sb.auth.admin.updateUserById(authId, { password: toPassword(u.pin) });
    if (error) { console.log(`✗ ${u.username}: ${error.message}`); failed++; continue; }
  } else {
    const { data, error } = await sb.auth.admin.createUser({ email, password: toPassword(u.pin), email_confirm: true, user_metadata: { username: u.username } });
    if (error) { console.log(`✗ ${u.username}: ${error.message}`); failed++; continue; }
    authId = data.user.id;
  }
  const patch = { auth_user_id: authId };
  const m = u.avatar?.match(/^data:(image\/(\w+));base64,(.+)$/s);
  if (m) {
    const path = `${u.id}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`;
    const up = await sb.storage.from('avatars').upload(path, Buffer.from(m[3], 'base64'), { contentType: m[1], upsert: true });
    if (up.error) console.log(`  ⚠️ อัปโหลดรูป ${u.username} ไม่สำเร็จ: ${up.error.message}`);
    else patch.avatar_url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  }
  const { data: upd, error: e2 } = await sb.from('app_users').update(patch).eq('username', u.username).select('id');
  if (e2 || !upd?.length) { console.log(`✗ ${u.username}: ผูกกับ app_users ไม่สำเร็จ ${e2?.message ?? '(ไม่พบ username ในตาราง)'}`); failed++; continue; }
  console.log(`✓ ${u.username} -> ${email}${patch.avatar_url ? ' (ย้ายรูปแล้ว)' : ''}`);
}

const { count } = await sb.from('app_users').select('*', { count: 'exact', head: true }).not('auth_user_id', 'is', null);
console.log(`\nผูกแล้ว ${count}/${users.length} คน${failed ? ` | ล้มเหลว ${failed}` : ' ✅'}`);
process.exit(failed ? 1 : 0);
