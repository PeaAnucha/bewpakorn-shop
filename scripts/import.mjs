// นำเข้าข้อมูลจาก xlsx (export จาก Google Sheet) เข้า Supabase
//   npm run import:dry                          -> อ่านและตรวจข้อมูล ไม่เขียนอะไร
//   npm run import -- --yes                     -> อัปเดตข้อมูลหลัก (แมพ, Shop ID, สินค้า, ghost) จากชีต รันซ้ำได้ (upsert)
//   npm run import -- --yes --tables all        -> ทุกตาราง รวม roles/permissions/พนักงาน/ยศ (ใช้ตอนติดตั้งใหม่เท่านั้น)
//   npm run import -- --yes --tables products   -> เฉพาะบางตาราง คั่นด้วยจุลภาค
//   เพิ่ม --overwrite-order เพื่อให้ลำดับสินค้าตามชีต (ปกติจะคงลำดับที่จัดไว้ในเว็บ)
// ไม่รวมบัญชีผู้ใช้: ใช้ npm run auth:users หรือ npm run user:set แทน
// ข้อมูลที่ลบในชีตจะไม่ถูกลบในระบบใหม่ (ลบเองในเว็บ)
import 'dotenv/config';
import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');
const FILE = process.env.XLSX_PATH || 'data/stock.xlsx';
const RETIRED_PAGES = new Set(['schedule', 'holidays']);
const warnings = [];
const warn = (m) => warnings.push(m);

// ───────── helpers ─────────
const plain = (v) => {
  if (v == null) return null;
  if (typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return plain(v.result);
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return v.text;
    return String(v);
  }
  if (typeof v === 'string') return v.trim() === '' ? null : v;
  return v;
};

// ID เดิมเป็นรหัส 8 ตัว เช่น "93584E67" หรือ "01234567" ซึ่ง Excel/Sheets อาจแปลงเป็นตัวเลข
// ฟังก์ชันนี้ทำให้ ID เดียวกันได้ผลเหมือนกันทุกชีต ไม่ว่าจะเป็นข้อความหรือตัวเลข
function normId(x) {
  x = plain(x);
  if (x == null) return null;
  const numLike = typeof x === 'number' || /^\d+$/.test(String(x)) || /^\d+E\d+$/i.test(String(x));
  if (!numLike) return String(x).trim();
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x).trim();
  if (Number.isInteger(n) && n < 1e15) return String(n).padStart(8, '0');
  const [m, e] = n.toExponential().split('e');
  const digits = m.replace('.', '');
  return `${digits}E${Number(e) - (digits.length - 1)}`;
}
const int = (v, d = null) => { v = plain(v); const n = Number(v); return v == null || !Number.isFinite(n) ? d : Math.round(n); };
const str = (v) => { v = plain(v); return v == null ? null : String(v); };
const bool = (v) => ['true', '1', 'yes'].includes(String(plain(v)).toLowerCase());
const iso = (v) => {
  v = plain(v); if (v == null) return undefined;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};
const ymd = (v) => {
  v = plain(v); if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const ym = (v) => {
  v = plain(v); if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 7);
  const m = String(v).match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
};
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// ───────── อ่านชีต ─────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);
function sheet(name) {
  const ws = wb.getWorksheet(name);
  if (!ws) { warn(`ไม่พบชีต ${name}`); return []; }
  const head = [];
  ws.getRow(1).eachCell((c, i) => { head[i] = String(plain(c.value) ?? '').trim(); });
  const out = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = row.getCell(i).value; });
    if (plain(o[head.find(Boolean)]) == null) return; // ข้ามแถวว่าง
    out.push(o);
  });
  return out;
}
function dedupe(rows, key, table) {
  const seen = new Set(); const out = [];
  for (const r of rows) {
    const k = typeof key === 'function' ? key(r) : r[key];
    if (seen.has(k)) { warn(`${table}: พบคีย์ซ้ำ "${k}" ข้ามแถวที่ซ้ำ`); continue; }
    seen.add(k); out.push(r);
  }
  return out;
}

// ───────── แปลงข้อมูล ─────────
const T = {};
T.roles = dedupe(sheet('Roles').map((r) => clean({
  id: normId(r.id), name: str(r.name), label: str(r.label) ?? str(r.name), color: str(r.color), created_at: iso(r.createdAt),
})).filter((r) => r.name), 'name', 'roles');
const roleNames = new Set(T.roles.map((r) => r.name));

T.permissions = dedupe(sheet('Permissions').map((r) => ({
  role: str(r.role), page: str(r.page),
  actions: (str(r.actions) ?? '').split(',').map((s) => s.trim()).filter(Boolean),
})).filter((r) => {
  if (!r.role || !r.page) return false;
  if (RETIRED_PAGES.has(r.page)) return false; // หน้าที่เลิกใช้แล้ว (เฟส 4)
  if (!roleNames.has(r.role)) { warn(`permissions: role "${r.role}" ไม่มีในตาราง roles ข้าม`); return false; }
  return true;
}), (r) => `${r.role}|${r.page}`, 'permissions');

T.employees = dedupe(sheet('Employees').map((r) => clean({
  id: normId(r.id), name: str(r.name), position: str(r.position), email: str(r.email), created_at: iso(r.createdAt),
})).filter((r) => r.id && r.name), 'id', 'employees');
const empIds = new Set(T.employees.map((r) => r.id));

T.ranks = dedupe(sheet('Ranks').map((r) => clean({
  id: normId(r.id), employee_id: normId(r.employeeId), pronoun: str(r.pronoun), rank: str(r.rank), updated_at: iso(r.updatedAt),
})).filter((r) => {
  if (!empIds.has(r.employee_id)) { warn(`ranks: ไม่พบพนักงาน ${r.employee_id} ข้าม`); return false; }
  return true;
}), 'employee_id', 'ranks');

T.maps = dedupe(sheet('Maps').map((r) => clean({
  id: normId(r.id), name: str(r.name), icon: str(r.icon), description: str(r.description), created_at: iso(r.createdAt),
})).filter((r) => r.id && r.name), 'id', 'maps');
const mapIds = new Set(T.maps.map((r) => r.id));

T.shop_ids = dedupe(sheet('ShopIDs').map((r) => {
  const map_id = normId(r.mapId);
  if (map_id && !mapIds.has(map_id)) warn(`shop_ids: ${str(r.shopId)} อ้างแมพ ${map_id} ที่ไม่มีอยู่ ตั้งเป็นว่าง`);
  return clean({
    id: normId(r.id), shop_id: str(r.shopId), password: str(r.password), map_id: map_id && mapIds.has(map_id) ? map_id : null,
    note: str(r.note), created_at: iso(r.createdAt), updated_at: iso(r.updatedAt),
  });
}).filter((r) => r.id && r.shop_id), 'id', 'shop_ids');
T.shop_ids = dedupe(T.shop_ids, 'shop_id', 'shop_ids');
const shopIds = new Set(T.shop_ids.map((r) => r.id));

function parseBundle(raw, pname) {
  const s = str(raw);
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return arr.map((it) => (it.productId && !String(it.productId).startsWith('__ghost__:') ? { ...it, productId: normId(it.productId) } : it));
  } catch { warn(`products: bundle_items ของ "${pname}" อ่าน JSON ไม่ได้ ตั้งเป็น []`); return []; }
}
T.products = dedupe(sheet('Products').map((r) => {
  const map_id = normId(r.mapId); const ref = normId(r.shopIdRef);
  if (map_id && !mapIds.has(map_id)) warn(`products: "${str(r.name)}" อ้างแมพ ${map_id} ที่ไม่มีอยู่`);
  if (ref && !shopIds.has(ref)) warn(`products: "${str(r.name)}" อ้างไอดีร้าน ${ref} ที่ไม่มีอยู่`);
  return clean({
    id: normId(r.id), name: str(r.name), map_id: map_id && mapIds.has(map_id) ? map_id : null,
    shop_id_ref: ref && shopIds.has(ref) ? ref : null, stock: int(r.stock, 0), description: str(r.description),
    status: str(r.status) ?? 'active', image_url: str(r.imageUrl), is_bundle: bool(r.is_bundle),
    bundle_items: parseBundle(r.bundle_items, str(r.name)), sort_order: int(r.sortOrder),
    created_at: iso(r.createdAt), updated_at: iso(r.updatedAt),
  });
}).filter((r) => r.id && r.name), 'id', 'products');

{ // ตรวจว่าสินค้าในเซ็ต (bundle) ชี้ไปหาสินค้า/ghost item ที่มีอยู่จริง
  const pIds = new Set(T.products.map((p) => p.id));
  const gNames = new Set(sheet('GhostItems').map((g) => str(g.name)));
  for (const p of T.products.filter((x) => x.is_bundle)) {
    for (const it of p.bundle_items) {
      const id = String(it.productId ?? '');
      if (id.startsWith('__ghost__:') ? !gNames.has(id.slice(10)) : !pIds.has(id))
        warn(`bundle "${p.name}": อ้างถึง ${id} ที่ไม่พบ`);
    }
  }
}

T.ghost_items = dedupe(sheet('GhostItems').map((r) => clean({
  id: normId(r.id), name: str(r.name), stock: int(r.stock, 0), note: str(r.note), sort_order: int(r.sortOrder), updated_at: iso(r.updatedAt),
})).filter((r) => r.id && r.name), 'name', 'ghost_items');

// หมายเหตุ: ตารางงาน/โหวตวันหยุด/เช็กอิน เลิกใช้แล้ว (เฟส 4) จึงไม่นำเข้า

// ผู้ใช้: hash PIN ทันที ไม่เก็บ PIN จริง; รูป base64 จะถูกอัปโหลดทีหลัง
const rawUsers = dedupe(sheet('Users').filter((r) => plain(r.username)), (r) => plain(r.username), 'users');
const usersBase = rawUsers.map((r) => {
  const pin = str(r.pin);
  if (!pin) warn(`users: ${str(r.username)} ไม่มี PIN`);
  const emp = normId(r.employeeId);
  return {
    id: normId(r.id), username: str(r.username), pin,
    roles: (str(r.roles) ?? 'staff').split(',').map((s) => s.trim()).filter(Boolean),
    employee_id: emp && empIds.has(emp) ? emp : null, display_name: str(r.displayName),
    avatar: str(r.profilePic), created_at: iso(r.createdAt),
  };
});
for (const u of usersBase) for (const role of u.roles) if (!roleNames.has(role)) warn(`users: ${u.username} มี role "${role}" ที่ไม่มีในตาราง roles`);

// ───────── โหมดสร้างไฟล์ SQL (--sql out.sql) ─────────
const SQL_OUT = process.argv.includes('--sql') ? process.argv[process.argv.indexOf('--sql') + 1] : null;
if (SQL_OUT) {
  const fs = await import('node:fs');
  const lit = (col, table, v) => {
    if (v === undefined) return 'default';
    if (v === null) return 'null';
    if (col === 'bundle_items') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    if (Array.isArray(v)) {
      if (!v.length) return "'{}'";
      return v.every((x) => typeof x === 'number')
        ? `array[${v.join(',')}]::integer[]`
        : `array[${v.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(',')}]::text[]`;
    }
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    const q = `'${String(v).replace(/'/g, "''")}'`;
    if (/_at$|^ts$/.test(col)) return `${q}::timestamptz`;
    return q;
  };
  const insert = (table, rows) => {
    if (!rows.length) return '';
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    let out = '';
    for (let i = 0; i < rows.length; i += 100) {
      const vals = rows.slice(i, i + 100).map((r) => '  (' + cols.map((c) => lit(c, table, r[c])).join(', ') + ')').join(',\n');
      out += `insert into public.${table} (${cols.join(', ')}) values\n${vals};\n`;
    }
    return `-- ${table}: ${rows.length} แถว\n${out}\n`;
  };
  const schema = fs.readFileSync('supabase/migrations/001_schema.sql', 'utf8');
  const sqlUsers = [];
  for (const u of usersBase) {
    sqlUsers.push(clean({
      id: u.id, username: u.username, pin_hash: await bcrypt.hash(u.pin ?? crypto.randomUUID(), 10), roles: u.roles,
      employee_id: u.employee_id, display_name: u.display_name,
      avatar_url: u.avatar?.startsWith('data:') ? null : u.avatar, created_at: u.created_at,
    }));
  }
  const order = ['roles', 'permissions', 'employees', 'ranks', 'maps', 'shop_ids', 'products', 'ghost_items'];
  let sql = `-- BewpakornShop: schema + ข้อมูลทั้งหมดในไฟล์เดียว (สร้างอัตโนมัติ)\n-- รันครั้งเดียวใน Supabase SQL Editor ถ้าผิดพลาดจะถูกยกเลิกทั้งหมด (rollback)\n`
    + `-- ⚠️ ไฟล์นี้มีรหัสผ่านไอดีร้านเป็นข้อความธรรมดา ห้ามแชร์หรืออัปขึ้นที่สาธารณะ\n\nbegin;\n\n${schema}\n`
    + order.map((t) => insert(t, T[t])).join('') + insert('app_users', sqlUsers) + 'commit;\n';
  fs.mkdirSync('out', { recursive: true });
  fs.writeFileSync(SQL_OUT, sql);
  console.log(`เขียน ${SQL_OUT} แล้ว (${(sql.length / 1024).toFixed(0)} KB)`);
  console.table(Object.fromEntries([...order.map((t) => [t, T[t].length]), ['app_users', sqlUsers.length]]));
  if (warnings.length) warnings.forEach((w) => console.log(' ⚠️', w));
  process.exit(0);
}

// ───────── สรุปก่อนเขียน ─────────
const counts = Object.fromEntries([...Object.entries(T).map(([k, v]) => [k, v.length]), ['app_users', usersBase.length]]);
console.log(DRY ? '\n[DRY RUN] ไม่มีการเขียนข้อมูลลงฐานข้อมูล' : '\n[IMPORT]');
console.table(counts);
const bundles = T.products.filter((p) => p.is_bundle).length;
console.log(`สินค้าแบบเซ็ต (bundle): ${bundles} รายการ | รูปโปรไฟล์แบบ base64: ${usersBase.filter((u) => u.avatar?.startsWith('data:')).length} รูป`);
if (warnings.length) { console.log(`\n⚠️  คำเตือน ${warnings.length} รายการ:`); warnings.forEach((w) => console.log(' -', w)); }
else console.log('\n✅ ไม่มีคำเตือน');
if (DRY) process.exit(0);

// ───────── เขียนลง Supabase ─────────
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) { console.error('\n❌ ตั้งค่า SUPABASE_URL และ SUPABASE_SECRET_KEY ในไฟล์ .env ก่อน'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const ORDER = [
  ['roles', 'id'], ['permissions', 'role,page'], ['employees', 'id'], ['ranks', 'id'],
  ['maps', 'id'], ['shop_ids', 'id'], ['products', 'id'], ['ghost_items', 'name'],
];
const DEFAULT_TABLES = ['maps', 'shop_ids', 'products', 'ghost_items'];
const tArg = process.argv.includes('--tables') ? process.argv[process.argv.indexOf('--tables') + 1] : null;
const chosen = tArg === 'all' ? ORDER.map(([t]) => t) : tArg ? tArg.split(',').map((x) => x.trim()) : DEFAULT_TABLES;
const unknown = chosen.filter((t) => !ORDER.some(([n]) => n === t));
if (unknown.length) { console.error(`\n❌ ไม่รู้จักตาราง: ${unknown.join(', ')} (ใช้ได้: ${ORDER.map(([t]) => t).join(', ')}, all)`); process.exit(1); }
const OVERWRITE_ORDER = process.argv.includes('--overwrite-order');
const payload = { ...T };
if (!OVERWRITE_ORDER) payload.products = T.products.map(({ sort_order, ...rest }) => rest); // คงลำดับที่จัดไว้ในเว็บ

async function fetchAllRows(table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).order(cols.split(',')[0]).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// สรุปผลกระทบก่อนเขียน (สินค้า)
console.log(`\nปลายทาง: ${SUPABASE_URL}\nตารางที่จะอัปเดต: ${chosen.join(', ')}${OVERWRITE_ORDER ? ' (ลำดับตามชีต)' : ''}`);
if (chosen.includes('products')) {
  const cur = new Map((await fetchAllRows('products', 'id,stock')).map((r) => [r.id, r.stock]));
  let changed = 0, added = 0;
  for (const p of T.products) { if (!cur.has(p.id)) added++; else if (cur.get(p.id) !== p.stock && !p.is_bundle) changed++; }
  console.log(`สินค้า: สต็อกจะเปลี่ยน ${changed} รายการ · เพิ่มใหม่ ${added} รายการ (เซ็ตคำนวณใหม่อัตโนมัติ)`);
}
if (!process.argv.includes('--yes')) {
  console.error('\n⛔ ยังไม่ได้เขียนอะไร นี่จะเขียนทับข้อมูลในระบบด้วยค่าจากชีต ถ้าแน่ใจให้เพิ่ม --yes\n   (เช่น npm run import -- --yes) ห้ามรันหลังเริ่มใช้ระบบใหม่จริงแล้ว เพราะจะย้อนสต็อกกลับเป็นค่าในชีต');
  process.exit(1);
}

// แยกกลุ่มตามชุดคอลัมน์ที่มีค่า: PostgREST จะใส่ null ให้คอลัมน์ที่บางแถวไม่มี (เช่น created_at ที่ชีตเว้นว่าง)
// ทำให้ชน NOT NULL หรือเขียนทับค่าเดิมด้วย null การแยกกลุ่มจึงอัปเดตเฉพาะคอลัมน์ที่มีค่าจริง
async function upsert(table, rows, onConflict) {
  const groups = new Map();
  for (const r of rows) {
    const sig = Object.keys(r).sort().join(',');
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(r);
  }
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += 200) {
      const { error } = await sb.from(table).upsert(group.slice(i, i + 200), { onConflict });
      if (error) { console.error(`\n❌ ${table}: ${error.message}`); process.exit(1); }
    }
  }
  console.log(`  ✓ ${table}: ${rows.length}`);
}

console.log('\nกำลังเขียนข้อมูล...');
for (const [table, key] of ORDER) if (chosen.includes(table)) await upsert(table, payload[table], key);

// ตรวจจำนวนแถวหลังเขียน (ในฐานข้อมูลอาจมีมากกว่าชีต ถ้ามีรายการที่เพิ่มในระบบใหม่ จึงเตือนเฉพาะกรณีน้อยกว่า)
console.log('\nตรวจจำนวนแถวในฐานข้อมูล:');
let ok = true;
for (const table of chosen) {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  const expected = T[table].length;
  const pass = !error && count >= expected; ok &&= pass;
  console.log(`  ${pass ? '✓' : '✗'} ${table}: ฐานข้อมูล ${error ? error.message : count} / ชีต ${expected}${!error && count > expected ? ' (มีเพิ่มจากระบบใหม่)' : ''}`);
}
console.log(ok ? '\n✅ นำเข้าเสร็จสมบูรณ์' : '\n⚠️  มีบางตารางแถวน้อยกว่าชีต ตรวจสอบรายการ ✗ ด้านบน');
