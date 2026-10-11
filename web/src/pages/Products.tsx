import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import BulkProducts from '../components/BulkProducts';
import ProductDetail from '../components/ProductDetail';
import ProductForm from '../components/ProductForm';
import ProductSortList from '../components/ProductSortList';
import { Chip, Empty, ErrorBox, MapChips, SortTabs, Spinner, Thumb, useToast } from '../components/ui';
import { deleteProducts, errMsg, useGhosts, useMaps, useProducts, useRefreshData, useShopIdsOrdered } from '../lib/data';
import { downloadCsv, fmtDateTime, fmtNum, today } from '../lib/format';
import { emptyShopIds, filterSortProducts, type SortKey, type TypeTab } from '../lib/products';
import type { Product } from '../lib/types';

const PAGE = 100;

export default function ProductsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const refresh = useRefreshData();
  const maps = useMaps();
  const shops = useShopIdsOrdered();
  const products = useProducts();
  const ghosts = useGhosts();

  const [selMap, setSelMap] = useState('all');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState<TypeTab>('all');
  const [sort, setSort] = useState<SortKey>('stock-desc');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [sortMode, setSortMode] = useState(false);
  const [form, setForm] = useState<{ product: Product | null } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);

  const mapList = maps.data ?? [];
  const shopList = shops.data ?? [];
  const all = products.data ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    all.forEach((p) => { if (p.mapId) c[p.mapId] = (c[p.mapId] ?? 0) + 1; });
    return c;
  }, [all]);
  const list = useMemo(
    () => filterSortProducts(all, mapList, shopList, { q, status, type, mapId: selMap, sort }),
    [all, mapList, shopList, q, status, type, selMap, sort],
  );
  // โหมดจัดเรียง: เฉพาะสินค้าทั้งหมดของแมพที่เลือก (ไม่กรอง) เรียงตามลำดับปัจจุบัน
  const sortList = useMemo(
    () => (sortMode && selMap !== 'all' ? filterSortProducts(all, mapList, shopList, { q: '', status: '', type: 'all', mapId: selMap, sort: 'custom' }) : []),
    [sortMode, all, mapList, shopList, selMap],
  );
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

  const loading = maps.isLoading || shops.isLoading || products.isLoading;
  const error = maps.error || shops.error || products.error;

  return (
    <div>
      <div className="mb-3 text-sm text-mute">
        <button className="text-accent hover:underline" onClick={() => { setSelMap('all'); setSortMode(false); }}>สินค้าทั้งหมด</button>
        {selectedMap && <> / {selectedMap.icon} {selectedMap.name}</>}
      </div>

      <div className="card mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-head text-base font-bold">🗺️ เลือกแมพ</h1>
          <div className="flex flex-wrap gap-2">
            {can('products', 'export') && <button className="btn btn-g" onClick={exportCsv}>📥 CSV</button>}
            {can('products', 'add') && <button className="btn btn-g" onClick={() => setBulk(true)}>➕ เพิ่มหลายรายการ</button>}
            {can('products', 'add') && <button className="btn btn-p" onClick={() => setForm({ product: null })}>+ เพิ่มสินค้า</button>}
          </div>
        </div>
        <MapChips maps={mapList} counts={counts} total={all.length} selected={selMap} onSelect={(id) => { setSelMap(id); resetView(); if (id === 'all') setSortMode(false); }} />
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-head text-base font-bold">{selectedMap ? `สินค้าใน ${selectedMap.icon ?? ''} ${selectedMap.name}` : 'สินค้าทั้งหมด'}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {!sortMode && picked.size > 0 && canDel && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-mute">{picked.size} รายการ</span>
                <button className="btn bg-danger/15 text-danger hover:bg-danger/25" onClick={() => remove([...picked])}>🗑️ ลบที่เลือก</button>
                <button className="btn btn-g" onClick={() => setPicked(new Set())}>✕ ยกเลิก</button>
              </div>
            )}
            {canEdit && (
              <button
                className={`btn text-xs text-white ${sortMode ? 'bg-danger' : 'bg-indigo-500'}`}
                disabled={!sortMode && selMap === 'all'}
                title={!sortMode && selMap === 'all' ? 'เลือกแมพก่อน จึงจะจัดเรียงสินค้าได้' : undefined}
                onClick={toggleSortMode}
              >
                {sortMode ? '✅ เสร็จสิ้นการจัดเรียง' : '↕️ จัดเรียงสินค้า'}
              </button>
            )}
          </div>
        </div>

        {sortMode ? (
          <div className="mb-3 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
            ↕️ ลากรายการ (หรือกดค้างบนมือถือ) เพื่อจัดลำดับ · ปุ่ม ⤒ ⤓ ย้ายไปบนสุด/ล่างสุด · บันทึกอัตโนมัติ · ลำดับ 1..{sortList.length} ใช้เฉพาะภายในแมพนี้ ({fmtNum(sortList.length)} รายการ รวมสินค้าที่ปิดอยู่)
          </div>
        ) : (
          <>
        <div className="mb-3 flex flex-wrap gap-2">
          <input className="inp min-w-[200px] flex-1" placeholder="🔍 ค้นหาสินค้า… (ชื่อสินค้า, ชื่อแมพ, ไอดีร้าน)" value={q} onChange={(e) => { setQ(e.target.value); resetView(); }} />
          <select className="inp !w-36" value={status} onChange={(e) => { setStatus(e.target.value); resetView(); }}>
            <option value="">ทุกสถานะ</option><option value="active">ใช้งาน</option><option value="inactive">ปิด</option>
          </select>
        </div>
        <SortTabs<TypeTab> tabs={[['all', '🔖 ทั้งหมด'], ['normal', '📌 ปกติ'], ['bundle', '📦 Bundle']]} value={type} onChange={(t) => { setType(t); resetView(); }} />
        <SortTabs<SortKey> tabs={[['custom', '🔢 เรียงตามลำดับ'], ['name', '🔤 ชื่อ A→Z'], ['stock-asc', '📦 สต็อกน้อย→มาก'], ['stock-desc', '📦 สต็อกมาก→น้อย'], ['map', '🗺️ แมพ']]} value={sort} onChange={(s) => { setSort(s); resetView(); }} />

        {(flags.empty.length > 0 || flags.outOfStock.length > 0) && (
          <div className="mb-3 space-y-2 text-xs">
            {flags.empty.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 p-2.5">
                <b className="text-danger">🚫 ไม่มีสินค้าเลย · {selectedMap?.name ?? 'ทุกแมพ'} ({flags.empty.length})</b>
                {flags.empty.map((s) => <Chip key={s.id} tone="off">🔑 {s.shopId}</Chip>)}
              </div>
            )}
            {flags.outOfStock.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-warn/30 bg-warn/10 p-2.5">
                <b className="text-warn">⚠️ สินค้าหมดสต็อกทั้งหมด · {selectedMap?.name ?? 'ทุกแมพ'} ({flags.outOfStock.length})</b>
                {flags.outOfStock.map((s) => <Chip key={s.id} tone="low">🔑 {s.shopId}</Chip>)}
              </div>
            )}
          </div>
        )}
          </>
        )}

        {sortMode ? (
          loading ? <Spinner /> : error ? <ErrorBox error={error} /> : !sortList.length ? <Empty icon="🎁" text="แมพนี้ยังไม่มีสินค้า" /> : <ProductSortList products={sortList} shops={shopList} />
        ) : loading ? <Spinner /> : error ? <ErrorBox error={error} /> : !list.length ? <Empty icon="🎁" text="ไม่พบสินค้า" /> : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm font-semibold">
                {canDel && <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((p) => p.id)))} />}
                {fmtNum(list.length)} รายการ
              </label>
            </div>
            <div className="space-y-2">
              {visible.map((p) => {
                const map = mapList.find((m) => m.id === p.mapId);
                const shop = shopList.find((s) => s.id === p.shopIdRef);
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-s2/60 p-3 sm:flex-nowrap">
                    {canDel && <input type="checkbox" checked={picked.has(p.id)} onChange={() => togglePick(p.id)} />}
                    <Thumb src={p.thumbnail} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <strong className="break-words">{p.name}</strong>
                        {p.isBundle && <Chip tone="shop">📦 Bundle</Chip>}
                        <span className={`rounded px-1.5 py-0.5 text-[0.7rem] font-bold ${p.sortOrder !== null ? 'bg-info/15 text-info' : 'bg-s3 text-faint'}`}>
                          {p.sortOrder !== null ? `🔢 ลำดับ ${p.sortOrder}` : 'ไม่มีลำดับ'}
                        </span>
                      </div>
                      {p.description && <div className="mt-0.5 text-xs text-mute">{p.description.slice(0, 80)}{p.description.length > 80 ? '…' : ''}</div>}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {shop && <Chip tone="shop">🔑 {shop.shopId}</Chip>}
                        <Chip tone={p.stock <= 0 ? 'low' : 'ok'}>📦 {fmtNum(p.stock)} ชิ้น</Chip>
                        {map && <Chip>{map.icon} {map.name}</Chip>}
                        <Chip tone={p.status === 'active' ? 'ok' : 'off'}>{p.status === 'active' ? '✅ ใช้งาน' : '🔴 ปิด'}</Chip>
                      </div>
                      <div className="mt-1 text-[0.7rem] text-faint">🕓 อัปเดตล่าสุด: {fmtDateTime(p.updatedAt)}</div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button className="btn btn-p text-xs" onClick={() => setDetailId(p.id)}>🔍 ดูรายละเอียด</button>
                      <div className="flex gap-1.5">
                        {canEdit && <button className="btn btn-g flex-1 text-xs" onClick={() => setForm({ product: p })}>✏️ แก้ไข</button>}
                        {canDel && <button className="btn bg-danger/15 text-xs text-danger hover:bg-danger/25" onClick={() => remove([p.id])}>🗑️</button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {list.length > shown && (
              <div className="mt-4 text-center">
                <button className="btn btn-g" onClick={() => setShown((n) => n + PAGE)}>แสดงเพิ่ม ({fmtNum(list.length - shown)} รายการที่เหลือ)</button>
              </div>
            )}
          </>
        )}
      </div>

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
