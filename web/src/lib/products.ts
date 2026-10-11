import type { MapRow, Product, ShopIdRow } from './types.ts';

export type SortKey = 'custom' | 'name' | 'stock-asc' | 'stock-desc' | 'map';
export type TypeTab = 'all' | 'normal' | 'bundle';

export interface ProductFilter {
  q: string;
  status: string; // '' | 'active' | 'inactive'
  type: TypeTab;
  mapId: string; // 'all' หรือ id
  sort: SortKey;
}

const th = (a: string, b: string) => a.localeCompare(b, 'th');
const orderNum = (p: { sortOrder: number | null }) => (p.sortOrder === null ? 9999 : p.sortOrder);

/** ข้อมูลแมพที่ใช้ประกอบการเรียง: rank = ลำดับแมพที่ผู้ใช้จัดไว้, name = ชื่อแมพ */
export interface MapCtx {
  rank: (id: string | null) => number;
  name: (id: string | null) => string;
}

export function mapCtx(maps: MapRow[]): MapCtx {
  const idx = new Map(maps.map((m, i) => [m.id, i]));
  const byId = new Map(maps.map((m) => [m.id, m.name]));
  return {
    rank: (id) => (id === null ? 1e6 : (idx.get(id) ?? 1e6)), // ไม่มีแมพ -> ท้ายสุด
    name: (id) => (id === null ? '' : (byId.get(id) ?? '')),
  };
}

/**
 * custom = ตามลำดับแมพที่จัดไว้ แล้วตามลำดับสินค้าในแมพนั้น
 * map    = ตามลำดับแมพที่จัดไว้ แล้วตามชื่อสินค้า
 */
export function sortProducts<T extends Product>(list: T[], sort: SortKey, ctx: MapCtx): T[] {
  const out = [...list];
  switch (sort) {
    case 'custom': out.sort((a, b) => ctx.rank(a.mapId) - ctx.rank(b.mapId) || orderNum(a) - orderNum(b)); break;
    case 'name': out.sort((a, b) => th(a.name, b.name)); break;
    case 'stock-asc': out.sort((a, b) => a.stock - b.stock); break;
    case 'map': out.sort((a, b) => ctx.rank(a.mapId) - ctx.rank(b.mapId) || th(a.name, b.name)); break;
    default: out.sort((a, b) => b.stock - a.stock); // stock-desc
  }
  return out;
}

export function filterSortProducts(products: Product[], maps: MapRow[], shopIds: ShopIdRow[], f: ProductFilter): Product[] {
  const ctx = mapCtx(maps);
  const mapName = ctx.name;
  const shopText = (id: string | null) => shopIds.find((s) => s.id === id)?.shopId ?? '';
  const q = f.q.toLowerCase().trim();
  let list = products;
  if (f.mapId !== 'all') list = list.filter((p) => p.mapId === f.mapId);
  if (q) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        mapName(p.mapId).toLowerCase().includes(q) ||
        shopText(p.shopIdRef).toLowerCase().includes(q),
    );
  }
  if (f.status) list = list.filter((p) => p.status === f.status);
  if (f.type === 'normal') list = list.filter((p) => !p.isBundle);
  else if (f.type === 'bundle') list = list.filter((p) => p.isBundle);
  return sortProducts(list, f.sort, ctx);
}

/** ไอดีร้านที่ไม่มีสินค้าเลย / สินค้าหมดทั้งหมด (ภายในแมพที่เลือก หรือทุกแมพ) */
export function emptyShopIds(shopIds: ShopIdRow[], products: Product[], mapId: string) {
  const scope = mapId === 'all' ? shopIds : shopIds.filter((s) => s.mapId === mapId);
  const relevant = mapId === 'all' ? products : products.filter((p) => p.mapId === mapId);
  const empty: ShopIdRow[] = [];
  const outOfStock: ShopIdRow[] = [];
  for (const s of scope) {
    const mine = relevant.filter((p) => p.shopIdRef === s.id);
    if (!mine.length) empty.push(s);
    else if (mine.reduce((sum, p) => sum + p.stock, 0) <= 0) outOfStock.push(s);
  }
  return { empty, outOfStock };
}

/** Shop ID เรียงตามลำดับเดียวทั้งระบบ (ไม่ผูกกับแมพ เพราะไอดีหนึ่งอาจเก็บของหลายเกม) ไม่มีลำดับไว้ท้ายสุด */
export function orderShopIds(shops: ShopIdRow[]): ShopIdRow[] {
  return [...shops].sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9));
}

/**
 * ใช้เมื่อจัดลำดับเฉพาะบางส่วนของรายการ (เช่น กรองตามแมพ):
 * นำลำดับใหม่ของส่วนนั้นไปใส่ในตำแหน่งเดิมที่ส่วนนั้นเคยอยู่ในลำดับรวม รายการอื่นอยู่ที่เดิมทุกตัว
 */
export function mergeIntoGlobal(globalIds: string[], subsetNewOrder: string[]): string[] {
  const subset = new Set(subsetNewOrder);
  let k = 0;
  return globalIds.map((id) => (subset.has(id) ? subsetNewOrder[k++] : id));
}
