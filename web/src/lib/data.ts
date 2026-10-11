import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { orderShopIds } from './products.ts';
import { toEmail, toPassword } from './auth';
import type { PermMap } from './perms';
import type { BundleItem, Ghost, MapRow, Product, ShopIdRow } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ───────── อ่านข้อมูล ─────────
// Supabase ส่งได้สูงสุด 1,000 แถวต่อครั้ง จึงดึงเป็นหน้าๆ จนครบ
async function fetchAll(table: string, order: string): Promise<any[]> {
  const out: any[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase.from(table).select('*').order(order).order('id').range(from, from + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

const toMap = (r: any): MapRow => ({ id: r.id, name: r.name, icon: r.icon, description: r.description, sortOrder: r.sort_order });
const toShop = (r: any): ShopIdRow => ({ id: r.id, shopId: r.shop_id, password: r.password, mapId: r.map_id, note: r.note, sortOrder: r.sort_order });
const toGhost = (r: any): Ghost => ({ id: r.id, name: r.name, stock: r.stock ?? 0, note: r.note, sortOrder: r.sort_order, updatedAt: r.updated_at });
const toProduct = (r: any): Product => ({
  id: r.id, name: r.name, mapId: r.map_id, shopIdRef: r.shop_id_ref, stock: r.stock ?? 0, description: r.description,
  status: r.status ?? 'active', thumbnail: r.image_url, isBundle: !!r.is_bundle,
  bundleItems: Array.isArray(r.bundle_items) ? (r.bundle_items as BundleItem[]) : [],
  sortOrder: r.sort_order, createdAt: r.created_at, updatedAt: r.updated_at,
});

export const useMaps = () => useQuery({ queryKey: ['maps'], queryFn: async () => (await fetchAll('maps', 'created_at')).map(toMap).sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9)) });
export const useShopIds = () => useQuery({ queryKey: ['shopIds'], queryFn: async () => (await fetchAll('shop_ids', 'created_at')).map(toShop) });
/** Shop ID เรียงตามลำดับที่จัดไว้ (ลำดับเดียวทั้งระบบ ใช้ทุกที่ที่แสดงรายการ Shop ID) */
export function useShopIdsOrdered() {
  const q = useShopIds();
  const data = useMemo(() => (q.data ? orderShopIds(q.data) : q.data), [q.data]);
  return { ...q, data };
}
export const useProducts = () => useQuery({ queryKey: ['products'], queryFn: async () => (await fetchAll('products', 'created_at')).map(toProduct) });
export const useGhosts = () => useQuery({ queryKey: ['ghosts'], queryFn: async () => (await fetchAll('ghost_items', 'name')).map(toGhost) });

/** รีเฟรชข้อมูลทุกชุดหลังบันทึก (สต็อกเซ็ต/ghost เปลี่ยนตามกันได้) */
export function useRefreshData() {
  const qc = useQueryClient();
  return () => Promise.all(['maps', 'shopIds', 'products', 'ghosts', 'count', 'employees', 'roles', 'appUsers', 'permRows'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

// ───────── จัดการข้อผิดพลาด ─────────
export function errMsg(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const m = err?.message ?? String(e);
  if (err?.code === '23505') return 'ข้อมูลซ้ำกับที่มีอยู่แล้ว';
  if (err?.code === '42501' || /row-level security|permission denied/i.test(m)) return 'ไม่มีสิทธิ์ทำรายการนี้';
  return m;
}

const NO_EFFECT = 'ไม่มีสิทธิ์ หรือไม่พบข้อมูลที่จะแก้ไข';

async function run<T>(p: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(errMsg(error));
  return data as T;
}

// PostgREST จะไม่แจ้ง error เมื่อ RLS กรองแถวออกหมด จึงต้องเช็กจำนวนแถวที่ถูกแก้/ลบจริง
const expectRows = (rows: any[] | null, n: number) => {
  if (!rows || rows.length < n) throw new Error(NO_EFFECT);
};

// ───────── แมพ ─────────
export async function saveMap(id: string | null, v: { name: string; icon: string; description: string }) {
  const row = { name: v.name.trim(), icon: v.icon.trim() || '🗺️', description: v.description.trim() || null };
  if (id) expectRows(await run(supabase.from('maps').update(row).eq('id', id).select('id')), 1);
  else await run(supabase.from('maps').insert(row));
}
/** บันทึกลำดับแมพทั้งชุด (ids เรียงตามลำดับที่ต้องการ) */
export async function reorderMaps(ids: string[]) {
  return run(supabase.rpc('reorder_maps', { p_ids: ids }));
}
export async function deleteMaps(ids: string[]) {
  expectRows(await run(supabase.from('maps').delete().in('id', ids).select('id')), ids.length);
}

// ───────── Shop IDs ─────────
export interface ShopIdInput { shopId: string; password: string; mapId: string; note: string }
export async function saveShopId(id: string | null, v: ShopIdInput) {
  const row = { shop_id: v.shopId.trim(), password: v.password || null, map_id: v.mapId || null, note: v.note.trim() || null };
  if (id) expectRows(await run(supabase.from('shop_ids').update(row).eq('id', id).select('id')), 1);
  else await run(supabase.from('shop_ids').insert(row));
}
export async function addShopIds(items: ShopIdInput[]) {
  const rows = items.map((v) => ({ shop_id: v.shopId.trim(), password: v.password || null, map_id: v.mapId || null, note: v.note.trim() || null }));
  await run(supabase.from('shop_ids').insert(rows));
}
/** บันทึกลำดับ Shop ID ของแมพหนึ่งทั้งชุด */
export async function reorderShopIds(ids: string[]) {
  return run(supabase.rpc('reorder_shop_ids', { p_ids: ids }));
}
export async function deleteShopIds(ids: string[]) {
  expectRows(await run(supabase.from('shop_ids').delete().in('id', ids).select('id')), ids.length);
}

// ───────── สินค้า ─────────
export interface ProductInput {
  name: string; mapId: string; shopIdRef: string; stock: number; description: string; status: string;
  thumbnail: string; isBundle: boolean; bundleItems: BundleItem[]; sortOrder: number | null;
}
/** บันทึกผ่านฟังก์ชันในฐานข้อมูล: ลงทะเบียน Ghost ใหม่ + คำนวณสต็อกเซ็ตให้อัตโนมัติ */
export async function saveProduct(id: string | null, v: ProductInput): Promise<string> {
  return run(
    supabase.rpc('save_product', {
      p_id: id,
      p: {
        name: v.name, map_id: v.mapId, shop_id_ref: v.shopIdRef, stock: v.stock, description: v.description, status: v.status,
        image_url: v.thumbnail, is_bundle: v.isBundle, bundle_items: v.bundleItems, sort_order: v.sortOrder,
      },
    }),
  );
}
export interface BulkProductInput { name: string; mapId: string; shopIdRef: string; stock: number; description: string; status: string }
export async function addProducts(items: BulkProductInput[]) {
  const rows = items.map((v) => ({
    name: v.name, map_id: v.mapId || null, shop_id_ref: v.shopIdRef || null, stock: v.stock,
    description: v.description || null, status: v.status, is_bundle: false, bundle_items: [],
  }));
  await run(supabase.from('products').insert(rows));
}
export async function deleteProducts(ids: string[]) {
  expectRows(await run(supabase.from('products').delete().in('id', ids).select('id')), ids.length);
}
export async function bulkUpdateSort(items: { id: string; sort: number | null }[]) {
  return run(supabase.rpc('bulk_update_sort', { p_items: items }));
}
export async function saveStockCount(products: { id: string; stock: number }[], ghosts: { id: string; stock: number }[]) {
  return run(supabase.rpc('save_stock_count', { p_products: products, p_ghosts: ghosts }));
}

// ───────── พนักงาน / Role / บัญชี / สิทธิ์ ─────────
export interface Employee { id: string; name: string; position: string | null; email: string | null; pronoun: string | null; rank: string | null }
export interface RoleRow { id: string; name: string; label: string; color: string | null }
export interface AppUser { id: string; username: string; displayName: string | null; avatarUrl: string | null; roles: string[]; employeeId: string | null }
export interface PermRow { role: string; page: string; actions: string[] }

export const useEmployees = () => useQuery({
  queryKey: ['employees'],
  queryFn: async (): Promise<Employee[]> => {
    const [emps, ranks] = await Promise.all([fetchAll('employees', 'created_at'), fetchAll('ranks', 'updated_at')]);
    const byEmp = new Map(ranks.map((r) => [r.employee_id, r]));
    return emps.map((e) => ({ id: e.id, name: e.name, position: e.position, email: e.email, pronoun: byEmp.get(e.id)?.pronoun ?? null, rank: byEmp.get(e.id)?.rank ?? null }));
  },
});
export const useRoles = () => useQuery({
  queryKey: ['roles'],
  queryFn: async (): Promise<RoleRow[]> => (await fetchAll('roles', 'created_at')).map((r) => ({ id: r.id, name: r.name, label: r.label, color: r.color })),
});
/** บัญชีผู้ใช้ทั้งหมด (อ่านได้เฉพาะ admin) */
export const useAppUsers = (enabled: boolean) => useQuery({
  queryKey: ['appUsers'],
  enabled,
  queryFn: async (): Promise<AppUser[]> => (await fetchAll('app_users', 'created_at')).map((u) => ({
    id: u.id, username: u.username, displayName: u.display_name, avatarUrl: u.avatar_url, roles: u.roles ?? [], employeeId: u.employee_id,
  })),
});
export const usePermRows = (enabled: boolean) => useQuery({
  queryKey: ['permRows'],
  enabled,
  queryFn: async (): Promise<PermRow[]> => (await run(supabase.from('permissions').select('role, page, actions'))) as PermRow[],
});

export async function saveEmployee(id: string | null, v: { name: string; position: string; email: string; pronoun: string; rank: string }) {
  const row = { name: v.name.trim(), position: v.position.trim() || null, email: v.email.trim() || null };
  let empId = id;
  if (id) expectRows(await run(supabase.from('employees').update(row).eq('id', id).select('id')), 1);
  else empId = (await run(supabase.from('employees').insert(row).select('id').single()) as { id: string }).id;
  await saveRank(empId!, v.pronoun, v.rank);
}
export async function saveRank(employeeId: string, pronoun: string, rank: string) {
  const p = pronoun.trim(), r = rank.trim();
  if (!p && !r) { await run(supabase.from('ranks').delete().eq('employee_id', employeeId)); return; }
  await run(supabase.from('ranks').upsert({ employee_id: employeeId, pronoun: p || null, rank: r || null }, { onConflict: 'employee_id' }));
}
/** ลบพนักงาน (admin: ลบบัญชีที่ผูกอยู่ด้วย เหมือนระบบเดิม) */
export async function deleteEmployee(id: string, accountId: string | null) {
  if (accountId) expectRows(await run(supabase.from('app_users').delete().eq('id', accountId).select('id')), 1);
  expectRows(await run(supabase.from('employees').delete().eq('id', id).select('id')), 1);
}

export async function saveRole(id: string | null, v: { name: string; label: string; color: string }) {
  if (id) expectRows(await run(supabase.from('roles').update({ label: v.label.trim(), color: v.color }).eq('id', id).select('id')), 1);
  else await run(supabase.from('roles').insert({ name: v.name.trim().toLowerCase().replace(/\s+/g, '_'), label: v.label.trim() || v.name.trim(), color: v.color }));
}
export async function deleteRole(id: string) {
  expectRows(await run(supabase.from('roles').delete().eq('id', id).select('id')), 1);
}
export async function saveRolePermissions(role: string, perms: PermMap) {
  return run(supabase.rpc('save_role_permissions', { p_role: role, p_perms: perms }));
}

export async function saveAccount(id: string, v: { roles: string[]; displayName: string; employeeId: string }) {
  expectRows(await run(supabase.from('app_users').update({ roles: v.roles, display_name: v.displayName.trim() || null, employee_id: v.employeeId || null }).eq('id', id).select('id')), 1);
}
/** ถอดบัญชี: ลบข้อมูลผู้ใช้ในระบบ (ล็อกอินเข้าแอปไม่ได้อีก) */
export async function removeAccount(id: string) {
  expectRows(await run(supabase.from('app_users').delete().eq('id', id).select('id')), 1);
}

/** เปลี่ยน PIN ของตัวเอง: ยืนยัน PIN เดิมก่อน แล้วค่อยตั้งใหม่ */
export async function changeOwnPin(username: string, oldPin: string, newPin: string) {
  const { error: e1 } = await supabase.auth.signInWithPassword({ email: toEmail(username), password: toPassword(oldPin) });
  if (e1) throw new Error('PIN เดิมไม่ถูกต้อง');
  const { error: e2 } = await supabase.auth.updateUser({ password: toPassword(newPin) });
  if (e2) throw new Error(errMsg(e2));
}
