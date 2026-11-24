import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { orderShopIds } from './products.ts';
import { toEmail, toPassword } from './auth';
import type { PermMap } from './perms';
import type { BundleItem, Ghost, MapRow, Product, ShopIdMapBan, ShopIdRow, StockCountRound, StockHistoryEntry } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ───────── อ่านข้อมูล ─────────
// Supabase ส่งได้สูงสุด 1,000 แถวต่อครั้ง จึงดึงเป็นหน้าๆ จนครบ
// ระบุคอลัมน์ที่หน้าเว็บใช้จริง เพื่อไม่ดึงข้อมูลที่ไม่จำเป็น (เช่นรหัสผ่าน Account) มาที่เบราว์เซอร์
async function fetchAll(table: string, order: string, columns: string, orderById = true): Promise<any[]> {
  const out: any[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    let query = supabase.from(table).select(columns).order(order);
    if (orderById) query = query.order('id');
    const { data, error } = await query.range(from, from + size - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

const toMap = (r: any): MapRow => ({ id: r.id, name: r.name, icon: r.icon, description: r.description, sortOrder: r.sort_order });
const toShop = (r: any): ShopIdRow => ({ id: r.id, shopId: r.shop_id, password: r.password ?? null, mapId: r.map_id, note: r.note, sortOrder: r.sort_order });
const toGhost = (r: any): Ghost => ({ id: r.id, name: r.name, stock: r.stock ?? 0, note: r.note, sortOrder: r.sort_order, updatedAt: r.updated_at });
const toProduct = (r: any): Product => ({
  id: r.id, name: r.name, mapId: r.map_id, shopIdRef: r.shop_id_ref, stock: r.stock ?? 0, description: r.description,
  status: r.status ?? 'active', thumbnail: r.image_url, isBundle: !!r.is_bundle,
  bundleItems: Array.isArray(r.bundle_items) ? (r.bundle_items as BundleItem[]) : [],
  sortOrder: r.sort_order, createdAt: r.created_at, updatedAt: r.updated_at,
});

const MAP_COLUMNS = 'id, name, icon, description, sort_order';
const SHOP_COLUMNS = 'id, shop_id, map_id, note, sort_order';
const PRODUCT_COLUMNS = 'id, name, map_id, shop_id_ref, stock, description, status, image_url, is_bundle, bundle_items, sort_order, created_at, updated_at';
const GHOST_COLUMNS = 'id, name, stock, note, sort_order, updated_at';

export const useMaps = (enabled = true) => useQuery({ queryKey: ['maps'], enabled, queryFn: async () => (await fetchAll('maps', 'created_at', MAP_COLUMNS)).map(toMap).sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9)) });
/** withPassword: ดึงรหัสผ่านด้วย ใช้เฉพาะหน้าไอดีร้านที่ต้องแสดง/แก้รหัส หน้าอื่นไม่ต้องรู้รหัส */
export const useShopIds = (withPassword = false) => useQuery({
  queryKey: ['shopIds', withPassword ? 'withPassword' : 'public'],
  queryFn: async () => (await fetchAll('shop_ids', 'created_at', withPassword ? `${SHOP_COLUMNS}, password` : SHOP_COLUMNS)).map(toShop),
});
/** Shop ID เรียงตามลำดับที่จัดไว้ (ลำดับเดียวทั้งระบบ ใช้ทุกที่ที่แสดงรายการ Shop ID) */
export function useShopIdsOrdered(withPassword = false) {
  const q = useShopIds(withPassword);
  const data = useMemo(() => (q.data ? orderShopIds(q.data) : q.data), [q.data]);
  return { ...q, data };
}
/** ข้อมูล Account ที่หน้า StockCount ต้องใช้ โดยไม่ดึง password/note ของ Shop ID */
export function useStockCountShopIds() {
  return useQuery({
    queryKey: ['stockCountShopIds'],
    queryFn: async (): Promise<ShopIdRow[]> => {
      const { data, error } = await supabase.rpc('get_stock_count_shop_ids');
      if (error) throw error;
      return orderShopIds((data ?? []).map((r: any) => ({
        id: r.id, shopId: r.shop_id, password: null, mapId: r.map_id, note: null, sortOrder: r.sort_order,
      })));
    },
  });
}
export const useShopIdMapBans = (enabled = true) => useQuery({
  queryKey: ['shopIdMapBans'],
  enabled,
  queryFn: async (): Promise<ShopIdMapBan[]> => {
    const { data, error } = await supabase.from('shop_id_map_bans').select('shop_id_id, map_id');
    if (error) throw error;
    return (data ?? []).map((row) => ({ shopIdId: row.shop_id_id, mapId: row.map_id }));
  },
});
export const useProducts = (enabled = true) => useQuery({ queryKey: ['products'], enabled, queryFn: async () => (await fetchAll('products', 'created_at', PRODUCT_COLUMNS)).map(toProduct) });
export const useGhosts = () => useQuery({ queryKey: ['ghosts'], queryFn: async () => (await fetchAll('ghost_items', 'name', GHOST_COLUMNS)).map(toGhost) });
export const useStockHistory = (enabled = true, fetchAllRows = false) => useQuery({
  queryKey: ['stockHistory', fetchAllRows],
  enabled,
  queryFn: async (): Promise<StockHistoryEntry[]> => {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const query = () => supabase.from('stock_history').select('id, item_type, item_id, item_name, action, old_stock, new_stock, actor_username, created_at')
      .gte('created_at', since).order('created_at', { ascending: false });
    let rows: any[] = [];
    if (fetchAllRows) {
      const size = 1000;
      for (let from = 0; ; from += size) {
        const { data, error } = await query().range(from, from + size - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < size) break;
      }
    } else {
      const { data, error } = await query().limit(200);
      if (error) throw error;
      rows = data ?? [];
    }
    return rows.map((r) => ({ id: r.id, itemType: r.item_type, itemId: r.item_id, itemName: r.item_name,
      action: r.action, oldStock: r.old_stock, newStock: r.new_stock, actorUsername: r.actor_username, createdAt: r.created_at }));
  },
});
export const stockCountRoundKey = (profileId: string) => ['stockCountRound', profileId] as const;

type StockCountRoundRow = { round_id: string; counted_ids: string[]; skipped_map_ids: string[]; updated_at: string };
const toStockCountRound = (row: StockCountRoundRow): StockCountRound => ({
  id: row.round_id,
  countedIds: row.counted_ids.filter((id) => typeof id === 'string'),
  skippedMapIds: row.skipped_map_ids.filter((id) => typeof id === 'string'),
  updatedAt: row.updated_at,
});

export const useStockCountRound = (profileId: string) => useQuery({
  queryKey: stockCountRoundKey(profileId),
  enabled: !!profileId,
  refetchOnWindowFocus: false,
  queryFn: async (): Promise<StockCountRound | null> => {
    const { data, error } = await supabase.from('stock_count_rounds').select('round_id, counted_ids, skipped_map_ids, updated_at').maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toStockCountRound(data);
  },
});
export type StockCountEntry = { id: string; stock: number; expected_stock: number };
export type StockCountAction =
  | { action: 'count'; products: StockCountEntry[]; ghosts: StockCountEntry[] }
  | { action: 'skip' | 'restore'; mapId: string }
  | { action: 'reset' };

export async function applyStockCountRound(roundId: string | null, change: StockCountAction) {
  const data = await run(supabase.rpc('apply_stock_count_round', {
    p_action: change.action,
    p_round_id: roundId,
    ...('mapId' in change ? { p_map_id: change.mapId } : {}),
    ...(change.action === 'count' ? { p_products: change.products, p_ghosts: change.ghosts } : {}),
  }));
  return toStockCountRound(data);
}

/**
 * กลุ่มข้อมูลที่ต้องโหลดใหม่หลังบันทึก แยกตามสิ่งที่เปลี่ยนจริง
 * เดิมรีเฟรชทุกตารางทุกครั้ง ทำให้บันทึกครั้งเดียวต้องดึงสินค้า พนักงาน และสิทธิ์ใหม่ทั้งหมด
 */
export type RefreshScope = 'products' | 'maps' | 'shopIds' | 'bans' | 'people' | 'roles' | 'round';
const REFRESH_KEYS: Record<RefreshScope, string[]> = {
  // สต็อกเซ็ตคำนวณจากส่วนประกอบ และการบันทึกสินค้าอาจสร้าง Ghost ใหม่ จึงโหลด products กับ ghosts คู่กันเสมอ
  products: ['products', 'ghosts', 'stockHistory', 'count'],
  // ลบแมพทำให้สินค้าในแมพนั้นกลายเป็นไม่ระบุแมพ
  maps: ['maps', 'products', 'count'],
  // ลบไอดีทำให้สินค้าที่ผูกไว้กลายเป็นไม่ระบุไอดี และลบสถานะแบนของไอดีนั้น
  shopIds: ['shopIds', 'stockCountShopIds', 'shopIdMapBans', 'products', 'count'],
  bans: ['shopIdMapBans'],
  people: ['employees', 'appUsers', 'accountPresence', 'count'],
  roles: ['roles', 'permRows', 'appUsers'],
  round: ['stockCountRound'],
};
export function useRefreshData() {
  const qc = useQueryClient();
  return (...scopes: [RefreshScope, ...RefreshScope[]]) => {
    const keys = new Set(scopes.flatMap((scope) => REFRESH_KEYS[scope]));
    return Promise.all([...keys].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  };
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
export async function setShopIdMapBan(shopIdId: string, mapId: string, banned: boolean) {
  if (banned) return run(supabase.from('shop_id_map_bans').insert({ shop_id_id: shopIdId, map_id: mapId }));
  return run(supabase.from('shop_id_map_bans').delete().eq('shop_id_id', shopIdId).eq('map_id', mapId));
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
        name: v.name.trim(), map_id: v.mapId, shop_id_ref: v.shopIdRef, stock: v.stock, description: v.description, status: v.status,
        image_url: v.thumbnail, is_bundle: v.isBundle, bundle_items: v.bundleItems, sort_order: v.sortOrder,
      },
    }),
  );
}
export interface BulkProductInput { name: string; mapId: string; shopIdRef: string; stock: number; description: string; status: string; thumbnail: string }
export async function addProducts(items: BulkProductInput[]) {
  const rows = items.map((v) => ({
    name: v.name.trim(), map_id: v.mapId || null, shop_id_ref: v.shopIdRef || null, stock: v.stock,
    description: v.description || null, status: v.status, image_url: v.thumbnail.trim() || null, is_bundle: false, bundle_items: [],
  }));
  await run(supabase.from('products').insert(rows));
}
export async function deleteProducts(ids: string[]) {
  expectRows(await run(supabase.from('products').delete().in('id', ids).select('id')), ids.length);
}
export async function bulkUpdateSort(items: { id: string; sort: number | null }[]) {
  return run(supabase.rpc('bulk_update_sort', { p_items: items }));
}

// ───────── พนักงาน / Role / บัญชี / สิทธิ์ ─────────
export interface Employee { id: string; name: string; position: string | null; email: string | null; pronoun: string | null; rank: string | null }
export interface RoleRow { id: string; name: string; label: string; color: string | null }
export interface AppUser { id: string; username: string; displayName: string | null; avatarUrl: string | null; roles: string[]; employeeId: string | null }
export interface PermRow { role: string; page: string; actions: string[] }

export const useEmployees = () => useQuery({
  queryKey: ['employees'],
  queryFn: async (): Promise<Employee[]> => {
    const [emps, ranks] = await Promise.all([
      fetchAll('employees', 'created_at', 'id, name, position, email'),
      fetchAll('ranks', 'updated_at', 'id, employee_id, pronoun, rank, updated_at'),
    ]);
    const byEmp = new Map(ranks.map((r) => [r.employee_id, r]));
    return emps.map((e) => ({ id: e.id, name: e.name, position: e.position, email: e.email, pronoun: byEmp.get(e.id)?.pronoun ?? null, rank: byEmp.get(e.id)?.rank ?? null }));
  },
});
export const useRoles = () => useQuery({
  queryKey: ['roles'],
  queryFn: async (): Promise<RoleRow[]> => (await fetchAll('roles', 'created_at', 'id, name, label, color')).map((r) => ({ id: r.id, name: r.name, label: r.label, color: r.color })),
});
/** บัญชีผู้ใช้ทั้งหมด (อ่านได้เฉพาะ admin) */
export interface AccountPresence { userId: string; lastSeenAt: string }
export const useAccountPresence = (enabled: boolean) => useQuery({
  queryKey: ['accountPresence'],
  enabled,
  queryFn: async (): Promise<AccountPresence[]> => {
    const { data, error } = await supabase.from('account_presence').select('user_id, last_seen_at').order('last_seen_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({ userId: row.user_id, lastSeenAt: row.last_seen_at }));
  },
  refetchInterval: 15_000,
  staleTime: 0,
});
export const useAppUsers = (enabled: boolean) => useQuery({
  queryKey: ['appUsers'],
  enabled,
  queryFn: async (): Promise<AppUser[]> => (await fetchAll('app_users', 'created_at', 'id, username, display_name, avatar_url, roles, employee_id')).map((u) => ({
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

export async function saveAccount(id: string, v: { roles: string[]; displayName: string; employeeId: string; avatarUrl: string }) {
  expectRows(await run(supabase.from('app_users').update({ roles: v.roles, display_name: v.displayName.trim() || null, employee_id: v.employeeId || null, avatar_url: v.avatarUrl.trim() || null }).eq('id', id).select('id')), 1);
}
/** ผู้ใช้แก้ได้เฉพาะรูปของบัญชีที่ล็อกอินอยู่ (ตรวจซ้ำด้วย RPC ฝั่งฐานข้อมูล) */
export async function saveMyAvatarUrl(avatarUrl: string) {
  return run(supabase.rpc('update_my_avatar_url', { p_avatar_url: avatarUrl.trim() || null }));
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

