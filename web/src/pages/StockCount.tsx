import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Chip, Empty, ErrorBox, Spinner, Thumb, useToast } from '../components/ui';
import { errMsg, saveStockCount, saveStockCountRound, useGhosts, useMaps, useProducts, useRefreshData, useStockCountShopIds, useStockCountRound, useStockHistory } from '../lib/data';
import { fmtNum } from '../lib/format';
import { mapCtx, sortProducts, type SortKey } from '../lib/products';
import type { Ghost, MapRow, Product } from '../lib/types';

type TypeF = '' | 'normal' | 'bundle' | 'ghost';
type StockF = '' | 'low' | 'zero' | 'ok';
type CountF = 'all' | 'pending' | 'counted';
const LOW = 5;
const GHOST_PREFIX = '__ghost__:';
const ghostKey = (name: string) => name.trim().toLocaleLowerCase();

function referencedGhostName(item: Product['bundleItems'][number]) {
  if (!item.productId.startsWith(GHOST_PREFIX)) return '';
  const idName = item.productId.slice(GHOST_PREFIX.length);
  return (item.ghostName ?? idName).trim();
}

/** ช่องกรอกจำนวน: พิมพ์ลบจนว่างได้ระหว่างแก้ไข แต่ค่าที่ส่งออกเป็นตัวเลข >= 0 เสมอ */
function CountInput({ value, onChange, dirty, disabled }: { value: number; onChange: (n: number) => void; dirty: boolean; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if ((parseInt(text, 10) || 0) !== value) setText(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input type="number" min={0} inputMode="numeric" value={text} disabled={disabled}
      className={`inp min-w-0 flex-1 text-center font-head text-base font-bold ${dirty ? '!border-warn !text-warn' : ''}`}
      onChange={(e) => { setText(e.target.value); onChange(Math.max(0, parseInt(e.target.value, 10) || 0)); }}
      onFocus={(e) => e.target.select()} />
  );
}

/** แถวนับ: บรรทัดแรกบอกค่าเดิมและส่วนต่าง บรรทัดที่สอง [−] ช่องกรอก [+] ปุ่มบันทึกโผล่เฉพาะเมื่อมีการแก้ */
function CountRow({ orig, cur, onChange, onSaveNext, saving, counted, editable }: { orig: number; cur: number; onChange: (n: number) => void; onSaveNext: () => void; saving: boolean; counted: boolean; editable: boolean }) {
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
        <button className={step} aria-label="-1" disabled={!editable} onClick={() => onChange(Math.max(0, cur - 1))}>−</button>
        <CountInput value={cur} onChange={onChange} dirty={dirty} disabled={!editable} />
        <button className={step} aria-label="+1" disabled={!editable} onClick={() => onChange(cur + 1)}>+</button>
      </div>
      {editable ? <button type="button" disabled={saving || (counted && !dirty)} onClick={onSaveNext} className="btn btn-p btn-sm mt-2 w-full">
        {saving ? '⏳ กำลังบันทึก…' : dirty ? `💾 บันทึก + ไปชิ้นถัดไป (${fmtNum(orig)}→${fmtNum(cur)})` : counted ? '✅ นับแล้ว' : '✅ ยืนยันจำนวน + ไปชิ้นถัดไป'}
      </button> : <div className="mt-2 rounded-md bg-s2 px-3 py-2 text-center text-xs font-semibold text-mute">{counted ? '✅ นับแล้ว' : 'ดูอย่างเดียว · ไม่มีสิทธิ์บันทึกผลนับ'}</div>}
    </>
  );
}

interface ProductCardProps {
  p: Product; maps: MapRow[]; shops: { id: string; shopId: string }[]; cur: number;
  saving: boolean; counted: boolean; editable: boolean; onChange: (n: number) => void; onSaveNext: () => void;
}
function ProductCard({ p, maps, shops, cur, saving, counted, editable, onChange, onSaveNext }: ProductCardProps) {
  const map = maps.find((m) => m.id === p.mapId);
  const shop = shops.find((s) => s.id === p.shopIdRef);
  const dirty = cur !== p.stock;
  return (
    <div id={`stock-card-p-${p.id}`} className={`flex h-full flex-col rounded-lg border bg-[#191919]/95 p-3 transition ${dirty ? 'border-warn/60' : 'border-[#303030]'}`}>
      <div className="flex gap-3">
        <Thumb src={p.thumbnail} className="h-14 w-14 sm:h-16 sm:w-16" />
        <div className="min-w-0 flex-1">
          <div className="break-words font-bold">{p.name}{p.isBundle && <span className="ml-1.5"><Chip tone="shop">📦</Chip></span>}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {map && <Chip tone="map" className="text-[0.8rem]">{map.icon} {map.name}</Chip>}
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
          <CountRow orig={p.stock} cur={cur} saving={saving} counted={counted} editable={editable} onChange={onChange} onSaveNext={onSaveNext} />
        )}
      </div>
    </div>
  );
}
interface GhostCardProps {
  g: Ghost; cur: number; saving: boolean; counted: boolean; editable: boolean; onChange: (n: number) => void; onSaveNext: () => void;
  usedIn: Product[]; maps: MapRow[];
}
function GhostCard({ g, cur, saving, counted, editable, onChange, onSaveNext, usedIn, maps }: GhostCardProps) {
  const dirty = cur !== g.stock;
  return (
    <div id={`stock-card-g-${g.id}`} className={`flex h-full flex-col rounded-lg border bg-[#191919]/95 p-3 ${dirty ? 'border-warn/60' : 'border-orange/30'}`}>
      <div className="flex gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-s3 text-3xl sm:h-16 sm:w-16">👻</div>
        <div className="min-w-0 flex-1">
          <div className="break-words font-bold text-orange">{g.name}</div>
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
        <CountRow orig={g.stock} cur={cur} saving={saving} counted={counted} editable={editable} onChange={onChange} onSaveNext={onSaveNext} />
      </div>
    </div>
  );
}

export default function StockCountPage() {
  const { can } = useAuth();
  const canEditCount = can('stockcount', 'edit');
  const toast = useToast();
  const refresh = useRefreshData();
  const maps = useMaps();
  const shops = useStockCountShopIds();
  const products = useProducts();
  const ghosts = useGhosts();
  const history = useStockHistory();
  const round = useStockCountRound();

  const [q, setQ] = useState('');
  const [mapF, setMapF] = useState('');
  const [acctF, setAcctF] = useState('');
  const [typeF, setTypeF] = useState<TypeF>('');
  const [stockF, setStockF] = useState<StockF>('');
  const [productCountF, setProductCountF] = useState<CountF>('pending');
  const [ghostCountF, setGhostCountF] = useState<CountF>('pending');
  const [countedIds, setCountedIds] = useState<Set<string>>(() => new Set());
  const [skippedMapIds, setSkippedMapIds] = useState<Set<string>>(() => new Set());
  const [roundLoaded, setRoundLoaded] = useState(false);
  const [roundSaving, setRoundSaving] = useState(false);
  const [roundSaveError, setRoundSaveError] = useState('');
  const [roundSavedAt, setRoundSavedAt] = useState<string | null>(null);
  const roundInitialized = useRef(false);
  const roundSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const [sort, setSort] = useState<SortKey>('custom');
  const [pc, setPc] = useState<Record<string, number>>({}); // สินค้าที่แก้
  const [gc, setGc] = useState<Record<string, number>>({}); // ghost ที่แก้
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const mapList = maps.data ?? [];
  const shopList = shops.data ?? [];
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
  const mapName = (id: string | null) => mapList.find((m) => m.id === id)?.name ?? '';
  const curP = (p: Product) => pc[p.id] ?? p.stock;
  const curG = (g: Ghost) => gc[g.id] ?? g.stock;

  useEffect(() => {
    if (round.isLoading || round.isError || roundInitialized.current) return;
    roundInitialized.current = true;
    setCountedIds(new Set(round.data?.countedIds ?? []));
    setSkippedMapIds(new Set(round.data?.skippedMapIds ?? []));
    setRoundSavedAt(round.data?.updatedAt ?? null);
    setRoundLoaded(true);
  }, [round.data, round.isError, round.isLoading]);

  useEffect(() => {
    if (!canEditCount || !roundLoaded || round.error) return;
    if (!round.data && countedIds.size === 0 && skippedMapIds.size === 0) return;
    const countedSnapshot = [...countedIds];
    const skippedSnapshot = [...skippedMapIds];
    const timer = window.setTimeout(() => {
      setRoundSaving(true);
      setRoundSaveError('');
      roundSaveQueue.current = roundSaveQueue.current.catch(() => undefined).then(async () => {
        try {
          await saveStockCountRound(countedSnapshot, skippedSnapshot);
          setRoundSavedAt(new Date().toISOString());
        } catch (e) {
          const message = errMsg(e);
          setRoundSaveError(message);
          toast(`บันทึกรอบนับไม่สำเร็จ: ${message}`, 'error');
        } finally { setRoundSaving(false); }
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [canEditCount, countedIds, skippedMapIds, roundLoaded, round.data, round.error, toast]);

  // เตือนก่อนปิดหน้าถ้ามีการแก้ที่ยังไม่บันทึก
  const dirtyCount = Object.keys(pc).length + Object.keys(gc).length;
  useEffect(() => {
    if (!dirtyCount) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirtyCount]);

  const acctOptions = useMemo(() => {
    const used = new Set((products.data ?? []).filter((p) => !mapF || p.mapId === mapF).map((p) => p.shopIdRef).filter(Boolean));
    return shopList.filter((s) => used.has(s.id));
  }, [products.data, shopList, mapF]);
  useEffect(() => { if (acctF && !acctOptions.some((s) => s.id === acctF)) setAcctF(''); }, [acctOptions, acctF]);

  const stockOk = (n: number) => (stockF === 'low' ? n <= LOW : stockF === 'zero' ? n === 0 : stockF === 'ok' ? n > LOW : true);

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
      return stockOk(pc[p.id] ?? p.stock);
    });
    return sortProducts(list, sort, mapCtx(mapList));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.data, q, mapF, acctF, typeF, stockF, sort, pc, mapList]);

  const gList = useMemo(() => {
    if (typeF !== '' && typeF !== 'ghost') return [];
    const k = q.trim().toLocaleLowerCase();
    const list = (ghosts.data ?? []).filter((g) => {
      const usedIn = (ghostUsage.get(g.id) ?? []).filter((p) => (!mapF || p.mapId === mapF) && (!acctF || p.shopIdRef === acctF));
      if (mapF && !usedIn.some((p) => p.mapId === mapF)) return false;
      if (acctF && !usedIn.some((p) => p.shopIdRef === acctF)) return false;
      if (k && !g.name.toLocaleLowerCase().includes(k) && !(g.note ?? '').toLocaleLowerCase().includes(k) && !usedIn.some((p) => p.name.toLocaleLowerCase().includes(k))) return false;
      return stockOk(gc[g.id] ?? g.stock);
    });
    const num = (g: Ghost) => (g.sortOrder === null ? 9999 : g.sortOrder);
    if (sort === 'custom') list.sort((a, b) => num(a) - num(b));
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    else if (sort === 'stock-asc') list.sort((a, b) => (gc[a.id] ?? a.stock) - (gc[b.id] ?? b.stock));
    else if (sort === 'stock-desc') list.sort((a, b) => (gc[b.id] ?? b.stock) - (gc[a.id] ?? a.stock));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghosts.data, ghostUsage, q, mapF, acctF, typeF, stockF, sort, gc]);

  const countPList = pList.filter((p) => !p.mapId || !skippedMapIds.has(p.mapId));
  const countGList = gList.filter((g) => {
    const usedIn = ghostUsage.get(g.id) ?? [];
    if (!usedIn.length) return true;
    const matches = usedIn.filter((p) => (!mapF || p.mapId === mapF) && (!acctF || p.shopIdRef === acctF));
    return matches.some((p) => !p.mapId || !skippedMapIds.has(p.mapId));
  });
  const skippedMaps = mapList.filter((m) => skippedMapIds.has(m.id));

  // สรุป: นับเฉพาะรายการที่มีการแก้จริง (ค่าใหม่ต่างจากเดิม)
  const stats = useMemo(() => {
    let changed = 0, inc = 0, dec = 0;
    const tally = (cur: number, orig: number) => { if (cur !== orig) { changed++; if (cur > orig) inc++; else dec++; } };
    (products.data ?? []).forEach((p) => { if (pc[p.id] !== undefined && !p.isBundle) tally(pc[p.id], p.stock); });
    (ghosts.data ?? []).forEach((g) => { if (gc[g.id] !== undefined) tally(gc[g.id], g.stock); });
    return { changed, inc, dec, total: countPList.length + countGList.length };
  }, [products.data, ghosts.data, pc, gc, countPList.length, countGList.length]);

  async function save(ps: { id: string; stock: number }[], gs: { id: string; stock: number }[], key: string) {
    setSaving((s) => new Set(s).add(key));
    try {
      await saveStockCount(ps, gs);
      setCountedIds((current) => new Set([...current, ...ps.map((x) => `p:${x.id}`), ...gs.map((x) => `g:${x.id}`)]));
      setPc((c) => { const n = { ...c }; ps.forEach((x) => delete n[x.id]); return n; });
      setGc((c) => { const n = { ...c }; gs.forEach((x) => delete n[x.id]); return n; });
      await refresh();
      return true;
    } catch (e) { toast(errMsg(e), 'error'); return false; } finally {
      setSaving((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  }

  async function saveOne(p: Product) {
    const ok = await save([{ id: p.id, stock: pc[p.id] }], [], p.id);
    if (ok) toast(`อัปเดตสต็อก "${p.name}" → ${fmtNum(pc[p.id])} ✅`);
    return ok;
  }
  async function saveOneGhost(g: Ghost) {
    const ok = await save([], [{ id: g.id, stock: gc[g.id] }], g.id);
    if (ok) toast(`อัปเดตสต็อก 👻 "${g.name}" → ${fmtNum(gc[g.id])} ✅`);
    return ok;
  }
  async function saveAll() {
    const ps = Object.entries(pc).filter(([id, v]) => products.data?.find((p) => p.id === id)?.stock !== v).map(([id, stock]) => ({ id, stock }));
    const gs = Object.entries(gc).filter(([id, v]) => ghosts.data?.find((g) => g.id === id)?.stock !== v).map(([id, stock]) => ({ id, stock }));
    const total = ps.length + gs.length;
    if (!total) { toast('ไม่มีการเปลี่ยนแปลง', 'info'); return; }
    const acct = acctF ? shopList.find((s) => s.id === acctF)?.shopId ?? acctF : 'ทุก Account';
    if (!confirm(`บันทึกการเปลี่ยนแปลงสต็อก ${total} รายการ?\nAccount: ${acct}`)) return;
    if (await save(ps, gs, '__all__')) toast(`บันทึกสำเร็จ ${total} รายการ ✅`);
  }
  function resetAll() {
    if (dirtyCount && !confirm('ยกเลิกการแก้ไขที่ยังไม่บันทึกทั้งหมด?')) return;
    setPc({}); setGc({});
  }

  function startNewRound() {
    if (!confirm('เริ่มรอบนับใหม่? สถานะนับแล้วและรายการแมพที่ข้ามจะถูกล้าง แต่จำนวนสต็อกที่บันทึกแล้วจะไม่เปลี่ยน')) return;
    setCountedIds(new Set());
    setSkippedMapIds(new Set());
    setProductCountF('pending');
    setGhostCountF('pending');
    toast('เริ่มรอบนับใหม่แล้ว · กำลังบันทึก…', 'info');
  }

  async function confirmCountAndNext(key: string, commit?: () => Promise<boolean>) {
    if (commit) { if (!(await commit())) return; }
    else setCountedIds((current) => new Set(current).add(key));

    const sequence = [
      ...(countPList.filter((p) => !p.isBundle).map((p) => ({ key: `p:${p.id}`, domId: `stock-card-p-${p.id}` }))),
      ...countGList.map((g) => ({ key: `g:${g.id}`, domId: `stock-card-g-${g.id}` })),
    ];
    const index = sequence.findIndex((item) => item.key === key);
    const ordered = index < 0 ? sequence : [...sequence.slice(index + 1), ...sequence.slice(0, index)];
    const completed = new Set(countedIds).add(key);
    const next = ordered.find((item) => !completed.has(item.key));
    if (!next) {
      setProductCountF('counted');
      setGhostCountF('counted');
      toast('นับครบรายการที่แสดงแล้ว ✅');
      return;
    }
    if (next.key.startsWith('g:')) setGhostCountF('pending');
    else setProductCountF('pending');
    window.requestAnimationFrame(() => {
      const card = document.getElementById(next.domId);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card?.querySelector<HTMLInputElement>('input[type=number]')?.focus({ preventScroll: true });
    });
  }

  const productCountable = countPList.filter((p) => !p.isBundle);
  const productDone = productCountable.filter((p) => countedIds.has(`p:${p.id}`)).length;
  const ghostDone = countGList.filter((g) => countedIds.has(`g:${g.id}`)).length;
  const countableTotal = productCountable.length + countGList.length;
  const countableDone = productDone + ghostDone;
  const countPercent = countableTotal ? Math.round(countableDone * 100 / countableTotal) : 0;
  const visiblePList = productCountF === 'all' ? countPList : countPList.filter((p) => !p.isBundle && countedIds.has(`p:${p.id}`) === (productCountF === 'counted'));
  const visibleGList = ghostCountF === 'all' ? countGList : countGList.filter((g) => countedIds.has(`g:${g.id}`) === (ghostCountF === 'counted'));

  const loading = maps.isLoading || shops.isLoading || products.isLoading || ghosts.isLoading || round.isLoading;
  const error = maps.error || shops.error || products.error || ghosts.error || round.error;
  const sel = 'sel min-w-[130px] flex-1';


  return (
    <div>
      <div className="sticky top-0 z-20 mb-4 bg-bg/95 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <h1 className="font-head text-2xl font-bold tracking-tight">🧮 นับสต็อก</h1>
          <div className="flex flex-wrap items-center gap-x-4 text-sm text-mute">
            <span><b className="text-white">{stats.total}</b> รายการ</span>
            <span className={stats.changed ? 'text-warn' : ''}><b>{stats.changed}</b> แก้ไข</span>
            {stats.changed > 0 && <><span className="text-green">▲ {stats.inc}</span><span className="text-danger">▼ {stats.dec}</span></>}
          </div>
          <div className="ml-auto flex gap-2">
            {canEditCount && <button className="btn btn-g btn-sm" onClick={resetAll} disabled={!dirtyCount}>↩️ รีเซ็ต</button>}
            {canEditCount && stats.changed > 0 && <button className="btn btn-p btn-sm" disabled={saving.has('__all__')} onClick={saveAll}>{saving.has('__all__') ? '⏳ กำลังบันทึก…' : `💾 บันทึกทั้งหมด (${stats.changed})`}</button>}
          </div>
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-line bg-[#191919]/95 p-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span>ความคืบหน้า: <b className="text-accent">{countableDone}/{countableTotal}</b> รายการที่นับได้</span>
          <span className="font-head text-mute">{countPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-s3" role="progressbar" aria-label="ความคืบหน้าการนับ" aria-valuemin={0} aria-valuemax={countableTotal} aria-valuenow={countableDone}>
          <div className="h-full rounded-full bg-green transition-[width]" style={{ width: `${countPercent}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className={roundSaveError ? 'text-danger' : 'text-mute'}>
            {!canEditCount ? 'สิทธิ์ดูอย่างเดียว · แก้ไขสถานะรอบนับไม่ได้' : roundSaveError ? `บันทึกรอบนับไม่สำเร็จ: ${roundSaveError}` : roundSaving ? 'กำลังบันทึกรอบนับ…' : roundSavedAt ? `บันทึกรอบนับแล้ว · ${new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(roundSavedAt))}` : roundLoaded ? 'รอบนับจะบันทึกอัตโนมัติ' : 'กำลังโหลดรอบนับ…'}
          </span>
          {canEditCount && <button type="button" className="btn btn-g btn-sm" disabled={!roundLoaded || (!countedIds.size && !skippedMapIds.size)} onClick={startNewRound}>🔄 เริ่มรอบนับใหม่</button>}
        </div>
        <p className="mb-0 mt-1 text-xs text-mute">สถานะนับแล้วและแมพที่ข้ามจะจำแยกตามบัญชี · การเปลี่ยนสต็อกจะบันทึกเมื่อกดยืนยัน</p>
      </div>
      <details className="mb-3 rounded-lg border border-line bg-[#191919]/95">
        <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-semibold text-sky-200">
          🕘 ประวัติเปลี่ยนสต็อก 3 วันล่าสุด {history.data && <span className="text-xs text-mute">({history.data.length} รายการ)</span>}
        </summary>
        <div className="max-h-80 overflow-y-auto border-t border-line px-3">
          {history.isLoading ? <div className="py-3 text-sm text-mute">กำลังโหลดประวัติ…</div>
            : history.error ? <div className="py-3 text-sm text-danger">โหลดประวัติไม่ได้: {errMsg(history.error)}</div>
              : !history.data?.length ? <div className="py-3 text-sm text-mute">ยังไม่มีประวัติในช่วง 3 วันที่ผ่านมา</div>
                : history.data.map((entry) => (
                  <div key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/60 py-2 text-xs last:border-b-0">
                    <time className="shrink-0 text-faint">{new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.createdAt))}</time>
                    <span className="min-w-0 flex-1 font-semibold text-ink">{entry.itemName}<span className="ml-1 text-faint">{entry.itemType === 'ghost' ? '👻' : '📦'}</span></span>
                    <span className="text-sky-200">{entry.oldStock === null ? '—' : fmtNum(entry.oldStock)} → {entry.newStock === null ? 'ลบแล้ว' : fmtNum(entry.newStock)}</span>
                    <span className="text-mute">{entry.actorUsername ?? 'ไม่ระบุผู้ใช้'}</span>
                  </div>
                ))}
        </div>
      </details>
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="กรองสถานะสินค้าที่นับ">
          <span className="mr-1 text-xs font-bold text-mute">📦 สินค้า</span>
          <button className={`btn btn-sm ${productCountF === 'all' ? 'btn-p' : 'btn-g'}`} aria-pressed={productCountF === 'all'} onClick={() => setProductCountF('all')}>ทั้งหมด ({countPList.length})</button>
          <button className={`btn btn-sm ${productCountF === 'pending' ? 'btn-p' : 'btn-g'}`} aria-pressed={productCountF === 'pending'} onClick={() => setProductCountF('pending')}>ยังไม่นับ ({productCountable.length - productDone})</button>
          <button className={`btn btn-sm ${productCountF === 'counted' ? 'btn-p' : 'btn-g'}`} aria-pressed={productCountF === 'counted'} onClick={() => setProductCountF('counted')}>นับแล้ว ({productDone})</button>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="กรองสถานะ Ghost">
          <span className="mr-1 text-xs font-bold text-orange">👻 Ghost</span>
          <button className={`btn btn-sm ${ghostCountF === 'all' ? 'border border-orange/50 bg-orange/20 text-white' : 'btn-g'}`} aria-pressed={ghostCountF === 'all'} onClick={() => setGhostCountF('all')}>ทั้งหมด ({countGList.length})</button>
          <button className={`btn btn-sm ${ghostCountF === 'pending' ? 'border border-orange/50 bg-orange/20 text-white' : 'btn-g'}`} aria-pressed={ghostCountF === 'pending'} onClick={() => setGhostCountF('pending')}>ยังไม่นับ ({countGList.length - ghostDone})</button>
          <button className={`btn btn-sm ${ghostCountF === 'counted' ? 'border border-orange/50 bg-orange/20 text-white' : 'btn-g'}`} aria-pressed={ghostCountF === 'counted'} onClick={() => setGhostCountF('counted')}>นับแล้ว ({ghostDone})</button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="inp min-w-[200px] flex-[2]" placeholder="🔍 ค้นหาสินค้า…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={sel} aria-label="แมพ" value={mapF} onChange={(e) => setMapF(e.target.value)}>
          <option value="">🌐 ทุกแมพ</option>{mapList.map((m) => <option key={m.id} value={m.id}>{m.icon} {m.name}</option>)}
        </select>
        {canEditCount && mapF && <button type="button" className={`btn btn-sm ${skippedMapIds.has(mapF) ? 'btn-p' : 'border border-red-500 bg-red-600 text-white hover:bg-red-700'}`} onClick={() => setSkippedMapIds((current) => { const next = new Set(current); if (next.has(mapF)) next.delete(mapF); else next.add(mapF); return next; })}>
          {skippedMapIds.has(mapF) ? '↩️ นำแมพกลับมานับ' : '⏭ ข้ามแมพนี้'}
        </button>}
        <select className={sel} aria-label="Account ID" value={acctF} onChange={(e) => setAcctF(e.target.value)}>
          <option value="">🔑 ทุก Account ID</option>{acctOptions.map((s) => <option key={s.id} value={s.id}>{s.shopId}{mapName(s.mapId) ? ` (${mapName(s.mapId)})` : ''}</option>)}
        </select>
        <select className={sel} aria-label="ประเภท" value={typeF} onChange={(e) => setTypeF(e.target.value as TypeF)}>
          <option value="">ทุกประเภท</option><option value="normal">📌 ปกติ</option><option value="bundle">📦 เซ็ต</option><option value="ghost">👻 Ghost</option>
        </select>
        <select className={sel} aria-label="ระดับสต็อก" value={stockF} onChange={(e) => setStockF(e.target.value as StockF)}>
          <option value="">ทุกระดับสต็อก</option><option value="low">⚠️ ต่ำ (≤{LOW})</option><option value="zero">หมด (0)</option><option value="ok">ปกติ (&gt;{LOW})</option>
        </select>
        <select className={sel} aria-label="เรียงลำดับ" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="custom">เรียงตามลำดับ</option><option value="name">ชื่อ A→Z</option><option value="stock-asc">สต็อกน้อย→มาก</option>
          <option value="stock-desc">สต็อกมาก→น้อย</option><option value="map">ตามแมพ</option>
        </select>
      </div>

      {skippedMaps.length > 0 && <div className="mb-4 rounded-lg border border-warn/30 bg-[#191919]/95 p-3 text-sm">
        <span className="mr-2 text-warn">⏭ ข้ามแมพในรอบนี้:</span>
        {skippedMaps.map((m) => canEditCount ? <button key={m.id} type="button" className="btn btn-g btn-sm mb-1 mr-1" onClick={() => setSkippedMapIds((current) => { const next = new Set(current); next.delete(m.id); return next; })} title="คลิกเพื่อนำแมพกลับมานับ">{m.icon} {m.name} ×</button> : <span key={m.id} className="mr-2">{m.icon} {m.name}</span>)}
        <p className="mb-0 mt-1 text-xs text-mute">สินค้าของแมพเหล่านี้จะไม่แสดงและไม่นับรวมในความคืบหน้า{canEditCount ? ' คลิกชื่อแมพเพื่อนำกลับมานับ' : ''}</p>
      </div>}

      {loading ? <Spinner /> : error ? <ErrorBox error={error} /> : !visiblePList.length && !visibleGList.length ? <Empty icon={typeF === 'ghost' ? '👻' : '🎁'} text={mapF && skippedMapIds.has(mapF) ? 'แมพนี้ถูกข้ามอยู่ — กด “นำแมพกลับมานับ” หากต้องการนับ' : typeF === 'ghost' ? ghostCountF === 'pending' ? 'ไม่มี Ghost ที่รอนับในตัวกรองนี้' : ghostCountF === 'counted' ? 'ยังไม่มี Ghost ที่นับแล้วในตัวกรองนี้' : 'ไม่พบ Ghost' : 'ไม่พบรายการในตัวกรองนี้'} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visiblePList.length > 0 && visibleGList.length > 0 && <div className="col-span-full pt-1 text-xs font-bold uppercase tracking-[0.1em] text-mute">📦 สินค้า ({visiblePList.length})</div>}
          {visiblePList.map((p) => <ProductCard key={p.id} p={p} maps={mapList} shops={shopList} cur={curP(p)} saving={saving.has(p.id)} counted={countedIds.has(`p:${p.id}`)} editable={canEditCount} onChange={(n) => setPc((c) => ({ ...c, [p.id]: n }))} onSaveNext={() => confirmCountAndNext(`p:${p.id}`, pc[p.id] !== undefined && pc[p.id] !== p.stock ? () => saveOne(p) : undefined)} />)}
          {visibleGList.length > 0 && <div className="col-span-full pt-3 text-xs font-bold uppercase tracking-[0.1em] text-orange">👻 Ghost · ชิ้นส่วนที่ไม่ขายแยก ({visibleGList.length})</div>}
          {visibleGList.map((g) => <GhostCard key={g.id} g={g} cur={curG(g)} saving={saving.has(g.id)} counted={countedIds.has(`g:${g.id}`)} editable={canEditCount} usedIn={(ghostUsage.get(g.id) ?? []).filter((p) => (!mapF || p.mapId === mapF) && (!acctF || p.shopIdRef === acctF))} maps={mapList} onChange={(n) => setGc((c) => ({ ...c, [g.id]: n }))} onSaveNext={() => confirmCountAndNext(`g:${g.id}`, gc[g.id] !== undefined && gc[g.id] !== g.stock ? () => saveOneGhost(g) : undefined)} />)}
        </div>
      )}
    </div>
  );
}
