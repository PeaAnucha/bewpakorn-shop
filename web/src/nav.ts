import type { Action } from './auth/AuthProvider';

export interface NavItem {
  path: string;
  icon: string;
  label: string;
  /** ไม่ระบุ = ทุกคนที่ล็อกอินเห็น */
  perm?: [page: string, action: Action];
}

// กติกาเดียวกับระบบเดิม: เมนูแสดงตามสิทธิ์ใน can(page, action)
export const NAV: NavItem[] = [
  { path: 'dashboard', icon: '📊', label: 'แดชบอร์ด', perm: ['dashboard', 'view'] },
  { path: 'maps', icon: '🗺️', label: 'แมพ', perm: ['maps', 'view'] },
  { path: 'products', icon: '📦', label: 'สินค้า', perm: ['products', 'view'] },
  { path: 'shopids', icon: '🔑', label: 'ไอดีร้าน', perm: ['shopids', 'view'] },
  { path: 'employees', icon: '👥', label: 'พนักงาน', perm: ['employees', 'view'] },
  { path: 'schedule', icon: '📅', label: 'ตารางกะ' }, // ลิงก์ไปเว็บตารางกะแยก ทุกคนที่ล็อกอินเห็น
  { path: 'stockcount', icon: '🧮', label: 'นับสต็อก', perm: ['products', 'edit'] },
];
