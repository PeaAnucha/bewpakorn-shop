// สำรอง/กู้คืนข้อมูลทั้งระบบ (Supabase แพ็กเกจฟรีไม่มีสำรองอัตโนมัติ จึงควรรันเป็นประจำ)
//   npm run backup                                   -> บันทึกทุกตารางเป็นไฟล์ JSON ที่ backups/<วันที่_เวลา>/
//   npm run restore -- backups/<โฟลเดอร์> --yes      -> กู้คืนทุกตาราง (upsert ทับของเดิม ไม่ลบแถวที่เพิ่มทีหลัง)
//   npm run restore -- backups/<โฟลเดอร์> --yes --tables products,ghost_items   -> กู้คืนเฉพาะบางตาราง
// ไม่รวม: ไฟล์รูปใน Storage และบัญชีใน Supabase Auth (PIN) ถ้าต้องสร้างโปรเจคใหม่ให้ใช้ npm run auth:users / user:set
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) { console.error('❌ ตั้งค่า SUPABASE_URL และ SUPABASE_SECRET_KEY ในไฟล์ .env ก่อน'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// ลำดับนี้ตรงกับการอ้างอิงระหว่างตาราง (ตารางที่ถูกอ้างถึงมาก่อน)
const TABLES = [
  ['roles', 'id'], ['permissions', 'role,page'], ['employees', 'id'], ['ranks', 'id'], ['maps', 'id'],
  ['shop_ids', 'id'], ['products', 'id'], ['ghost_items', 'id'], ['app_users', 'id'],
];
const args = process.argv.slice(2);
const mode = path.basename(process.argv[1]).includes('restore') || args[0] === 'restore' ? 'restore' : 'backup';

async function readAll(table, orderCol) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('*').order(orderCol).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

if (mode === 'backup') {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16).replace(/-(\d\d)-(\d\d)$/, '_$1$2');
  const dir = path.join('backups', stamp);
  fs.mkdirSync(dir, { recursive: true });
  const summary = {};
  for (const [table, key] of TABLES) {
    const rows = await readAll(table, key.split(',')[0]);
    fs.writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(rows, null, 1));
    summary[table] = rows.length;
    console.log(`  ✓ ${table}: ${rows.length}`);
  }
  fs.writeFileSync(path.join(dir, '_info.json'), JSON.stringify({ at: new Date().toISOString(), source: SUPABASE_URL, rows: summary }, null, 1));
  console.log(`\n✅ สำรองข้อมูลแล้วที่ ${dir}\n   (ไฟล์มีรหัสผ่านไอดีร้านเป็นข้อความธรรมดา เก็บไว้ที่ปลอดภัย ห้ามอัปขึ้น GitHub ซึ่ง .gitignore กันไว้ให้แล้ว)`);
} else {
  const dir = args.find((a) => !a.startsWith('--') && a !== 'restore');
  if (!dir || !fs.existsSync(dir)) { console.error('❌ ระบุโฟลเดอร์สำรองข้อมูล เช่น npm run restore -- backups/2026-10-12_1030 --yes'); process.exit(1); }
  const tIdx = args.indexOf('--tables');
  const only = tIdx >= 0 ? args[tIdx + 1].split(',').map((x) => x.trim()) : null;
  const bad = (only ?? []).filter((t) => !TABLES.some(([n]) => n === t));
  if (bad.length) { console.error(`❌ ไม่รู้จักตาราง: ${bad.join(', ')}`); process.exit(1); }
  const todo = TABLES.filter(([t]) => (!only || only.includes(t)) && fs.existsSync(path.join(dir, `${t}.json`)));
  console.log(`กู้คืนจาก ${dir} ไปที่ ${SUPABASE_URL}\nตาราง: ${todo.map(([t]) => t).join(', ')}`);
  if (!args.includes('--yes')) { console.error('\n⛔ ยังไม่ได้เขียนอะไร นี่จะเขียนทับข้อมูลปัจจุบันด้วยค่าจากไฟล์สำรอง ถ้าแน่ใจให้เพิ่ม --yes'); process.exit(1); }
  for (const [table, key] of todo) {
    const rows = JSON.parse(fs.readFileSync(path.join(dir, `${table}.json`), 'utf8'));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from(table).upsert(rows.slice(i, i + 200), { onConflict: key });
      if (error) { console.error(`\n❌ ${table}: ${error.message}`); process.exit(1); }
    }
    console.log(`  ✓ ${table}: ${rows.length}`);
  }
  console.log('\n✅ กู้คืนเสร็จ (สต็อกของเซ็ตจะคำนวณใหม่อัตโนมัติ)');
}
