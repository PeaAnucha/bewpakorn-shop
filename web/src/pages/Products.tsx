import { useMemo, useState, type CSSProperties } from 'react';
import { useAuth } from '../auth/AuthProvider';
import BulkProducts from '../components/BulkProducts';
import ProductDetail from '../components/ProductDetail';
import ProductForm from '../components/ProductForm';
import ProductSortList from '../components/ProductSortList';
import { Chip, Empty, ErrorBox, MapChips, Menu, Spinner, Thumb, useToast } from '../components/ui';
import { deleteProducts, errMsg, saveProduct, useGhosts, useMaps, useProducts, useRefreshData, useShopIdMapBans, useShopIdsOrdered } from '../lib/data';
import { downloadCsv, fmtNum, today } from '../lib/format';
import { emptyShopIds, filterSortProducts, type SortKey, type TypeTab } from '../lib/products';
import type { Product } from '../lib/types';

const PAGE = 100;

function ProductThumb({ product }: { product: Product }) {
  const depleted = product.stock <= 0;
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg">
      <Thumb src={product.thumbnail} className={`h-full w-full ${depleted ? 'grayscale opacity-60' : ''}`} />
      {depleted && <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20"><span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-red-400 bg-black/65 text-xl font-black leading-none text-red-300">×</span></span>}
    </div>
  );
}

function ProductQuickEdit({ product, onClose }: { product: Product; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshData();
  const [stock, setStock] = useState(String(product.stock));
  const [thumbnail, setThumbnail] = useState(product.thumbnail ?? '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await saveProduct(product.id, {
        name: product.name, mapId: product.mapId ?? '', shopIdRef: product.shopIdRef ?? '',
        stock: product.isBundle ? product.stock : Math.max(0, parseInt(stock, 10) || 0),
        description: product.description ?? '', status: product.status, thumbnail: thumbnail.trim(),
        isBundle: product.isBundle, bundleItems: product.bundleItems ?? [], sortOrder: product.sortOrder,
      });
      await refresh();
      toast('บันทึกสต็อกและรูปสินค้าแล้ว ✅');
      onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="border-t border-line bg-s2/70 px-4 py-3" onClick={(e) => e.stopPropagation()}>
      <div className="grid gap-3 sm:grid-cols-[minmax(120px,180px)_minmax(220px,1fr)_auto] sm:items-end">
        <label className="text-xs font-semibold text-mute">จำนวนสต็อก{product.isBundle && <span className="ml-1 text-faint">(คำนวณอัตโนมัติ)</span>}
          <input className="inp mt-1" type="number" min={0} value={stock} disabled={product.isBundle || busy} onChange={(e) => setStock(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-mute">URL รูปสินค้า
          <input className="inp mt-1" type="url" value={thumbnail} disabled={busy} onChange={(e) => setThumbnail(e.target.value)} placeholder="https://…" />
        </label>
        <div className="flex gap-2 sm:justify-end">
          <button type="button" className="btn btn-g btn-sm" disabled={busy} onClick={onClose}>ยกเลิก</button>
          <button type="button" className="btn btn-p btn-sm" disabled={busy} onClick={submit}>{busy ? 'กำลังบันทึก…' : '💾 บันทึกด่วน'}</button>
        </div>
      </div>
      {thumbnail && <div className="mt-2 flex items-center gap-2 text-xs text-mute"><Thumb src={thumbnail} className="h-10 w-10" />ตัวอย่างรูป</div>}
    </div>
  );
}

export default function ProductsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const refresh = useRefreshData();
  const maps = useMaps();
  const shops = useShopIdsOrdered();
  const products = useProducts();
  const shopIdMapBans = useShopIdMapBans(can('products', 'view'));
  const ghosts = useGhosts();

  const [selMap, setSelMap] = useState('all');
  const [selShopId, setSelShopId] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState<TypeTab>('all');
  const [sort, setSort] = useState<SortKey>('stock-desc');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [sortMode, setSortMode] = useState(false);
  const [form, setForm] = useState<{ product: Product | null } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);

  const mapList = maps.data ?? [];
  const shopList = shops.data ?? [];
  const all = products.data ?? [];
  const bannedPairs = new Set((shopIdMapBans.data ?? []).map((ban) => `${ban.shopIdId}\u0000${ban.mapId}`));

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    all.forEach((p) => { if (p.mapId) c[p.mapId] = (c[p.mapId] ?? 0) + 1; });
    return c;
  }, [all]);
  const accountCounts = useMemo(() => {
    const counts = new Map<string, number>();
    all.forEach((p) => {
      if (p.mapId === selMap) {
        const accountId = p.shopIdRef ?? '';
        counts.set(accountId, (counts.get(accountId) ?? 0) + 1);
      }
    });
    return counts;
  }, [all, selMap]);
  const list = useMemo(() => {
    const filtered = filterSortProducts(all, mapList, shopList, { q, status, type, mapId: selMap, sort });
    if (selShopId === '__unassigned__') return filtered.filter((p) => !p.shopIdRef);
    return selShopId ? filtered.filter((p) => p.shopIdRef === selShopId) : filtered;
  }, [all, mapList, shopList, q, status, type, selMap, sort, selShopId]);
  // โหมดจัดเรียง: เฉพาะสินค้าทั้งหมดของแมพที่เลือก (ไม่กรอง) เรียงตามลำดับปัจจุบัน
  const sortList = useMemo(
    () => (sortMode && selMap !== 'all' ? filterSortProducts(all, mapList, shopList, { q: '', status: '', type: 'all', mapId: selMap, sort: 'custom' }) : []),
    [sortMode, all, mapList, shopList, selMap],
  );
  const sortAccountList = selShopId === '__unassigned__'
    ? sortList.filter((p) => !p.shopIdRef)
    : selShopId ? sortList.filter((p) => p.shopIdRef === selShopId) : sortList;
  const flags = useMemo(() => emptyShopIds(shopList, all, selMap), [shopList, all, selMap]);
  const selectedMap = mapList.find((m) => m.id === selMap);
  const detail = detailId ? all.find((p) => p.id === detailId) ?? null : null;

  const canEdit = can('products', 'edit');
  const canDel = can('products', 'delete');
  const visible = list.slice(0, shown);
  const allPicked = list.length > 0 && list.every((p) => picked.has(p.id));

  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const resetView = () => { setShown(PAGE); setPicked(new Set()); };

  function toggleSortMode() {
    if (sortMode) { setSortMode(false); return; }
    setQ(''); setStatus(''); setType('all'); setSort('custom'); setPicked(new Set()); setSortMode(true);
  }

  async function copyProductName(name: string) {
    try { await navigator.clipboard.writeText(name.trim()); toast('คัดลอกชื่อสินค้าแล้ว ✅'); }
    catch { toast('คัดลอกไม่ได้ กรุณาเลือกชื่อแล้วคัดลอกเอง', 'error'); }
  }

  async function remove(ids: string[]) {
    const label = ids.length === 1 ? `"${all.find((p) => p.id === ids[0])?.name}"` : `${ids.length} รายการ`;
    if (!ids.length || !confirm(`ลบสินค้า ${label}?`)) return;
    try { await deleteProducts(ids); setPicked(new Set()); setDetailId(null); await refresh(); toast('ลบสำเร็จ'); } catch (e) { toast(errMsg(e), 'error'); }
  }

  function exportCsv() {
    const mapName = (id: string | null) => mapList.find((m) => m.id === id)?.name ?? '';
    downloadCsv(`products_${today()}.csv`, ['ชื่อสินค้า', 'แมพ', 'Shop ID', 'สต็อก', 'สถานะ', 'รายละเอียด', 'ประเภท'],
      all.map((p) => [p.name, mapName(p.mapId), shopList.find((s) => s.id === p.shopIdRef)?.shopId ?? '', p.stock,
        p.status === 'active' ? 'ใช้งาน' : 'ปิด', p.description ?? '', p.isBundle ? 'บันเดิล' : 'เดี่ยว']));
  }

  const loading = maps.isLoading || shops.isLoading || products.isLoading || shopIdMapBans.isLoading;
  const error = maps.error || shops.error || products.error || shopIdMapBans.error;

  const countText = loading ? '…' : `${fmtNum(sortMode ? sortList.length : list.length)} รายการ`;

  return (
    <div>
      {/* หัวหน้า: ชื่อ + จำนวน และปุ่มหลักเพียงไม่กี่ปุ่ม (ที่เหลืออยู่ในเมนู ⋯) */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-head text-2xl font-bold tracking-tight">📦 สินค้า</h1>
          <p className="text-sm text-mute">{countText}{selectedMap && ` · ${selectedMap.icon ?? ''} ${selectedMap.name}`}</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              className={`btn btn-sm ${sortMode ? 'btn-p' : 'btn-g'}`}
              disabled={!sortMode && selMap === 'all'}
              title={!sortMode && selMap === 'all' ? 'เลือกแมพก่อน จึงจะจัดเรียงสินค้าได้' : undefined}
              onClick={toggleSortMode}
            >
              {sortMode ? '✅ เสร็จสิ้นการจัดเรียง' : '↕️ จัดเรียงสินค้า'}
            </button>
          )}
          {!sortMode && can('products', 'add') && <button className="btn btn-p btn-sm" onClick={() => setForm({ product: null })}>+ เพิ่มสินค้า</button>}
          {!sortMode && (
            <Menu items={[
              { key: 'csv', label: '📥 ส่งออก CSV', hidden: !can('products', 'export'), onClick: exportCsv },
              { key: 'bulk', label: '➕ เพิ่มหลายรายการ', hidden: !can('products', 'add'), onClick: () => setBulk(true) },
            ]} />
          )}
        </div>
      </div>

      <div className="mb-4">
        <MapChips maps={mapList} counts={counts} total={all.length} selected={selMap} onSelect={(id) => { setSelMap(id); setSelShopId(''); resetView(); if (id === 'all') setSortMode(false); }} />
      </div>

      {selMap !== 'all' && (
        <div className="mb-4 flex flex-wrap gap-2" aria-label="กรองสินค้าตามไอดีบัญชี">
          <button type="button" onClick={() => { setSelShopId(''); resetView(); }} className={`cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition duration-200 ${!selShopId ? 'bg-accent text-black' : 'bg-teal-400/10 text-teal-200 ring-1 ring-teal-300/20 hover:bg-teal-400/20'}`}>
            🔑 ทุกไอดี<span className={`ml-1 text-xs ${!selShopId ? 'opacity-70' : 'text-mute'}`}>{fmtNum([...accountCounts.values()].reduce((sum, n) => sum + n, 0))}</span>
          </button>
          {shopList.filter((shop) => accountCounts.has(shop.id)).map((shop) => (
            <button key={shop.id} type="button" onClick={() => { setSelShopId(shop.id); resetView(); }} className={`cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition duration-200 ${selShopId === shop.id ? 'bg-accent text-black' : 'bg-teal-400/10 text-teal-200 ring-1 ring-teal-300/20 hover:bg-teal-400/20'}`}>
              🔑 {shop.shopId}<span className={`ml-1 text-xs ${selShopId === shop.id ? 'opacity-70' : 'text-mute'}`}>{fmtNum(accountCounts.get(shop.id) ?? 0)}</span>
            </button>
          ))}
          {(accountCounts.get('') ?? 0) > 0 && <button type="button" onClick={() => { setSelShopId('__unassigned__'); resetView(); }} className={`cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition duration-200 ${selShopId === '__unassigned__' ? 'bg-accent text-black' : 'bg-teal-400/10 text-teal-200 ring-1 ring-teal-300/20 hover:bg-teal-400/20'}`}>🔑 ไม่ระบุไอดี<span className={`ml-1 text-xs ${selShopId === '__unassigned__' ? 'opacity-70' : 'text-mute'}`}>{fmtNum(accountCounts.get('') ?? 0)}</span></button>}
        </div>
      )}

      {sortMode ? (
        <>
          <div className="mb-3 rounded-lg bg-s2 px-4 py-2.5 text-xs text-mute">
            ↕️ ลากรายการ (หรือกดค้างบนมือถือ) เพื่อจัดลำดับ · ปุ่ม ⤒ ⤓ ย้ายไปบนสุด/ล่างสุด · บันทึกอัตโนมัติ · จัดเรียงเฉพาะไอดีที่เลือก โดยตำแหน่งไอดีอื่นในแมพคงเดิม
          </div>
          {loading ? <Spinner /> : error ? <ErrorBox error={error} /> : !sortAccountList.length ? <Empty icon="🎁" text="ไอดีนี้ยังไม่มีสินค้าในแมพนี้" /> : <ProductSortList products={sortAccountList} orderContext={sortList} shops={shopList} />}
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <input className="inp min-w-[220px] flex-1" placeholder="🔍 ค้นหาสินค้า… (ชื่อสินค้า, ชื่อแมพ, ไอดีร้าน)" value={q} onChange={(e) => { setQ(e.target.value); resetView(); }} />
            <select className="sel" aria-label="สถานะ" value={status} onChange={(e) => { setStatus(e.target.value); resetView(); }}>
              <option value="">ทุกสถานะ</option><option value="active">ใช้งาน</option><option value="inactive">ปิด</option>
            </select>
            <select className="sel" aria-label="ประเภท" value={type} onChange={(e) => { setType(e.target.value as TypeTab); resetView(); }}>
              <option value="all">ทุกประเภท</option><option value="normal">📌 ปกติ</option><option value="bundle">📦 เซ็ต (Bundle)</option>
            </select>
            <select className="sel" aria-label="เรียงลำดับ" value={sort} onChange={(e) => { setSort(e.target.value as SortKey); resetView(); }}>
              <option value="custom">เรียงตามลำดับ</option><option value="name">ชื่อ A→Z</option><option value="stock-asc">สต็อกน้อย→มาก</option>
              <option value="stock-desc">สต็อกมาก→น้อย</option><option value="map">ตามแมพ</option>
            </select>
          </div>

          {(flags.empty.length > 0 || flags.outOfStock.length > 0) && (
            <details className="mb-3 rounded-lg bg-s2/60 px-4 py-2.5 text-sm">
              <summary className="cursor-pointer text-mute">
                ⚠️ ไอดีที่ควรตรวจสอบ{selectedMap ? ` ใน ${selectedMap.name}` : ''}:{' '}
                {flags.empty.length > 0 && <>ไม่มีสินค้า <b className="text-danger">{flags.empty.length}</b></>}
                {flags.empty.length > 0 && flags.outOfStock.length > 0 && ' · '}
                {flags.outOfStock.length > 0 && <>สต็อกหมดทั้งหมด <b className="text-warn">{flags.outOfStock.length}</b></>}
              </summary>
              <div className="mt-3 space-y-2 text-xs">
                {flags.empty.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="text-mute">ไม่มีสินค้า:</span>{flags.empty.map((s) => <Chip key={s.id} tone="off">🔑 {s.shopId}</Chip>)}</div>}
                {flags.outOfStock.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="text-mute">สต็อกหมดทั้งหมด:</span>{flags.outOfStock.map((s) => <Chip key={s.id} tone="low">🔑 {s.shopId}</Chip>)}</div>}
              </div>
            </details>
          )}

          {picked.size > 0 && canDel && (
            <div className="sticky top-2 z-10 mb-2 flex items-center gap-3 rounded-lg bg-s3 px-4 py-2 text-sm shadow-lg shadow-black/40">
              <span className="font-semibold">เลือก {picked.size} รายการ</span>
              <button className="btn btn-sm bg-danger text-white" onClick={() => remove([...picked])}>🗑️ ลบ</button>
              <button className="btn btn-g btn-sm" onClick={() => setPicked(new Set())}>ยกเลิก</button>
            </div>
          )}

          {loading ? <Spinner /> : error ? <ErrorBox error={error} /> : !list.length ? <Empty icon="🎁" text="ไม่พบสินค้า" /> : (
            <>
              <div className="space-y-2">
                {canDel && (
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-[#242424]/90 px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-mute">
                    <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((p) => p.id)))} />
                    เลือกทั้งหมด
                  </label>
                )}
                {visible.map((p, index) => {
                  const map = mapList.find((m) => m.id === p.mapId);
                  const shop = shopList.find((s) => s.id === p.shopIdRef);
                  const particleStyle = index < 12 ? { '--particle-delay': `${index * 45}ms` } as CSSProperties : undefined;
                  return (
                    <div key={p.id} style={particleStyle} className={`product-card ${index < 12 ? 'product-card-assemble' : ''} overflow-hidden rounded-lg border border-lime-300/20 shadow-sm shadow-black/20 backdrop-blur-lg transition-[scale,border-color,box-shadow] hover:scale-[1.015] hover:border-lime-300/45`}>
                    <div onClick={() => setDetailId(p.id)}
                      className={`group flex cursor-pointer items-center gap-3 px-3 py-2.5 transition duration-200 hover:bg-white/[0.04] ${p.status === 'active' ? '' : 'opacity-60'}`}>
                      {canDel && <input type="checkbox" checked={picked.has(p.id)} onClick={(e) => e.stopPropagation()} onChange={() => togglePick(p.id)} />}
                      <ProductThumb product={p} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2">
                          <strong className="break-words font-semibold">{p.name}</strong>
                          <button type="button" className="icon-btn !h-7 !w-7" title="คัดลอกชื่อสินค้า" aria-label={`คัดลอกชื่อ ${p.name}`} onClick={(e) => { e.stopPropagation(); void copyProductName(p.name); }}>📋</button>
                          {p.isBundle && <span className="text-xs font-bold text-accent">📦 เซ็ต</span>}
                          {p.status !== 'active' && <span className="text-xs font-bold text-danger">ปิดใช้งาน</span>}
                          {p.shopIdRef && p.mapId && bannedPairs.has(`${p.shopIdRef}\u0000${p.mapId}`) && <Chip tone="low">🚫 โดนแบน{map ? ` · ${map.name}` : ''}</Chip>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-mute">
                          {shop && <Chip tone="id" className="text-sm">🔑 {shop.shopId}</Chip>}
                          {selMap === 'all' && map && <Chip tone="map" className="text-sm">{map.icon} {map.name}</Chip>}
                        </div>
                      </div>
                      <div className="min-w-[76px] shrink-0 rounded-lg border border-white/10 bg-s2/90 px-2.5 py-2 text-center">
                        <div className={`font-head text-xl font-extrabold leading-none tabular-nums sm:text-2xl ${p.stock <= 0 ? 'text-danger' : p.stock <= 5 ? 'text-warn' : 'text-white'}`}>{fmtNum(p.stock)}</div>
                        <div className="mt-1 text-xs font-bold tracking-wide text-slate-200">ชิ้น</div>
                      </div>
                      {(canEdit || canDel) && (
                        <div className="flex shrink-0 gap-0.5 transition duration-200 md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
                          {canEdit && <button className="icon-btn" title="แก้สต็อก/รูปด่วน" aria-label={`แก้สต็อกและรูป ${p.name}`} aria-expanded={quickEditId === p.id} onClick={(e) => { e.stopPropagation(); setQuickEditId((id) => id === p.id ? null : p.id); }}>✏️</button>}
                          {canDel && <button className="icon-btn" title="ลบ" aria-label={`ลบ ${p.name}`} onClick={(e) => { e.stopPropagation(); remove([p.id]); }}>🗑️</button>}
                        </div>
                      )}
                    </div>
                    {quickEditId === p.id && canEdit && <ProductQuickEdit product={p} onClose={() => setQuickEditId(null)} />}
                    </div>
                  );
                })}
              </div>
              {list.length > shown && (
                <div className="mt-4 text-center">
                  <button className="btn btn-g btn-sm" onClick={() => setShown((n) => n + PAGE)}>แสดงเพิ่ม ({fmtNum(list.length - shown)} รายการที่เหลือ)</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {form && (
        <ProductForm key={form.product?.id ?? 'new'} product={form.product} defaultMapId={selMap} maps={mapList} shops={shopList}
          products={all} ghosts={ghosts.data ?? []} onClose={() => setForm(null)} />
      )}
      {detail && (
        <ProductDetail product={detail} maps={mapList} shops={shopList} products={all} ghosts={ghosts.data ?? []}
          canEdit={canEdit} canDelete={canDel} onClose={() => setDetailId(null)}
          onEdit={() => { setDetailId(null); setForm({ product: detail }); }} onDelete={() => remove([detail.id])} />
      )}
      {bulk && <BulkProducts maps={mapList} shops={shopList} defaultMapId={selMap} onClose={() => setBulk(false)} />}
    </div>
  );
}


