import { useMemo, useState } from 'react';
import { calcBundle, ghostNameOf, isGhostItem } from '../lib/bundle';
import { errMsg, saveProduct, useRefreshData } from '../lib/data';
import { fmtNum } from '../lib/format';
import { GHOST_PREFIX, type BundleItem, type Ghost, type MapRow, type Product, type ShopIdRow } from '../lib/types';
import { Field, Modal, Thumb, useToast } from './ui';

interface Row { key: number; kind: 'product' | 'ghost'; productId: string; ghostName: string; ghostStock: number; ratio: number }
const norm = (s: string) => s.trim().toLowerCase();
let keySeq = 1000;

export default function ProductForm({ product, defaultMapId, maps, shops, products, ghosts, onClose }: {
  product: Product | null; defaultMapId: string; maps: MapRow[]; shops: ShopIdRow[]; products: Product[]; ghosts: Ghost[]; onClose: () => void;
}) {
  const toast = useToast();
  const refresh = useRefreshData();
  const ghostStockOf = (name: string, fallback = 0) => ghosts.find((g) => norm(g.name) === norm(name))?.stock ?? fallback;

  const toRows = (items: BundleItem[]): Row[] =>
    items.map((bi) =>
      isGhostItem(bi)
        ? { key: ++keySeq, kind: 'ghost', productId: '', ghostName: ghostNameOf(bi), ghostStock: ghostStockOf(ghostNameOf(bi), bi.ghostStock ?? 0), ratio: bi.ratio || 1 }
        : { key: ++keySeq, kind: 'product', productId: bi.productId, ghostName: '', ghostStock: 0, ratio: bi.ratio || 1 },
    );

  const [name, setName] = useState(product?.name ?? '');
  const [mapId, setMapId] = useState(product?.mapId ?? (defaultMapId !== 'all' ? defaultMapId : ''));
  const [shopIdRef, setShopIdRef] = useState(product?.shopIdRef ?? '');
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [description, setDescription] = useState(product?.description ?? '');
  const [status, setStatus] = useState(product?.status ?? 'active');
  const [thumb, setThumb] = useState(product?.thumbnail ?? '');
  const [sortOrder, setSortOrder] = useState(product?.sortOrder != null ? String(product.sortOrder) : '');
  const [isBundle, setIsBundle] = useState(product?.isBundle ?? false);
  const [rows, setRows] = useState<Row[]>(() => toRows(product?.bundleItems ?? []));
  const [busy, setBusy] = useState(false);

  const components = useMemo(
    () => products.filter((p) => !p.isBundle && p.id !== product?.id).sort((a, b) => a.name.localeCompare(b.name, 'th')),
    [products, product],
  );
  const mapName = (id: string | null) => maps.find((m) => m.id === id)?.name ?? '';

  const items: BundleItem[] = rows.map((r) =>
    r.kind === 'ghost'
      ? { productId: GHOST_PREFIX + r.ghostName.trim(), ratio: r.ratio, ghostName: r.ghostName.trim(), ghostStock: r.ghostStock }
      : { productId: r.productId, ratio: r.ratio },
  );
  const calc = useMemo(() => calcBundle(items, products, ghosts), [items, products, ghosts]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameSuggestions = useMemo(
    () => [...new Set(products.filter((p) => !mapId || p.mapId === mapId).map((p) => p.name))].sort((a, b) => a.localeCompare(b, 'th')),
    [products, mapId],
  );

  // เพิ่มสินค้าใหม่: ถ้าพิมพ์ชื่อตรงกับสินค้าที่มีอยู่ (ในแมพเดียวกัน) จะเติมรายละเอียด/รูป/ชุดให้
  function onNameChange(v: string) {
    setName(v);
    if (product) return;
    const hit = products.find((p) => norm(p.name) === norm(v) && (!mapId || p.mapId === mapId));
    if (!hit) return;
    if (!description) setDescription(hit.description ?? '');
    if (!thumb) setThumb(hit.thumbnail ?? '');
    if (hit.isBundle && !rows.length) { setIsBundle(true); setRows(toRows(hit.bundleItems)); }
  }

  const patchRow = (key: number, p: Partial<Row>) => setRows((l) => l.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const addRow = (kind: Row['kind']) => setRows((l) => [...l, { key: ++keySeq, kind, productId: '', ghostName: '', ghostStock: 0, ratio: 1 }]);

  async function submit() {
    if (!name.trim()) { toast('กรุณากรอกชื่อสินค้า', 'error'); return; }
    const valid = items.filter((it) => (isGhostItem(it) ? ghostNameOf(it) !== '' : it.productId !== ''));
    if (isBundle && !valid.length) { toast('เซ็ตสินค้าต้องมีส่วนประกอบอย่างน้อย 1 รายการ', 'error'); return; }
    const sort = sortOrder.trim() === '' ? null : parseInt(sortOrder, 10);
    if (sort !== null && Number.isNaN(sort)) { toast('ลำดับต้องเป็นตัวเลข', 'error'); return; }
    setBusy(true);
    try {
      await saveProduct(product?.id ?? null, {
        name: name.trim(), mapId, shopIdRef, stock: Math.max(0, parseInt(stock, 10) || 0), description: description.trim(), status,
        thumbnail: thumb.trim(), isBundle, bundleItems: isBundle ? valid : [], sortOrder: sort,
      });
      await refresh();
      toast('บันทึกสำเร็จ ✅');
      onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal wide title={product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'} onClose={onClose}
      footer={<><button className="btn btn-g" onClick={onClose}>ยกเลิก</button><button className="btn btn-p" disabled={busy} onClick={submit}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></>}>
      <Field label="ชื่อสินค้า *">
        <input className="inp" list="prod-name-suggest" value={name} onChange={(e) => onNameChange(e.target.value)} autoFocus />
        <datalist id="prod-name-suggest">{nameSuggestions.map((n) => <option key={n} value={n} />)}</datalist>
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="แมพ">
          <select className="inp" value={mapId} onChange={(e) => setMapId(e.target.value)}>
            <option value="">— ไม่ระบุแมพ —</option>
            {maps.map((m) => <option key={m.id} value={m.id}>{m.icon} {m.name}</option>)}
          </select>
        </Field>
        <Field label="Shop ID">
          <select className="inp" value={shopIdRef} onChange={(e) => setShopIdRef(e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.shopId}{mapName(s.mapId) ? ` (${mapName(s.mapId)})` : ''}</option>)}
          </select>
        </Field>
        <Field label={isBundle ? 'สต็อก (คำนวณอัตโนมัติ)' : 'สต็อก'}>
          <input className="inp" type="number" min={0} value={isBundle ? calc.computed : stock} readOnly={isBundle} onChange={(e) => setStock(e.target.value)} />
        </Field>
        <Field label="สถานะ">
          <select className="inp" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">✅ ใช้งาน</option><option value="inactive">🔴 ปิด</option>
          </select>
        </Field>
        <Field label="ลำดับการแสดง" hint="เลขน้อยขึ้นก่อน เว้นว่าง = ไม่กำหนด"><input className="inp" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></Field>
        <Field label="รูปสินค้า (URL)">
          <div className="flex items-center gap-2">
            <input className="inp" value={thumb} onChange={(e) => setThumb(e.target.value)} placeholder="https://…" />
            {thumb && <button type="button" className="btn btn-g" onClick={() => setThumb('')}>ล้าง</button>}
          </div>
        </Field>
      </div>
      {thumb && <div className="mb-3.5"><Thumb src={thumb} className="h-20 w-20" /></div>}
      <Field label="รายละเอียด"><textarea className="inp min-h-[70px]" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>

      <label className="mb-3 flex cursor-pointer items-center gap-2 font-semibold">
        <input type="checkbox" checked={isBundle} onChange={(e) => { setIsBundle(e.target.checked); if (e.target.checked && !rows.length) addRow('product'); }} />
        📦 เป็นเซ็ตสินค้า (Bundle)
      </label>

      {isBundle && (
        <div className="rounded-xl border border-line bg-s2/50 p-3">
          {rows.map((r) => (
            <div key={r.key} className="mb-2 flex items-start gap-2 rounded-lg border border-line bg-s3 p-2.5">
              <div className="min-w-0 flex-1">
                {r.kind === 'product' ? (
                  <>
                    <div className="mb-1 text-[0.65rem] font-bold uppercase tracking-wider text-accent">📌 สินค้าในระบบ</div>
                    <select className="inp !py-1.5" value={r.productId} onChange={(e) => patchRow(r.key, { productId: e.target.value })}>
                      <option value="">— เลือกสินค้า —</option>
                      {components.map((p) => <option key={p.id} value={p.id}>{p.name}{mapName(p.mapId) ? ` (${mapName(p.mapId)})` : ''} — {fmtNum(p.stock)}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <div className="mb-1 text-[0.65rem] font-bold uppercase tracking-wider text-orange">👻 Non-sale Component</div>
                    <input className="inp !border-dashed !py-1.5" list="ghost-names" placeholder="ชื่อส่วนประกอบ เช่น กล่อง, ซอง…" value={r.ghostName}
                      onChange={(e) => {
                        const g = ghosts.find((x) => norm(x.name) === norm(e.target.value));
                        patchRow(r.key, g ? { ghostName: e.target.value, ghostStock: g.stock } : { ghostName: e.target.value });
                      }} />
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-orange">
                      📦 สต็อกปัจจุบัน:
                      <input className="inp !w-24 !border-dashed !py-1 text-center" type="number" min={0} value={r.ghostStock}
                        onChange={(e) => patchRow(r.key, { ghostStock: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                    </div>
                  </>
                )}
              </div>
              <div className="w-20 shrink-0 text-center">
                <div className="mb-1 whitespace-nowrap text-[0.62rem] font-bold text-faint">จำนวน/ชุด</div>
                <input className="inp !px-2 !py-1.5 text-center" type="number" min={1} value={r.ratio} onChange={(e) => patchRow(r.key, { ratio: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
              </div>
              <button type="button" className="btn mt-5 !px-2 !py-1 bg-danger/15 text-danger hover:bg-danger/25" onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))} title="ลบ">✕</button>
            </div>
          ))}
          <datalist id="ghost-names">{ghosts.map((g) => <option key={g.id} value={g.name} />)}</datalist>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-g text-xs" onClick={() => addRow('product')}>➕ เพิ่มสินค้า</button>
            <button type="button" className="btn btn-g text-xs" onClick={() => addRow('ghost')}>👻 เพิ่ม Non-sale Component</button>
          </div>
          <div className="mt-3 text-sm">สต็อกเซ็ตที่ทำได้: <b className="font-head text-lg text-accent">{fmtNum(calc.computed)}</b></div>
          {calc.breakdown.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-lg border border-line text-sm">
              <div className="flex gap-2 bg-s3 px-3 py-1.5 text-[0.69rem] font-bold uppercase tracking-wider text-faint">
                <span className="flex-1">ส่วนประกอบ</span><span className="w-12 text-center">ต่อชุด</span><span className="w-14 text-center">คงเหลือ</span><span className="w-16 text-center">ได้สูงสุด</span>
              </div>
              {calc.breakdown.map((b, i) => (
                <div key={i} className="flex items-center gap-2 border-t border-line px-3 py-1.5">
                  <span className={`flex-1 font-semibold ${b.ghost ? 'text-orange' : ''}`}>{b.ghost ? '👻 ' : ''}{b.name}</span>
                  <span className="w-12 text-center text-mute">×{b.ratio}</span>
                  <span className={`w-14 text-center ${b.stock <= 5 ? 'text-danger' : ''}`}>{fmtNum(b.stock)}</span>
                  <span className={`w-16 text-center font-bold ${b.possible === calc.computed ? 'text-danger' : 'text-accent'}`}>{fmtNum(b.possible)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
