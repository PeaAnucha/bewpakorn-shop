import { useEffect, useMemo, useState } from 'react';
import { Chip, Empty, ErrorBox, Spinner, Thumb, useToast } from '../components/ui';
import { errMsg, saveStockCount, useGhosts, useMaps, useProducts, useRefreshData, useShopIdsOrdered } from '../lib/data';
import { fmtNum } from '../lib/format';
import { mapCtx, sortProducts, type SortKey } from '../lib/products';
import type { Ghost, MapRow, Product } from '../lib/types';

type TypeF = '' | 'normal' | 'bundle' | 'ghost';
type StockF = '' | 'low' | 'zero' | 'ok';
const LOW = 5;

/** ช่องกรอกจำนวน: พิมพ์ลบจนว่างได้ระหว่างแก้ไข แต่ค่าที่ส่งออกเป็นตัวเลข >= 0 เสมอ */
function CountInput({ value, onChange, dirty }: { value: number; onChange: (n: number) => void; dirty: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if ((parseInt(text, 10) || 0) !== value) setText(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input type="number" min={0} inputMode="numeric" value={text}
      className={`inp min-w-0 flex-1 text-center font-head text-base font-bold ${dirty ? '!border-warn !text-warn' : ''}`}
      onChange={(e) => { setText(e.target.value); onChange(Math.max(0, parseInt(e.target.value, 10) || 0)); }}
      onFocus={(e) => e.target.select()} />
  );
}

/** แถวนับ: บรรทัดแรกบอกค่าเดิมและส่วนต่าง บรรทัดที่สอง [−] ช่องกรอก [+] ปุ่มบันทึกโผล่เฉพาะเมื่อมีการแก้ */
function CountRow({ orig, cur, onChange, onSave, saving }: { orig: number; cur: number; onChange: (n: number) => void; onSave: () => void; saving: boolean }) {
  const dirty = cur !== orig;
  const diff = cur - orig;
  const step = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#242424] text-lg leading-none text-white transition hover:bg-[#333333] active:scale-95';
  return (
    <>
      <div className="mt-2 flex items-center justify-between text-xs text-faint">
        <span>เดิม <b className="font-head text-sm text-mute">{fmtNum(orig)}</b></span>
        {dirty && <span className={`font-head text-sm font-bold ${diff > 0 ? 'text-green' : 'text-danger'}`}>{diff > 0 ? '+' : ''}{fmtNum(diff)}</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <button className={step} aria-label="-1" onClick={() => onChange(Math.max(0, cur - 1))}>−</button>
        <CountInput value={cur} onChange={onChange} dirty={dirty} />
        <button className={step} aria-label="+1" onClick={() => onChange(cur + 1)}>+</button>
      </div>
      {dirty && (
        <button disabled={saving} onClick={onSave} className="btn btn-p btn-sm mt-2 w-full">
          {saving ? '⏳ กำลังบันทึก…' : `💾 บันทึก (${fmtNum(orig)}→${fmtNum(cur)})`}
        </button>
      )}
    </>
  );
}

export default function StockCountPage() {
  const toast = useToast();
  const refresh = useRefreshData();
  const maps = useMaps();
  const shops = useShopIdsOrdered();
  const products = useProducts();
  const ghosts = useGhosts();

  const [q, setQ] = useState('');
  const [mapF, setMapF] = useState('');
  const [acctF, setAcctF] = useState('');
  const [typeF, setTypeF] = useState<TypeF>('');
  const [stockF, setStockF] = useState<StockF>('');
  const [sort, setSort] = useState<SortKey>('custom');
  const [pc, setPc] = useState<Record<string, number>>({}); // สินค้าที่แก้
  const [gc, setGc] = useState<Record<string, number>>({}); // ghost ที่แก้
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const mapList = maps.data ?? [];
  const shopList = shops.data ?? [];
  const mapName = (id: string | null) => mapList.find((m) => m.id === id)?.name ?? '';
  const curP = (p: Product) => pc[p.id] ?? p.stock;
  const curG = (g: Ghost) => gc[g.id] ?? g.stock;

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
    if ((typeF !== '' && typeF !== 'ghost') || acctF || mapF) return [];
    const k = q.toLowerCase();
    const list = (ghosts.data ?? []).filter((g) => (!k || g.name.toLowerCase().includes(k)) && stockOk(gc[g.id] ?? g.stock));
    const num = (g: Ghost) => (g.sortOrder === null ? 9999 : g.sortOrder);
    if (sort === 'custom') list.sort((a, b) => num(a) - num(b));
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    else if (sort === 'stock-asc') list.sort((a, b) => a.stock - b.stock);
    else if (sort === 'stock-desc') list.sort((a, b) => b.stock - a.stock);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghosts.data, q, mapF, acctF, typeF, stockF, sort, gc]);

  // สรุป: นับเฉพาะรายการที่มีการแก้จริง (ค่าใหม่ต่างจากเดิม)
  const stats = useMemo(() => {
    let changed = 0, inc = 0, dec = 0;
    const tally = (cur: number, orig: number) => { if (cur !== orig) { changed++; if (cur > orig) inc++; else dec++; } };
    (products.data ?? []).forEach((p) => { if (pc[p.id] !== undefined && !p.isBundle) tally(pc[p.id], p.stock); });
    (ghosts.data ?? []).forEach((g) => { if (gc[g.id] !== undefined) tally(gc[g.id], g.stock); });
    return { changed, inc, dec, total: pList.length + gList.length };
  }, [products.data, ghosts.data, pc, gc, pList.length, gList.length]);

  async function save(ps: { id: string; stock: number }[], gs: { id: string; stock: number }[], key: string) {
    setSaving((s) => new Set(s).add(key));
    try {
      await saveStockCount(ps, gs);
      setPc((c) => { const n = { ...c }; ps.forEach((x) => delete n[x.id]); return n; });
      setGc((c) => { const n = { ...c }; gs.forEach((x) => delete n[x.id]); return n; });
      await refresh();
      return true;
    } catch (e) { toast(errMsg(e), 'error'); return false; } finally {
      setSaving((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  }

  async function saveOne(p: Product) {
    if (await save([{ id: p.id, stock: pc[p.id] }], [], p.id)) toast(`อัปเดตสต็อก "${p.name}" → ${fmtNum(pc[p.id])} ✅`);
  }
  async function saveOneGhost(g: Ghost) {
    if (await save([], [{ id: g.id, stock: gc[g.id] }], g.id)) toast(`อัปเดตสต็อก 👻 "${g.name}" → ${fmtNum(gc[g.id])} ✅`);
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

  const loading = maps.isLoading || shops.isLoading || products.isLoading || ghosts.isLoading;
  const error = maps.error || shops.error || products.error || ghosts.error;
  const sel = 'sel min-w-[130px] flex-1';

  const ProductCard = ({ p }: { p: Product }) => {
    const map = mapList.find((m: MapRow) => m.id === p.mapId);
    const shop = shopList.find((s) => s.id === p.shopIdRef);
    const cur = curP(p);
    const dirty = pc[p.id] !== undefined && pc[p.id] !== p.stock;
    return (
      <div className={`flex h-full flex-col rounded-lg border bg-[#191919]/95 p-3 transition ${dirty ? 'border-warn/60' : 'border-[#303030]'}`}>
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
            <CountRow orig={p.stock} cur={cur} saving={saving.has(p.id)} onChange={(n) => setPc((c) => ({ ...c, [p.id]: n }))} onSave={() => saveOne(p)} />
          )}
        </div>
      </div>
    );
  };

  const GhostCard = ({ g }: { g: Ghost }) => {
    const dirty = gc[g.id] !== undefined && gc[g.id] !== g.stock;
    return (
      <div className={`flex h-full flex-col rounded-lg border bg-[#191919]/95 p-3 ${dirty ? 'border-warn/60' : 'border-orange/30'}`}>
        <div className="flex gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-s3 text-3xl sm:h-16 sm:w-16">👻</div>
          <div className="min-w-0 flex-1">
            <div className="break-words font-bold text-orange">{g.name}</div>
            <div className="mt-1"><Chip>Non-sale Component</Chip>{g.stock <= LOW && <span className="ml-1.5"><Chip tone="low">⚠️ ต่ำ</Chip></span>}</div>
          </div>
        </div>
        <div className="mt-auto pt-2">
          <CountRow orig={g.stock} cur={curG(g)} saving={saving.has(g.id)} onChange={(n) => setGc((c) => ({ ...c, [g.id]: n }))} onSave={() => saveOneGhost(g)} />
        </div>
      </div>
    );
  };

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
            <button className="btn btn-g btn-sm" onClick={resetAll} disabled={!dirtyCount}>↩️ รีเซ็ต</button>
            {stats.changed > 0 && <button className="btn btn-p btn-sm" disabled={saving.has('__all__')} onClick={saveAll}>{saving.has('__all__') ? '⏳ กำลังบันทึก…' : `💾 บันทึกทั้งหมด (${stats.changed})`}</button>}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input className="inp min-w-[200px] flex-[2]" placeholder="🔍 ค้นหาสินค้า…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={sel} aria-label="แมพ" value={mapF} onChange={(e) => setMapF(e.target.value)}>
          <option value="">🌐 ทุกแมพ</option>{mapList.map((m) => <option key={m.id} value={m.id}>{m.icon} {m.name}</option>)}
        </select>
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

      {loading ? <Spinner /> : error ? <ErrorBox error={error} /> : !pList.length && !gList.length ? <Empty icon="🎁" text="ไม่พบสินค้า" /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pList.length > 0 && gList.length > 0 && <div className="col-span-full pt-1 text-xs font-bold uppercase tracking-[0.1em] text-mute">📦 สินค้า ({pList.length})</div>}
          {pList.map((p) => <ProductCard key={p.id} p={p} />)}
          {gList.length > 0 && <div className="col-span-full pt-3 text-xs font-bold uppercase tracking-[0.1em] text-orange">👻 Non-sale Components ({gList.length})</div>}
          {gList.map((g) => <GhostCard key={g.id} g={g} />)}
        </div>
      )}
    </div>
  );
}
