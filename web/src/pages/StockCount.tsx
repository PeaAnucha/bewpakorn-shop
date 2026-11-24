import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Chip, Empty, ErrorBox, MapChips, Spinner, Thumb, useConfirm, useToast } from '../components/ui';
import { applyStockCountRound, errMsg, setShopIdMapBan, stockCountRoundKey, useGhosts, useMaps, useProducts, useRefreshData, useShopIdMapBans, useStockCountShopIds, useStockCountRound, type StockCountAction, type StockCountEntry } from '../lib/data';
import { fmtNum } from '../lib/format';
import { mapCtx, sortProducts, type SortKey } from '../lib/products';
import { applyCountedStock, buildStockCountItems, findNextPendingAccount, findNextPendingMap, isSkippedStockItem, parseStockDraft, planNextAfterCount, stockLevelMatches, summarizeStockCount, type StockDraft, type StockLevelFilter } from '../lib/stockCount';
import type { Ghost, MapRow, Product, StockCountRound } from '../lib/types';

type TypeF = '' | 'normal' | 'bundle' | 'ghost';
type StockF = StockLevelFilter;
type CountF = 'all' | 'pending' | 'counted';
interface StockFilters {
  q: string; mapF: string; acctF: string; typeF: TypeF; stockF: StockF;
  productCountF: CountF; ghostCountF: CountF; sort: SortKey;
}
const DEFAULT_FILTERS: StockFilters = { q: '', mapF: '', acctF: '', typeF: '', stockF: '', productCountF: 'pending', ghostCountF: 'pending', sort: 'custom' };
/** ใช้ค่าที่บันทึกไว้เฉพาะเมื่ออยู่ในตัวเลือกที่ถูกต้อง ไม่งั้นใช้ค่าเริ่มต้น
 *  (เดิมเมื่อไม่มีค่าบันทึก typeF กลายเป็น undefined แล้วรายการ Ghost หายทั้งหมด) */
function pickOption<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? value as T : fallback;
}
function loadStockFilters(username: string): StockFilters {
  try {
    const saved = JSON.parse(localStorage.getItem(`stockcount-filters:${username}`) ?? '{}') as Partial<Record<keyof StockFilters, unknown>>;
    return {
      q: typeof saved.q === 'string' ? saved.q : DEFAULT_FILTERS.q,
      mapF: typeof saved.mapF === 'string' ? saved.mapF : DEFAULT_FILTERS.mapF,
      acctF: typeof saved.acctF === 'string' ? saved.acctF : DEFAULT_FILTERS.acctF,
      typeF: pickOption(saved.typeF, ['', 'normal', 'bundle', 'ghost'], DEFAULT_FILTERS.typeF),
      stockF: pickOption(saved.stockF, ['', 'low', 'zero', 'ok'], DEFAULT_FILTERS.stockF),
      productCountF: pickOption(saved.productCountF, ['all', 'pending', 'counted'], DEFAULT_FILTERS.productCountF),
      ghostCountF: pickOption(saved.ghostCountF, ['all', 'pending', 'counted'], DEFAULT_FILTERS.ghostCountF),
      sort: pickOption(saved.sort, ['custom', 'name', 'stock-asc', 'stock-desc', 'map'], DEFAULT_FILTERS.sort),
    };
  } catch { return DEFAULT_FILTERS; }
}
const LOW = 5;
const EMPTY_ENTRIES: StockDraft['entries'] = {};
const GHOST_PREFIX = '__ghost__:';
const ghostKey = (name: string) => name.trim().toLocaleLowerCase();

function CopyTextButton({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  async function copy() {
    try { await navigator.clipboard.writeText(text.trim()); toast(`คัดลอก${label}แล้ว ✅`); }
    catch { toast('คัดลอกไม่ได้ กรุณาเลือกชื่อแล้วคัดลอกเอง', 'error'); }
  }
  return <button type="button" className="shrink-0 rounded px-1.5 text-sm text-mute transition hover:bg-white/10 hover:text-white" title={`คัดลอก${label}`} aria-label={`คัดลอก${label}`} onClick={() => void copy()}>📋</button>;
}

function referencedGhostName(item: Product['bundleItems'][number]) {
  if (!item.productId.startsWith(GHOST_PREFIX)) return '';
  const idName = item.productId.slice(GHOST_PREFIX.length);
  return (item.ghostName ?? idName).trim();
}

/** ช่องกรอกจำนวน: พิมพ์ลบจนว่างได้ระหว่างแก้ไข แต่ค่าที่ส่งออกเป็นตัวเลข >= 0 เสมอ */
function CountInput({ value, onChange, onEnter, canSubmit, dirty, disabled }: { value: number; onChange: (n: number) => void; onEnter: () => void; canSubmit: boolean; dirty: boolean; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if ((parseInt(text, 10) || 0) !== value) setText(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input type="number" min={0} inputMode="numeric" value={text} disabled={disabled}
      className={`inp min-w-0 flex-1 text-center font-head text-base font-bold ${dirty ? '!border-warn !text-warn' : ''}`}
      onChange={(e) => { setText(e.target.value); onChange(Math.max(0, parseInt(e.target.value, 10) || 0)); }}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) { e.preventDefault(); onEnter(); } }} />
  );
}

/** แถวนับ: บรรทัดแรกบอกค่าเดิมและส่วนต่าง บรรทัดที่สอง [−] ช่องกรอก [+] ปุ่มบันทึกโผล่เฉพาะเมื่อมีการแก้ */
function CountRow({ orig, cur, onChange, onSaveNext, saving, locked, counted, editable }: { orig: number; cur: number; onChange: (n: number) => void; onSaveNext: () => void; saving: boolean; locked: boolean; counted: boolean; editable: boolean }) {
  const dirty = cur !== orig;
  const diff = cur - orig;
  const step = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#242424] text-lg leading-none text-white transition hover:bg-[#333333] active:scale-95';
  return (
    <>
      <div className="mt-2 flex items-center justify-between text-xs text-faint">
        <span className="font-semibold text-sky-300">เดิม <b className="font-head text-sm font-bold text-sky-200">{fmtNum(orig)}</b></span>
        {dirty && <span className={`font-head text-sm font-bold ${diff > 0 ? 'text-green' : 'text-danger'}`}>{diff > 0 ? '+' : ''}{fmtNum(diff)}</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <button className={step} aria-label="-1" disabled={!editable || locked} onClick={() => onChange(Math.max(0, cur - 1))}>−</button>
        <CountInput value={cur} onChange={onChange} onEnter={onSaveNext} canSubmit={!locked && !(counted && !dirty)} dirty={dirty} disabled={!editable || locked} />
        <button className={step} aria-label="+1" disabled={!editable || locked} onClick={() => onChange(cur + 1)}>+</button>
      </div>
      {editable ? <button type="button" disabled={locked || (counted && !dirty)} onClick={onSaveNext} className="btn btn-p btn-sm mt-2 w-full">
        {saving ? '⏳ กำลังบันทึก…' : dirty ? `💾 บันทึก + ไปชิ้นถัดไป (${fmtNum(orig)}→${fmtNum(cur)})` : counted ? '✅ นับแล้ว' : '✅ ยืนยันจำนวน + ไปชิ้นถัดไป'}
      </button> : <div className="mt-2 rounded-md bg-s2 px-3 py-2 text-center text-xs font-semibold text-mute">{counted ? '✅ นับแล้ว' : 'ดูอย่างเดียว · ไม่มีสิทธิ์บันทึกผลนับ'}</div>}
    </>
  );
}

interface ProductCardProps {
  p: Product; maps: MapRow[]; shops: { id: string; shopId: string }[]; cur: number;
  saving: boolean; locked: boolean; counted: boolean; editable: boolean; onChange: (n: number) => void; onSaveNext: () => void;
}
function ProductCard({ p, maps, shops, cur, saving, locked, counted, editable, onChange, onSaveNext }: ProductCardProps) {
  const map = maps.find((m) => m.id === p.mapId);
  const shop = shops.find((s) => s.id === p.shopIdRef);
  const dirty = cur !== p.stock;
  return (
    <div id={`stock-card-p-${p.id}`} className={`flex h-full flex-col rounded-lg border bg-[#191919]/95 p-3 transition ${dirty ? 'border-warn/60' : 'border-[#303030]'}`}>
      <div className="flex gap-3">
        <Thumb src={p.thumbnail} className="h-14 w-14 sm:h-16 sm:w-16" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1"><span className="break-words font-bold">{p.name}{p.isBundle && <span className="ml-1.5"><Chip tone="shop">📦</Chip></span>}</span><CopyTextButton text={p.name} label="ชื่อสินค้า" /></div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {map && <><Chip tone="map" className="text-[0.8rem]">{map.icon} {map.name}</Chip>{map.icon && <CopyTextButton text={map.icon} label={`สัญลักษณ์แมพ ${map.name}`} />}</>}
            <Chip tone="id" className="text-[0.8rem]">🔑 {shop?.shopId ?? 'ไม่ระบุ Account'}</Chip>
            {p.stock <= LOW && <Chip tone="low">⚠️ ต่ำ</Chip>}
            {p.isBundle && <Chip>คำนวณจากส่วนประกอบ</Chip>}
          </div>
        </div>
      </div>
      <div className="mt-auto pt-2">
        {p.isBundle ? (
          <div className="mt-2 text-sm text-mute">คงเหลือ <b className="font-head text-lg text-accent">{fmtNum(p.stock)}</b> ชุด <span className="text-xs text-faint">(แก้ที่ส่วนประกอบ)</span></div>
        ) : (
          <CountRow orig={p.stock} cur={cur} saving={saving} locked={locked} counted={counted} editable={editable} onChange={onChange} onSaveNext={onSaveNext} />
        )}
      </div>
    </div>
  );
}
interface GhostCardProps {
  g: Ghost; cur: number; saving: boolean; locked: boolean; counted: boolean; editable: boolean; onChange: (n: number) => void; onSaveNext: () => void;
  usedIn: Product[]; maps: MapRow[];
}
function GhostCard({ g, cur, saving, locked, counted, editable, onChange, onSaveNext, usedIn, maps }: GhostCardProps) {
  const dirty = cur !== g.stock;
  return (
    <div id={`stock-card-g-${g.id}`} className={`flex h-full flex-col rounded-lg border bg-[#191919]/95 p-3 ${dirty ? 'border-warn/60' : 'border-orange/30'}`}>
      <div className="flex gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-s3 text-3xl sm:h-16 sm:w-16">👻</div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1"><span className="break-words font-bold text-orange">{g.name}</span><CopyTextButton text={g.name} label="ชื่อ Ghost" /></div>
          <div className="mt-1"><Chip>👻 Ghost · ชิ้นส่วนที่ไม่ขายแยก</Chip>{g.stock <= LOW && <span className="ml-1.5"><Chip tone="low">⚠️ ต่ำ</Chip></span>}</div>
          <div className="mt-2 rounded-md border border-orange/20 bg-orange/5 px-2.5 py-2">
            <div className="mb-1 text-[0.7rem] font-bold uppercase tracking-wide text-orange">🧩 ใช้ในเซ็ต</div>
            {usedIn.length ? <div className="flex flex-wrap gap-1">{usedIn.slice(0, 4).map((p) => {
              const map = maps.find((m) => m.id === p.mapId);
              return <span key={p.id} className="rounded bg-[#28221b] px-2 py-0.5 text-xs text-white">{map?.icon} {p.name}</span>;
            })}{usedIn.length > 4 && <span className="px-1 py-0.5 text-xs text-mute">+{usedIn.length - 4} เซ็ต</span>}</div>
              : <div className="text-xs text-mute">ยังไม่ได้ผูกกับเซ็ตสินค้า</div>}
          </div>
        </div>
      </div>
      <div className="mt-auto pt-2">
        <CountRow orig={g.stock} cur={cur} saving={saving} locked={locked} counted={counted} editable={editable} onChange={onChange} onSaveNext={onSaveNext} />
      </div>
    </div>
  );
}

export default function StockCountPage() {
  const { can, profile } = useAuth();
  const canEditCount = can('stockcount', 'edit');
  const profileId = profile?.id ?? '';
  const filterStorageKey = `stockcount-filters:${profile?.username ?? 'default'}`;
  const draftStorageKey = `stockcount-draft:${profileId}`;
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const refresh = useRefreshData();
  const maps = useMaps();
  const shops = useStockCountShopIds();
  const shopIdMapBans = useShopIdMapBans();
  const products = useProducts();
  const ghosts = useGhosts();
  const round = useStockCountRound(profileId);

  const [filters, setFilters] = useState<StockFilters>(() => loadStockFilters(profile?.username ?? 'default'));
  const { q, mapF, acctF, typeF, stockF, productCountF, ghostCountF, sort } = filters;
  const updateFilters = (patch: Partial<StockFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const countedIds = useMemo(() => new Set(round.data?.countedIds), [round.data?.countedIds]);
  const skippedMapIds = useMemo(() => new Set(round.data?.skippedMapIds), [round.data?.skippedMapIds]);
  const roundId = round.data?.id ?? null;
  const roundLoaded = round.isSuccess;
  const roundSavedAt = round.data?.updatedAt;
  const [roundSaveError, setRoundSaveError] = useState('');
  const [draft, setDraft] = useState(() => {
    try { return parseStockDraft(localStorage.getItem(draftStorageKey)); }
    catch { return parseStockDraft(null); }
  });
  const [draftStored, setDraftStored] = useState(true);
  const draftEntries = canEditCount && roundLoaded && draft.roundId === roundId ? draft.entries : EMPTY_ENTRIES;
  const [saving, setSaving] = useState<string | null>(null);
  const busy = useRef(false);
  const [banSaving, setBanSaving] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const mapNavigationPending = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(filterStorageKey, JSON.stringify(filters)); } catch { /* Keep filters active if browser storage is unavailable. */ }
  }, [filterStorageKey, filters]);

  const mapList = maps.data ?? [];
  const shopList = shops.data ?? [];
  const bannedPairs = useMemo(() => new Set((shopIdMapBans.data ?? []).map((ban) => `${ban.shopIdId}\u0000${ban.mapId}`)), [shopIdMapBans.data]);
  const isProductBanned = (product: Product) => !!product.shopIdRef && !!product.mapId && bannedPairs.has(`${product.shopIdRef}\u0000${product.mapId}`);
  const ghostUsage = useMemo(() => {
    const byName = new Map((ghosts.data ?? []).map((g) => [ghostKey(g.name), g.id]));
    const out = new Map<string, Product[]>();
    for (const p of products.data ?? []) {
      if (!p.isBundle || p.status === 'inactive') continue;
      for (const item of p.bundleItems) {
        const id = byName.get(ghostKey(referencedGhostName(item)));
        if (!id) continue;
        const used = out.get(id) ?? [];
        if (!used.some((existing) => existing.id === p.id)) used.push(p);
        out.set(id, used);
      }
    }
    return out;
  }, [ghosts.data, products.data]);
  const curP = (p: Product) => draftEntries[`p:${p.id}`]?.stock ?? p.stock;
  const curG = (g: Ghost) => draftEntries[`g:${g.id}`]?.stock ?? g.stock;

  function persistDraft(next: StockDraft) {
    setDraft(next);
    try {
      if (Object.keys(next.entries).length) localStorage.setItem(draftStorageKey, JSON.stringify(next));
      else localStorage.removeItem(draftStorageKey);
      setDraftStored(true);
    } catch {
      setDraftStored(false);
    }
  }

  function editDraft(key: string, stock: number, expectedStock: number) {
    if (busy.current || !roundLoaded) return;
    const entries = { ...draftEntries };
    if (stock === expectedStock) delete entries[key];
    else entries[key] = { stock, expectedStock };
    persistDraft({ roundId, entries });
  }

  // เตือนก่อนปิดหน้าถ้ามีการแก้ที่ยังไม่บันทึก
  const dirtyCount = Object.keys(draftEntries).length;
  useEffect(() => {
    if (!saving && (draftStored || !dirtyCount)) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirtyCount, draftStored, saving]);

  const acctOptions = useMemo(() => {
    const used = new Set((products.data ?? []).filter((p) => !mapF || p.mapId === mapF).map((p) => p.shopIdRef).filter(Boolean));
    return shopList.filter((s) => used.has(s.id));
  }, [products.data, shopList, mapF]);
  const mapCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products.data ?? []) if (p.status !== 'inactive' && p.mapId) counts[p.mapId] = (counts[p.mapId] ?? 0) + 1;
    return counts;
  }, [products.data]);
  const acctCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products.data ?? []) {
      if (p.status === 'inactive' || (mapF && p.mapId !== mapF) || !p.shopIdRef) continue;
      counts.set(p.shopIdRef, (counts.get(p.shopIdRef) ?? 0) + 1);
    }
    return counts;
  }, [products.data, mapF]);
  useEffect(() => {
    if (maps.isLoading || products.isLoading || shops.isLoading) return;
    if (mapF && !mapList.some((map) => map.id === mapF)) setFilters((current) => ({ ...current, mapF: '', acctF: '' }));
    else if (acctF && !acctOptions.some((shop) => shop.id === acctF)) setFilters((current) => ({ ...current, acctF: '' }));
  }, [maps.isLoading, products.isLoading, shops.isLoading, mapList, mapF, acctF, acctOptions]);

  const pList = useMemo(() => {
    if (typeF === 'ghost') return [];
    const k = q.toLowerCase();
    const list = (products.data ?? []).filter((p) => {
      if (p.status === 'inactive') return false;
      if (k && !p.name.toLowerCase().includes(k) && !(p.description ?? '').toLowerCase().includes(k)) return false;
      if (mapF && p.mapId !== mapF) return false;
      if (acctF && p.shopIdRef !== acctF) return false;
      if (typeF === 'normal' && p.isBundle) return false;
      if (typeF === 'bundle' && !p.isBundle) return false;
      return stockLevelMatches(draftEntries[`p:${p.id}`]?.stock ?? p.stock, stockF, LOW);
    });
    return sortProducts(list, sort, mapCtx(mapList));
  }, [products.data, q, mapF, acctF, typeF, stockF, sort, draftEntries, mapList]);

  const gList = useMemo(() => {
    if (typeF !== '' && typeF !== 'ghost') return [];
    const k = q.trim().toLocaleLowerCase();
    const stockOf = (g: Ghost) => draftEntries[`g:${g.id}`]?.stock ?? g.stock;
    const list = (ghosts.data ?? []).filter((g) => {
      const usedIn = (ghostUsage.get(g.id) ?? []).filter((p) => (!mapF || p.mapId === mapF) && (!acctF || p.shopIdRef === acctF));
      if (mapF && !usedIn.some((p) => p.mapId === mapF)) return false;
      if (acctF && !usedIn.some((p) => p.shopIdRef === acctF)) return false;
      if (k && !g.name.toLocaleLowerCase().includes(k) && !(g.note ?? '').toLocaleLowerCase().includes(k) && !usedIn.some((p) => p.name.toLocaleLowerCase().includes(k))) return false;
      return stockLevelMatches(stockOf(g), stockF, LOW);
    });
    const num = (g: Ghost) => (g.sortOrder === null ? 9999 : g.sortOrder);
    if (sort === 'custom') list.sort((a, b) => num(a) - num(b));
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    else if (sort === 'stock-asc') list.sort((a, b) => stockOf(a) - stockOf(b));
    else if (sort === 'stock-desc') list.sort((a, b) => stockOf(b) - stockOf(a));
    return list;
  }, [ghosts.data, ghostUsage, q, mapF, acctF, typeF, stockF, sort, draftEntries]);

  const bannedProducts = pList.filter(isProductBanned);
  const countPList = pList.filter((p) => (!p.mapId || !skippedMapIds.has(p.mapId)) && !isProductBanned(p));
  const countGList = gList.filter((g) => {
    const usedIn = ghostUsage.get(g.id) ?? [];
    if (!usedIn.length) return true;
    const matches = usedIn.filter((p) => (!mapF || p.mapId === mapF) && (!acctF || p.shopIdRef === acctF));
    return matches.some((p) => (!p.mapId || !skippedMapIds.has(p.mapId)) && !isProductBanned(p));
  });
  const skippedMaps = mapList.filter((m) => skippedMapIds.has(m.id));

  const stockItems = useMemo(() => buildStockCountItems(products.data ?? [], ghosts.data ?? [], ghostUsage, bannedPairs),
    [products.data, ghosts.data, ghostUsage, bannedPairs]);
  const summary = useMemo(() => summarizeStockCount(stockItems, countedIds, skippedMapIds), [stockItems, countedIds, skippedMapIds]);
  function moveToMapForCounting(mapId: string) {
    mapNavigationPending.current = true;
    updateFilters({ mapF: mapId, acctF: '', q: '', typeF: '', stockF: '', productCountF: 'pending', ghostCountF: 'pending' });
  }
  function moveToAccountForCounting(mapId: string, accountId: string) {
    mapNavigationPending.current = true;
    updateFilters({ mapF: mapId, acctF: accountId, q: '', typeF: '', stockF: '', productCountF: 'pending', ghostCountF: 'pending' });
  }

  /**
   * หลังนับสำเร็จ อัปเดตยอดในเครื่องทันทีแทนการโหลดสินค้าทั้งตารางใหม่ทุกครั้งที่กดยืนยัน
   * แล้วทำเครื่องหมายว่าข้อมูลเก่า เพื่อให้โหลดของจริงมาเทียบเมื่อเปิดหน้าอื่นหรือกลับมาที่แท็บนี้
   */
  async function applyCountLocally(change: Extract<StockCountAction, { action: 'count' }>, result: StockCountRound) {
    const keys = [['products'], ['ghosts']] as const;
    // ยกเลิกการโหลดที่ค้างอยู่ ไม่ให้ข้อมูลก่อนบันทึกมาเขียนทับยอดใหม่
    await Promise.all(keys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
    const currentProducts = queryClient.getQueryData<Product[]>(['products']);
    const currentGhosts = queryClient.getQueryData<Ghost[]>(['ghosts']);
    if (!currentProducts || !currentGhosts) {
      await refresh('products');
      return;
    }
    const next = applyCountedStock(currentProducts, currentGhosts, change, result.updatedAt);
    queryClient.setQueryData(['products'], next.products);
    queryClient.setQueryData(['ghosts'], next.ghosts);
    await Promise.all(['products', 'ghosts', 'stockHistory'].map((k) => queryClient.invalidateQueries({ queryKey: [k], refetchType: 'none' })));
  }

  async function commitRound(change: StockCountAction, key: string) {
    if (busy.current || !roundLoaded || !canEditCount) return;
    busy.current = true;
    setSaving(key);
    setRoundSaveError('');
    try {
      const result = await applyStockCountRound(roundId, change);
      const entries = change.action === 'reset' ? {} : { ...draftEntries };
      if (change.action === 'count') {
        change.products.forEach(({ id }) => delete entries[`p:${id}`]);
        change.ghosts.forEach(({ id }) => delete entries[`g:${id}`]);
      }
      queryClient.setQueryData(stockCountRoundKey(profileId), result);
      persistDraft({ roundId: result.id, entries });
      if (change.action === 'count') await applyCountLocally(change, result);
      // ข้ามแมพเปลี่ยนเวลาอัปเดตของหลายรายการ (ไม่เปลี่ยนยอด) จึงโหลดใหม่จากฐานข้อมูล
      else if (change.action === 'skip') await refresh('products');
      return result;
    } catch (error) {
      const message = errMsg(error);
      setRoundSaveError(message);
      toast(message, 'error');
      // ยอดหรือรอบนับอาจถูกเปลี่ยนจากเครื่องอื่น โหลดของจริงมาแสดง
      void refresh('products', 'round');
    } finally {
      busy.current = false;
      setSaving(null);
    }
  }

  async function skipCurrentMap() {
    if (!mapF) return;
    const result = await commitRound({ action: 'skip', mapId: mapF }, 'skip');
    if (!result) return;
    const skipped = new Set(result.skippedMapIds);
    const { pending } = summarizeStockCount(stockItems, new Set(result.countedIds), skipped);
    const nextMap = findNextPendingMap(mapList, mapF, pending, skipped);
    if (nextMap || pending.length) moveToMapForCounting(nextMap?.id ?? '');
    toast(nextMap ? `ข้ามแมพนี้แล้ว · ไป ${nextMap.icon} ${nextMap.name} (ทุก Account)` : 'ข้ามแมพนี้แล้ว', 'info');
  }

  async function restoreMap(mapId: string) {
    if (await commitRound({ action: 'restore', mapId }, 'restore')) {
      moveToMapForCounting(mapId);
      toast('นำแมพกลับมานับแล้ว');
    }
  }

  const draftChanges = useMemo(() => {
    const draftProducts: StockCountEntry[] = [], draftGhosts: StockCountEntry[] = [];
    const live = new Map<string, number>([
      ...(products.data ?? []).map((p): [string, number] => [`p:${p.id}`, p.stock]),
      ...(ghosts.data ?? []).map((g): [string, number] => [`g:${g.id}`, g.stock]),
    ]);
    let inc = 0, dec = 0;
    for (const item of stockItems) {
      const entry = draftEntries[item.key];
      const current = live.get(item.key);
      if (!entry || current === undefined || isSkippedStockItem(item, skippedMapIds)) continue;
      if (entry.stock > current) inc++;
      if (entry.stock < current) dec++;
      const list = item.key.startsWith('p:') ? draftProducts : draftGhosts;
      list.push({ id: item.key.slice(2), stock: entry.stock, expected_stock: entry.stock === current ? current : entry.expectedStock });
    }
    return { products: draftProducts, ghosts: draftGhosts, inc, dec, total: draftProducts.length + draftGhosts.length };
  }, [draftEntries, products.data, ghosts.data, stockItems, skippedMapIds]);

  function stockEntry(key: string, current: number): StockCountEntry {
    const entry = draftEntries[key];
    return { id: key.slice(2), stock: entry?.stock ?? current, expected_stock: entry && entry.stock !== current ? entry.expectedStock : current };
  }

  function saveOne(key: string, current: number) {
    const entry = stockEntry(key, current);
    const product = key.startsWith('p:');
    return commitRound({ action: 'count', products: product ? [entry] : [], ghosts: product ? [] : [entry] }, key);
  }

  async function saveAll() {
    if (!draftChanges.total || busy.current) return;
    if (!await confirmDialog({ title: 'บันทึกทั้งหมด', message: `บันทึกรายการที่แก้ไว้จากทุกแมพและทุก Account ${draftChanges.total} รายการ?`, confirmLabel: `💾 บันทึก ${draftChanges.total} รายการ` })) return;
    if (await commitRound({ action: 'count', products: draftChanges.products, ghosts: draftChanges.ghosts }, 'all')) {
      toast(`บันทึกสำเร็จ ${draftChanges.total} รายการ ✅`);
    }
  }
  const selectedPairBanned = !!(mapF && acctF && bannedPairs.has(`${acctF}\u0000${mapF}`));
  useEffect(() => {
    if (!mapF || !acctF || !selectedPairBanned) return;
    const nextAccount = skippedMapIds.has(mapF) ? undefined : findNextPendingAccount(shopList, mapF, acctF, summary.pending);
    if (nextAccount) {
      moveToAccountForCounting(mapF, nextAccount.id);
      toast(`ข้าม 🔑 ${shopList.find((shop) => shop.id === acctF)?.shopId ?? acctF} ที่โดนแบน · ไป 🔑 ${nextAccount.shopId}`, 'info');
      return;
    }
    if (!skippedMapIds.has(mapF) && summary.pending.some((item) => item.locations.some((scope) => scope.mapId === mapF))) {
      moveToMapForCounting(mapF);
      toast('ข้าม Account ที่โดนแบนแล้ว · ยังมีรายการรอนับในแมพนี้', 'info');
      return;
    }
    const nextMap = findNextPendingMap(mapList, mapF, summary.pending, skippedMapIds);
    if (nextMap) {
      moveToMapForCounting(nextMap.id);
      toast(`ID ที่เหลือในแมพนี้โดนแบนหรือไม่มีรายการ · ไป ${nextMap.icon} ${nextMap.name} (ทุก Account)`, 'info');
    } else {
      updateFilters({ acctF: '', productCountF: 'pending', ghostCountF: 'pending' });
      toast('ข้าม Account ที่โดนแบนแล้ว · ไม่มี ID อื่นที่รอนับ', 'info');
    }
  }, [mapF, acctF, selectedPairBanned, summary.pending, skippedMapIds]);
  async function toggleSelectedPairBan() {
    if (!mapF || !acctF || busy.current) return;
    const shouldBan = !selectedPairBanned;
    busy.current = true;
    setBanSaving(true);
    try {
      await setShopIdMapBan(acctF, mapF, shouldBan);
      await refresh('bans');
      const account = shopList.find((shop) => shop.id === acctF)?.shopId ?? acctF;
      const map = mapList.find((row) => row.id === mapF)?.name ?? 'แมพนี้';
      toast(shouldBan ? `ตั้งสถานะแบน ${account} ใน ${map} แล้ว · ข้ามจากรอบนับ` : `ยกเลิกสถานะแบน ${account} ใน ${map} แล้ว`, 'success');
    } catch (error) { toast(errMsg(error), 'error'); }
    finally { busy.current = false; setBanSaving(false); }
  }
  async function resetAll() {
    if (busy.current) return;
    if (dirtyCount && !await confirmDialog({ title: 'ล้างฉบับร่าง', message: `ยกเลิกการแก้ไขที่ยังไม่บันทึกทั้งหมด ${dirtyCount} รายการ?`, confirmLabel: 'ล้างฉบับร่าง', danger: true })) return;
    persistDraft({ roundId, entries: {} });
  }

  async function startNewRound() {
    if (busy.current) return;
    const draftWarning = dirtyCount ? ` และล้างฉบับร่าง ${dirtyCount} รายการ` : '';
    if (!await confirmDialog({ title: 'เริ่มรอบนับใหม่', message: `ระบบจะล้างสถานะนับแล้วและแมพที่ข้าม${draftWarning}\nยอดสต็อกที่บันทึกแล้วยังอยู่ครบ`, confirmLabel: '🔄 เริ่มรอบใหม่', danger: dirtyCount > 0 })) return;
    if (await commitRound({ action: 'reset' }, 'reset')) {
      updateFilters({ productCountF: 'pending', ghostCountF: 'pending' });
      toast('เริ่มรอบนับใหม่แล้ว', 'info');
    }
  }

  async function confirmCountAndNext(key: string, current: number) {
    const result = await saveOne(key, current);
    if (!result) return;
    const completed = new Set(result.countedIds);
    const skipped = new Set(result.skippedMapIds);
    const { pending } = summarizeStockCount(stockItems, completed, skipped);

    const sequence = [
      ...countPList.filter((p) => !p.isBundle).map((p) => `p:${p.id}`),
      ...countGList.map((g) => `g:${g.id}`),
    ];
    const step = planNextAfterCount({ sequence, currentKey: key, pending, skippedMaps: skipped, mapId: mapF, accountId: acctF, maps: mapList, accounts: shopList });
    switch (step.kind) {
      case 'card': {
        if (step.key.startsWith('g:')) updateFilters({ ghostCountF: 'pending' });
        else updateFilters({ productCountF: 'pending' });
        const domId = `stock-card-${step.key.slice(0, 1)}-${step.key.slice(2)}`;
        window.requestAnimationFrame(() => {
          const card = document.getElementById(domId);
          card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card?.querySelector<HTMLInputElement>('input[type=number]')?.focus({ preventScroll: true });
        });
        return;
      }
      case 'done':
        updateFilters({ productCountF: 'counted', ghostCountF: 'counted' });
        toast(step.hasSkipped ? 'ไม่มีรายการรอนับแล้ว · ดูรายการที่ข้ามในสรุปรอบ' : 'นับครบทุกรายการแล้ว ✅');
        return;
      case 'account':
        moveToAccountForCounting(step.mapId, step.account.id);
        toast(`นับ Account นี้ครบแล้ว · ไป 🔑 ${step.account.shopId}`, 'success');
        return;
      case 'map':
        moveToMapForCounting(step.mapId);
        if (step.map) toast(`นับแมพนี้ครบแล้ว · ไป ${step.map.icon ?? ''} ${step.map.name} (ทุก Account)`, 'success');
        return;
      case 'elsewhere':
        updateFilters({ productCountF: 'pending', ghostCountF: 'pending' });
        toast('ยังมีรายการรอนับ · กด “ไปรายการค้าง” เพื่อดูทั้งหมด', 'info');
    }
  }

  const productCountable = countPList.filter((p) => !p.isBundle);
  const productDone = productCountable.filter((p) => countedIds.has(`p:${p.id}`)).length;
  const ghostDone = countGList.filter((g) => countedIds.has(`g:${g.id}`)).length;
  const countPercent = summary.total ? Math.floor((summary.counted + summary.skipped) * 100 / summary.total) : 0;
  const visiblePList = productCountF === 'all' ? countPList : countPList.filter((p) => !p.isBundle && countedIds.has(`p:${p.id}`) === (productCountF === 'counted'));
  const visibleGList = ghostCountF === 'all' ? countGList : countGList.filter((g) => countedIds.has(`g:${g.id}`) === (ghostCountF === 'counted'));

  useEffect(() => {
    if (!mapNavigationPending.current) return;
    const product = visiblePList.find((p) => !p.isBundle && !countedIds.has(`p:${p.id}`));
    const ghost = visibleGList.find((g) => !countedIds.has(`g:${g.id}`));
    const id = product ? `stock-card-p-${product.id}` : ghost ? `stock-card-g-${ghost.id}` : undefined;
    mapNavigationPending.current = false;
    if (!id) return;
    window.requestAnimationFrame(() => {
      const card = document.getElementById(id);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card?.querySelector<HTMLInputElement>('input[type=number]')?.focus({ preventScroll: true });
    });
  }, [mapF, visiblePList, visibleGList, countedIds]);

  const loading = maps.isLoading || shops.isLoading || products.isLoading || ghosts.isLoading || round.isLoading || shopIdMapBans.isLoading;
  const error = maps.error || shops.error || products.error || ghosts.error || round.error || shopIdMapBans.error;
  const locked = !!saving || banSaving;
  const sel = 'sel min-w-[130px] flex-1';
  // จำนวนตัวกรองรองที่ต่างจากค่าเริ่มต้น แสดงบนปุ่มพับตัวกรองในมือถือ ไม่ให้ลืมว่ายังกรองอยู่
  const activeFilterCount = [q.trim() !== '', typeF !== '', stockF !== '', sort !== DEFAULT_FILTERS.sort,
    productCountF !== DEFAULT_FILTERS.productCountF, ghostCountF !== DEFAULT_FILTERS.ghostCountF].filter(Boolean).length;


  return (
    <div>
      <div className="sticky top-0 z-20 mb-4 bg-bg/95 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <h1 className="font-head text-2xl font-bold tracking-tight">🧮 นับสต็อก</h1>
          <div className="flex flex-wrap items-center gap-x-4 text-sm text-mute">
            <span><b className="text-white">{countPList.length + countGList.length}</b> รายการในตัวกรอง</span>
            {dirtyCount > 0 && <span className="text-warn">ฉบับร่าง {dirtyCount} รายการ</span>}
            {draftChanges.total > 0 && <><span className="text-green">▲ {draftChanges.inc}</span><span className="text-danger">▼ {draftChanges.dec}</span></>}
          </div>
          <div className="ml-auto flex gap-2">
            {canEditCount && <button className="btn btn-g btn-sm" onClick={() => void resetAll()} disabled={locked || !dirtyCount}>↩️ ล้างฉบับร่าง</button>}
            {canEditCount && draftChanges.total > 0 && <button className="btn btn-p btn-sm" disabled={locked || !!error || loading} onClick={() => void saveAll()}>{saving === 'all' ? '⏳ กำลังบันทึก…' : `💾 บันทึกทั้งหมด (${draftChanges.total})`}</button>}
          </div>
        </div>
        {/* ความคืบหน้าทั้งรอบ: อยู่ในแถบบนที่ติดหน้าจอ เห็นตลอดโดยไม่กินพื้นที่การ์ด */}
        <section className="mt-2" aria-label="ความคืบหน้าทั้งรอบ">
          {loading || error ? <p className="m-0 text-xs text-mute">{error ? 'โหลดสรุปรอบนับไม่ได้' : 'กำลังโหลดสรุป…'}</p> : <>
            <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums sm:text-sm">
              <span className="text-green">นับแล้ว <b>{fmtNum(summary.counted)}</b></span>
              <span className="text-warn">ข้าม <b>{fmtNum(summary.skipped)}</b></span>
              <span>ค้าง <b>{fmtNum(summary.pending.length)}</b></span>
              {summary.pending.length > 0 && <button type="button" className="btn btn-g btn-sm !py-0.5" disabled={locked} onClick={() => moveToMapForCounting('')}>ไปรายการค้าง</button>}
              <span className="ml-auto font-bold text-mute">{countPercent}%</span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-s3" role="progressbar" aria-label="รายการที่นับแล้วหรือข้ามรอบนี้" aria-valuemin={0} aria-valuemax={Math.max(1, summary.total)} aria-valuenow={summary.counted + summary.skipped}>
              <div className="h-full bg-green transition-[width]" style={{ width: `${summary.total ? summary.counted * 100 / summary.total : 0}%` }} />
              <div className="h-full bg-warn transition-[width]" style={{ width: `${summary.total ? summary.skipped * 100 / summary.total : 0}%` }} />
            </div>
          </>}
        </section>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className={roundSaveError ? 'text-danger' : 'text-mute'}>
          {!canEditCount ? 'สิทธิ์ดูอย่างเดียว · แก้ไขสถานะรอบนับไม่ได้' : roundSaveError ? `บันทึกรอบนับไม่สำเร็จ: ${roundSaveError}` : saving ? 'กำลังบันทึกรอบนับ…' : roundSavedAt ? `บันทึกรอบนับแล้ว · ${new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(roundSavedAt))}` : roundLoaded ? 'ยังไม่มีรายการที่บันทึกในรอบนี้' : 'กำลังโหลดรอบนับ…'}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {can('history', 'view') && <Link to="/history" className="font-semibold text-sky-200 hover:text-white">🕘 ประวัติสต็อก →</Link>}
          {canEditCount && <button type="button" className="btn btn-g btn-sm" disabled={locked || !roundLoaded || (!countedIds.size && !skippedMapIds.size && !dirtyCount)} onClick={() => void startNewRound()}>🔄 เริ่มรอบนับใหม่</button>}
        </span>
        {canEditCount && dirtyCount > 0 && <p className={`m-0 w-full ${draftStored ? 'text-mute' : 'text-danger'}`}>
          {draftStored ? 'ฉบับร่างเก็บบนเบราว์เซอร์นี้ · ยอดสต็อกเปลี่ยนเมื่อกดยืนยัน' : 'เบราว์เซอร์เก็บฉบับร่างไม่ได้ · บันทึกก่อนออกจากหน้า'}
          {draftChanges.total < dirtyCount && ` · ${dirtyCount - draftChanges.total} รายการอยู่นอกกลุ่มที่บันทึกได้ในรอบนี้`}
        </p>}
      </div>
      <section className="mb-2 rounded-lg border border-teal-300/20 bg-[#101b17]/75 p-3" aria-label="เลือกแมพ">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="m-0 text-sm font-bold text-white">🗺️ 1. เลือกแมพ</h2><p className="mb-0 mt-0.5 text-xs text-mute">เลือกแมพที่ต้องการนับ · เรียงตามลำดับงาน</p></div>
          {canEditCount && mapF && <button type="button" disabled={locked || loading || !!error} className={`btn btn-sm ${skippedMapIds.has(mapF) ? 'btn-p' : 'border border-red-500 bg-red-600 text-white hover:bg-red-700'}`} onClick={() => skippedMapIds.has(mapF) ? void restoreMap(mapF) : void skipCurrentMap()}>
            {saving === 'skip' || saving === 'restore' ? 'กำลังบันทึก…' : skippedMapIds.has(mapF) ? '↩️ นำแมพกลับมานับ' : '⏭ ข้ามแมพนี้'}
          </button>}
        </div>
        <MapChips maps={mapList} counts={mapCounts} total={Object.values(mapCounts).reduce((sum, n) => sum + n, 0)} selected={mapF || 'all'} onSelect={(id) => updateFilters({ mapF: id === 'all' ? '' : id, acctF: '', productCountF: 'pending', ghostCountF: 'pending' })} />
      </section>
      <section className="mb-3 rounded-lg border border-sky-300/20 bg-[#10171b]/75 p-3" aria-label="เลือก Account ID">
        <div className="mb-2"><h2 className="m-0 text-sm font-bold text-white">🔑 2. เลือก Account ID</h2><p className="mb-0 mt-0.5 text-xs text-mute">แสดงเฉพาะ Account ที่มีสินค้าในแมพที่เลือก</p></div>
        <div className="flex flex-wrap items-center gap-2">
        {!mapF && <span className="text-sm text-mute">เลือกแมพก่อน แล้ว Account ID ของแมพนั้นจะแสดงตรงนี้</span>}
        {mapF && <>
        <button type="button" onClick={() => updateFilters({ acctF: '', productCountF: 'pending', ghostCountF: 'pending' })} className={`cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition duration-200 ${!acctF ? 'bg-accent text-black' : 'bg-teal-400/10 text-teal-200 ring-1 ring-teal-300/20 hover:bg-teal-400/20'}`}>
          🔑 ทุก Account<span className={`ml-1 text-xs ${!acctF ? 'opacity-70' : 'text-mute'}`}>{fmtNum([...acctCounts.values()].reduce((sum, n) => sum + n, 0))}</span>
        </button>
        {acctOptions.map((s) => {
          const accountBanned = bannedPairs.has(`${s.id}\u0000${mapF}`);
          return <button key={s.id} type="button" disabled={accountBanned} title={accountBanned ? 'โดนแบนในแมพนี้ · ระบบจะข้าม Account นี้' : undefined} onClick={() => { mapNavigationPending.current = true; updateFilters({ acctF: s.id, productCountF: 'pending', ghostCountF: 'pending' }); }} className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${acctF === s.id ? 'bg-accent text-black' : 'bg-teal-400/10 text-teal-200 ring-1 ring-teal-300/20 hover:bg-teal-400/20'}`}>
          {bannedPairs.has(`${s.id}\u0000${mapF}`) ? '🚫 ' : '🔑 '}{s.shopId}<span className={`ml-1 text-xs ${acctF === s.id ? 'opacity-70' : 'text-mute'}`}>{fmtNum(acctCounts.get(s.id) ?? 0)}</span>
          </button>;
        })}
        {canEditCount && acctF && <button type="button" className={`btn btn-sm ${selectedPairBanned ? 'btn-g' : 'border border-red-500 bg-red-600 text-white hover:bg-red-700'}`} disabled={locked || loading || !!error} onClick={toggleSelectedPairBan}>
          {banSaving ? 'กำลังบันทึก…' : selectedPairBanned ? '↩️ ยกเลิกแบน ID ในแมพนี้' : '🚫 แบน ID ในแมพนี้'}
        </button>}
        </>}
        </div>
      </section>
      {/* มือถือ: พับตัวกรองรองไว้ใต้ปุ่มเดียว · จอใหญ่: แสดงตลอด */}
      <button type="button" className={`btn btn-sm mb-3 w-full md:hidden ${activeFilterCount ? 'btn-p' : 'btn-g'}`} aria-expanded={showFilters} aria-controls="stockcount-filters" onClick={() => setShowFilters((open) => !open)}>
        🔍 ค้นหาและตัวกรอง{activeFilterCount ? ` (${activeFilterCount})` : ''} {showFilters ? '▴' : '▾'}
      </button>
      <div id="stockcount-filters" className={`${showFilters ? 'block' : 'hidden'} md:block`}>
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="กรองสถานะสินค้าที่นับ">
          <span className="mr-1 text-xs font-bold text-mute">📦 สินค้า</span>
          <button className={`btn btn-sm ${productCountF === 'all' ? 'btn-p' : 'btn-g'}`} aria-pressed={productCountF === 'all'} onClick={() => updateFilters({ productCountF: 'all' })}>ทั้งหมด ({countPList.length})</button>
          <button className={`btn btn-sm ${productCountF === 'pending' ? 'btn-p' : 'btn-g'}`} aria-pressed={productCountF === 'pending'} onClick={() => updateFilters({ productCountF: 'pending' })}>ยังไม่นับ ({productCountable.length - productDone})</button>
          <button className={`btn btn-sm ${productCountF === 'counted' ? 'btn-p' : 'btn-g'}`} aria-pressed={productCountF === 'counted'} onClick={() => updateFilters({ productCountF: 'counted' })}>นับแล้ว ({productDone})</button>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="กรองสถานะ Ghost">
          <span className="mr-1 text-xs font-bold text-orange">👻 Ghost</span>
          <button className={`btn btn-sm ${ghostCountF === 'all' ? 'border border-orange/50 bg-orange/20 text-white' : 'btn-g'}`} aria-pressed={ghostCountF === 'all'} onClick={() => updateFilters({ ghostCountF: 'all' })}>ทั้งหมด ({countGList.length})</button>
          <button className={`btn btn-sm ${ghostCountF === 'pending' ? 'border border-orange/50 bg-orange/20 text-white' : 'btn-g'}`} aria-pressed={ghostCountF === 'pending'} onClick={() => updateFilters({ ghostCountF: 'pending' })}>ยังไม่นับ ({countGList.length - ghostDone})</button>
          <button className={`btn btn-sm ${ghostCountF === 'counted' ? 'border border-orange/50 bg-orange/20 text-white' : 'btn-g'}`} aria-pressed={ghostCountF === 'counted'} onClick={() => updateFilters({ ghostCountF: 'counted' })}>นับแล้ว ({ghostDone})</button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="inp min-w-[200px] flex-[2]" placeholder="🔍 ค้นหาสินค้า…" value={q} onChange={(e) => updateFilters({ q: e.target.value })} />
        <select className={sel} aria-label="ประเภท" value={typeF} onChange={(e) => updateFilters({ typeF: e.target.value as TypeF })}>
          <option value="">ทุกประเภท</option><option value="normal">📌 ปกติ</option><option value="bundle">📦 เซ็ต</option><option value="ghost">👻 Ghost</option>
        </select>
        <select className={sel} aria-label="ระดับสต็อก" value={stockF} onChange={(e) => updateFilters({ stockF: e.target.value as StockF })}>
          <option value="">ทุกระดับสต็อก</option><option value="low">⚠️ ต่ำ (≤{LOW})</option><option value="zero">หมด (0)</option><option value="ok">ปกติ (&gt;{LOW})</option>
        </select>
        <select className={sel} aria-label="เรียงลำดับ" value={sort} onChange={(e) => updateFilters({ sort: e.target.value as SortKey })}>
          <option value="custom">เรียงตามลำดับ</option><option value="name">ชื่อ A→Z</option><option value="stock-asc">สต็อกน้อย→มาก</option>
          <option value="stock-desc">สต็อกมาก→น้อย</option><option value="map">ตามแมพ</option>
        </select>
      </div>
      </div>

      {skippedMaps.length > 0 && <div className="mb-4 rounded-lg border border-warn/30 bg-[#191919]/95 p-3 text-sm">
        <span className="mr-2 text-warn">⏭ ข้ามแมพในรอบนี้:</span>
        {skippedMaps.map((m) => canEditCount ? <button key={m.id} type="button" className="btn btn-g btn-sm mb-1 mr-1" disabled={locked || loading || !!error} onClick={() => void restoreMap(m.id)} title="คลิกเพื่อนำแมพกลับมานับ">{m.icon} {m.name} ×</button> : <span key={m.id} className="mr-2">{m.icon} {m.name}</span>)}
        <p className="mb-0 mt-1 text-xs text-mute">รายการที่ข้ามแสดงแยกในสรุปรอบ{canEditCount ? ' · คลิกชื่อแมพเพื่อนำกลับมานับ' : ''}</p>
      </div>}

      {bannedProducts.length > 0 && <div className="mb-4 rounded-lg border border-red-500/35 bg-red-950/35 p-3 text-sm text-red-100">
        <div className="font-semibold">🚫 ข้ามสินค้า {bannedProducts.length} รายการจากไอดีที่โดนแบนในแมพที่เกี่ยวข้อง</div>
        <p className="mb-0 mt-1 text-xs text-red-100/75">สถานะแบนมีผลทุกครั้งจนกว่าจะกดยกเลิก · สินค้าคู่อื่นและแมพอื่นยังนับตามปกติ</p>
      </div>}

      {loading ? <Spinner /> : error ? <ErrorBox error={error} /> : !visiblePList.length && !visibleGList.length ? <Empty icon={typeF === 'ghost' ? '👻' : '🎁'} text={selectedPairBanned ? 'ไอดีนี้โดนแบนในแมพนี้ — สินค้าที่ผูกกับคู่นี้ถูกข้ามแล้ว' : mapF && skippedMapIds.has(mapF) ? 'แมพนี้ถูกข้ามอยู่ — กด “นำแมพกลับมานับ” หากต้องการนับ' : typeF === 'ghost' ? ghostCountF === 'pending' ? 'ไม่มี Ghost ที่รอนับในตัวกรองนี้' : ghostCountF === 'counted' ? 'ยังไม่มี Ghost ที่นับแล้วในตัวกรองนี้' : 'ไม่พบ Ghost' : 'ไม่พบรายการในตัวกรองนี้'} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visiblePList.length > 0 && visibleGList.length > 0 && <div className="col-span-full pt-1 text-xs font-bold uppercase tracking-[0.1em] text-mute">📦 สินค้า ({visiblePList.length})</div>}
          {visiblePList.map((p) => <ProductCard key={p.id} p={p} maps={mapList} shops={shopList} cur={curP(p)} saving={saving === `p:${p.id}`} locked={locked} counted={countedIds.has(`p:${p.id}`)} editable={canEditCount} onChange={(n) => editDraft(`p:${p.id}`, n, p.stock)} onSaveNext={() => void confirmCountAndNext(`p:${p.id}`, p.stock)} />)}
          {visibleGList.length > 0 && <div className="col-span-full pt-3 text-xs font-bold uppercase tracking-[0.1em] text-orange">👻 Ghost · ชิ้นส่วนที่ไม่ขายแยก ({visibleGList.length})</div>}
          {visibleGList.map((g) => <GhostCard key={g.id} g={g} cur={curG(g)} saving={saving === `g:${g.id}`} locked={locked} counted={countedIds.has(`g:${g.id}`)} editable={canEditCount} usedIn={(ghostUsage.get(g.id) ?? []).filter((p) => (!mapF || p.mapId === mapF) && (!acctF || p.shopIdRef === acctF) && !isProductBanned(p))} maps={mapList} onChange={(n) => editDraft(`g:${g.id}`, n, g.stock)} onSaveNext={() => void confirmCountAndNext(`g:${g.id}`, g.stock)} />)}
        </div>
      )}
    </div>
  );
}
