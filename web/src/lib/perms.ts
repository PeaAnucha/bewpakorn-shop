export type Action = 'view' | 'add' | 'edit' | 'delete' | 'export' | 'approve';
export type PermMap = Record<string, Action[]>;

/** หน้าที่ตั้งสิทธิ์ได้ และสิทธิ์ที่มีความหมายของแต่ละหน้า */
export const PAGES: { key: string; label: string; actions: Action[]; note?: string }[] = [
  { key: 'dashboard', label: '📊 Dashboard', actions: ['view'] },
  { key: 'maps', label: '🗺️ แมพ', actions: ['view', 'add', 'edit', 'delete'], note: 'แก้ไข = จัดลำดับแมพได้ด้วย' },
  { key: 'products', label: '🎁 สินค้า', actions: ['view', 'add', 'edit', 'delete', 'export'], note: 'แก้ไข = จัดลำดับสินค้าได้ด้วย' },
  { key: 'stockcount', label: '🧮 นับสต็อก', actions: ['view', 'edit'], note: 'แก้ไข = บันทึกจำนวนและสถานะรอบนับได้' },
  { key: 'shopids', label: '🔑 Shop IDs', actions: ['view', 'add', 'edit', 'delete'], note: 'ดู = เห็นรหัสผ่านไอดีด้วย · แก้ไข = จัดลำดับได้ด้วย' },
  { key: 'employees', label: '👥 พนักงาน & ยศ', actions: ['view', 'add', 'edit', 'delete'] },
];
export const ACTIONS: Action[] = ['view', 'add', 'edit', 'delete', 'export'];
export const ACTION_LABEL: Record<string, string> = { view: 'ดู', add: 'เพิ่ม', edit: 'แก้ไข', delete: 'ลบ', export: 'Export', approve: 'อนุมัติ' };

const ORDER: Action[] = ['view', 'add', 'edit', 'delete', 'export', 'approve'];

/** กฎเดิม: ติ๊กสิทธิ์อื่นของหน้า → ต้องมี "ดู" ด้วย · เอา "ดู" ออก → สิทธิ์อื่นของหน้านั้นถูกเอาออกทั้งหมด */
export function toggleAction(cur: PermMap, page: string, action: Action, on: boolean): PermMap {
  const set = new Set(cur[page] ?? []);
  if (on) { set.add(action); if (action !== 'view') set.add('view'); }
  else if (action === 'view') set.clear();
  else set.delete(action);
  return { ...cur, [page]: ORDER.filter((a) => set.has(a)) };
}

/** ตัดหน้าที่ไม่มีสิทธิ์ใดๆ ออก และจัดลำดับสิทธิ์ให้คงที่ (ก่อนส่งบันทึก) */
export function cleanPerms(p: PermMap): PermMap {
  const out: PermMap = {};
  for (const [page, acts] of Object.entries(p)) {
    const set = new Set(acts);
    if (set.size) out[page] = ORDER.filter((a) => set.has(a));
  }
  return out;
}
