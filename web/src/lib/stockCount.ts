import { calcBundle, ghostNameOf, isGhostItem } from './bundle.ts';
import type { Ghost, Product } from './types.ts';

type StockLocation = Pick<Product, 'mapId' | 'shopIdRef'>;
export type StockCountItem = { key: string; locations: StockLocation[] };

export function isSkippedStockItem(item: StockCountItem, skippedMaps: ReadonlySet<string>) {
  return item.locations.length > 0 && item.locations.every((scope) => scope.mapId !== null && skippedMaps.has(scope.mapId));
}

export function buildStockCountItems(
  products: Product[],
  ghosts: Ghost[],
  ghostUsage: ReadonlyMap<string, Product[]>,
  bannedPairs: ReadonlySet<string>,
): StockCountItem[] {
  const isAllowed = (p: Product) => !bannedPairs.has(`${p.shopIdRef}\u0000${p.mapId}`);
  const items: StockCountItem[] = products
    .filter((p) => p.status !== 'inactive' && !p.isBundle && isAllowed(p))
    .map((p) => ({ key: `p:${p.id}`, locations: [p] }));
  for (const ghost of ghosts) {
    const usage = ghostUsage.get(ghost.id) ?? [];
    const eligible = usage.filter(isAllowed);
    if (usage.length && !eligible.length) continue;
    items.push({ key: `g:${ghost.id}`, locations: eligible });
  }
  return items;
}

export function summarizeStockCount(items: StockCountItem[], countedIds: ReadonlySet<string>, skippedMaps: ReadonlySet<string>) {
  let counted = 0;
  let skipped = 0;
  const pending: StockCountItem[] = [];
  for (const item of items) {
    if (countedIds.has(item.key)) counted++;
    else if (isSkippedStockItem(item, skippedMaps)) skipped++;
    else pending.push(item);
  }
  return { counted, skipped, pending, total: items.length };
}

export type StockLevelFilter = '' | 'low' | 'zero' | 'ok';
export function stockLevelMatches(stock: number, filter: StockLevelFilter, low: number) {
  if (filter === 'low') return stock <= low;
  if (filter === 'zero') return stock === 0;
  if (filter === 'ok') return stock > low;
  return true;
}

type WithId = { id: string };
const hasPendingAt = (pending: StockCountItem[], mapId: string, accountId?: string) =>
  pending.some((item) => item.locations.some((scope) => scope.mapId === mapId && (accountId === undefined || scope.shopIdRef === accountId)));

/** วนหาตัวถัดไปจากตำแหน่งปัจจุบัน ถ้าหาตัวปัจจุบันไม่เจอให้ตรวจทุกตัวตั้งแต่ต้นรายการ */
function nextAfter<T extends WithId>(list: T[], currentId: string, accept: (item: T) => boolean) {
  const index = list.findIndex((item) => item.id === currentId);
  const steps = index < 0 ? list.length : list.length - 1;
  for (let offset = 1; offset <= steps; offset++) {
    const item = list[(index + offset + list.length) % list.length];
    if (accept(item)) return item;
  }
}

/** Account ถัดไปในแมพนี้ที่ยังมีรายการรอนับ (ไม่นับ Account ปัจจุบัน) */
export function findNextPendingAccount<T extends WithId>(accounts: T[], mapId: string, afterAccountId: string, pending: StockCountItem[]) {
  return nextAfter(accounts, afterAccountId, (account) => hasPendingAt(pending, mapId, account.id));
}

/** แมพถัดไปที่ไม่ได้ข้ามและยังมีรายการรอนับ (ไม่นับแมพปัจจุบัน) */
export function findNextPendingMap<T extends WithId>(maps: T[], afterMapId: string, pending: StockCountItem[], skippedMaps: ReadonlySet<string>) {
  return nextAfter(maps, afterMapId, (map) => !skippedMaps.has(map.id) && hasPendingAt(pending, map.id));
}

export type NextCountStep<M, A> =
  | { kind: 'card'; key: string }
  | { kind: 'done'; hasSkipped: boolean }
  | { kind: 'account'; mapId: string; account: A }
  | { kind: 'map'; mapId: string; map?: M }
  | { kind: 'elsewhere' };

/**
 * เลือกขั้นต่อไปหลังยืนยันจำนวน 1 รายการ
 * 1) การ์ดถัดไปที่รอนับในหน้าที่เห็นอยู่ (วนจากการ์ดที่เพิ่งนับ)
 * 2) ไม่มีรายการรอนับแล้ว → จบรอบ
 * 3) Account นี้นับครบแต่แมพนี้ยังเหลือ → ไป Account ถัดไป (ถ้าไม่มีให้กลับไปดูทุก Account ของแมพนี้)
 * 4) แมพนี้นับครบ → ไปแมพถัดไป (ถ้าไม่มีให้กลับไปดูทุกแมพ)
 * 5) ยังเหลือแต่อยู่นอกตัวกรอง → แจ้งให้ไปรายการค้าง
 */
export function planNextAfterCount<M extends WithId, A extends WithId>(input: {
  sequence: string[]; currentKey: string; pending: StockCountItem[]; skippedMaps: ReadonlySet<string>;
  mapId: string; accountId: string; maps: M[]; accounts: A[];
}): NextCountStep<M, A> {
  const { sequence, currentKey, pending, skippedMaps, mapId, accountId, maps, accounts } = input;
  const pendingKeys = new Set(pending.map((item) => item.key));
  const index = sequence.indexOf(currentKey);
  const ordered = index < 0 ? sequence : [...sequence.slice(index + 1), ...sequence.slice(0, index)];
  const nextKey = ordered.find((key) => pendingKeys.has(key));
  if (nextKey) return { kind: 'card', key: nextKey };
  if (!pending.length) return { kind: 'done', hasSkipped: skippedMaps.size > 0 };

  const inMap = mapId && !skippedMaps.has(mapId)
    ? pending.filter((item) => item.locations.some((scope) => scope.mapId === mapId))
    : [];
  if (mapId && accountId && inMap.length && !hasPendingAt(inMap, mapId, accountId)) {
    const account = findNextPendingAccount(accounts, mapId, accountId, inMap);
    return account ? { kind: 'account', mapId, account } : { kind: 'map', mapId };
  }
  if (mapId && !inMap.length) {
    const map = findNextPendingMap(maps, mapId, pending, skippedMaps);
    return { kind: 'map', mapId: map?.id ?? '', map };
  }
  return { kind: 'elsewhere' };
}

type CountedEntry = { id: string; stock: number };
const normName = (name: string) => name.trim().toLowerCase();

/**
 * อัปเดตข้อมูลในเครื่องหลังบันทึกผลนับสำเร็จ แทนการโหลดสินค้าทั้งตารางใหม่ทุกครั้ง
 * - สินค้า/Ghost ที่นับ: ใช้ยอดที่บันทึกและเวลาบันทึกของรอบ (ฐานข้อมูลใช้ now() ในธุรกรรมเดียวกัน)
 * - เซ็ตที่ใช้ของที่นับ: คำนวณใหม่แบบเดียวกับ calc_bundle_stock ในฐานข้อมูล
 *   (ฐานข้อมูลอ่านสต็อก Ghost จากตาราง ghost_items ก่อน และใช้ ghostStock ใน JSON เฉพาะ Ghost ที่ไม่มีในตาราง)
 */
export function applyCountedStock(products: Product[], ghosts: Ghost[], counted: { products: CountedEntry[]; ghosts: CountedEntry[] }, updatedAt: string) {
  const productStock = new Map(counted.products.map((entry) => [entry.id, entry.stock]));
  const ghostStock = new Map(counted.ghosts.map((entry) => [entry.id, entry.stock]));
  const nextGhosts = ghosts.map((g) => ghostStock.has(g.id) ? { ...g, stock: ghostStock.get(g.id)!, updatedAt } : g);
  const countedGhostNames = new Set(ghosts.filter((g) => ghostStock.has(g.id)).map((g) => normName(g.name)));
  const knownGhostNames = new Set(nextGhosts.map((g) => normName(g.name)));
  const withCounts = products.map((p) => !p.isBundle && productStock.has(p.id) ? { ...p, stock: productStock.get(p.id)!, updatedAt } : p);
  const nextProducts = withCounts.map((p) => {
    if (!p.isBundle) return p;
    const affected = p.bundleItems.some((item) => isGhostItem(item)
      ? countedGhostNames.has(normName(ghostNameOf(item)))
      : productStock.has(item.productId));
    if (!affected) return p;
    const items = p.bundleItems.map((item) => isGhostItem(item) && knownGhostNames.has(normName(ghostNameOf(item))) ? { ...item, ghostStock: undefined } : item);
    const stock = calcBundle(items, withCounts, nextGhosts).computed;
    return stock === p.stock ? p : { ...p, stock, updatedAt };
  });
  return { products: nextProducts, ghosts: nextGhosts };
}

export type StockDraftEntry ={ stock: number; expectedStock: number };
export type StockDraft = { roundId: string | null; entries: Record<string, StockDraftEntry> };

export function parseStockDraft(raw: string | null): StockDraft {
  const empty: StockDraft = { roundId: null, entries: {} };
  try {
    const draft = JSON.parse(raw ?? 'null') as StockDraft | null;
    if (!draft || (draft.roundId !== null && typeof draft.roundId !== 'string') || !draft.entries) return empty;
    return {
      roundId: draft.roundId,
      entries: Object.fromEntries(Object.entries(draft.entries).filter(([key, entry]) =>
        /^[pg]:.+/.test(key) && entry && Number.isSafeInteger(entry.stock) && entry.stock >= 0
          && Number.isSafeInteger(entry.expectedStock) && entry.expectedStock >= 0)),
    };
  } catch {
    return empty;
  }
}
