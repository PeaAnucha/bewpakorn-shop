import { calcBundle, ghostNameOf, isGhostItem } from '../lib/bundle';
import { fmtDateTime, fmtNum } from '../lib/format';
import type { Ghost, MapRow, Product, ShopIdRow } from '../lib/types';
import { Chip, Modal, Thumb } from './ui';

export default function ProductDetail({ product, maps, shops, products, ghosts, canEdit, canDelete, onEdit, onDelete, onClose }: {
  product: Product; maps: MapRow[]; shops: ShopIdRow[]; products: Product[]; ghosts: Ghost[];
  canEdit: boolean; canDelete: boolean; onEdit: () => void; onDelete: () => void; onClose: () => void;
}) {
  const map = maps.find((m) => m.id === product.mapId);
  const shop = shops.find((s) => s.id === product.shopIdRef);
  const low = product.stock <= 5;
  const calc = product.isBundle ? calcBundle(product.bundleItems, products, ghosts) : null;

  return (
    <Modal wide title={product.name} onClose={onClose}
      footer={<>
        <button className="btn btn-g" onClick={onClose}>ปิด</button>
        {canEdit && <button className="btn btn-g" onClick={onEdit}>✏️ แก้ไขสินค้า</button>}
        {canDelete && <button className="btn bg-danger/15 text-danger hover:bg-danger/25" onClick={onDelete}>🗑️ ลบ</button>}
      </>}>
      <div className="mb-4 flex gap-4">
        <Thumb src={product.thumbnail} className="h-24 w-24" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-head text-lg font-bold">
            {product.name}
            {product.isBundle && <Chip tone="shop">📦 Bundle</Chip>}
            <Chip tone={product.status === 'active' ? 'ok' : 'off'}>{product.status === 'active' ? 'ใช้งาน' : 'ปิด'}</Chip>
          </div>
          <p className={`mt-1 text-sm ${product.description ? 'text-mute' : 'italic text-faint'}`}>{product.description || 'ไม่มีคำอธิบาย'}</p>
          <div className="mt-1 text-xs text-faint">ID: {product.id}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['สต็อก', <span className={low ? 'text-danger' : 'text-green'}>{fmtNum(product.stock)} ชิ้น{low ? ' ⚠️' : ''}</span>],
          ['แมพ', map ? `${map.icon ?? ''} ${map.name}` : '—'],
          ['Shop ID', <span className="font-mono text-accent">{shop?.shopId ?? '—'}</span>],
          ['ประเภท', product.isBundle ? '📦 Bundle' : '📌 เดี่ยว'],
        ].map(([k, v], i) => (
          <div key={i} className="rounded-lg bg-s2 p-3"><div className="text-xs text-faint">{k}</div><div className="mt-0.5 text-sm font-bold">{v}</div></div>
        ))}
      </div>
      {product.isBundle && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-mute">📦 Bundle Items</div>
          {!product.bundleItems.length ? <div className="text-sm text-faint">ไม่มีสินค้าย่อยในชุดนี้</div> : product.bundleItems.map((bi, i) => {
            const ghost = isGhostItem(bi);
            const sub = ghost ? null : products.find((p) => p.id === bi.productId);
            const gname = ghost ? ghostNameOf(bi) : '';
            const gstock = ghost ? ghosts.find((g) => g.name.trim().toLowerCase() === gname.toLowerCase())?.stock : undefined;
            const stock = ghost ? gstock : sub?.stock;
            return (
              <div key={i} className="mb-1.5 flex items-center gap-3 rounded-lg bg-s2 px-3 py-2 text-sm">
                <span className="w-10 font-bold text-accent">×{bi.ratio || 1}</span>
                <span className={`flex-1 ${ghost ? 'text-orange' : ''}`}>
                  {ghost ? `👻 ${gname}` : sub ? sub.name : <i className="text-faint">(ไม่พบ ID: {bi.productId})</i>}
                </span>
                {stock !== undefined && <span className={stock <= 5 ? 'text-danger' : 'text-faint'}>📦 {fmtNum(stock)} ชิ้น</span>}
              </div>
            );
          })}
          {calc && <div className="mt-2 text-sm text-mute">ทำเซ็ตได้สูงสุด <b className="text-accent">{fmtNum(calc.computed)}</b> ชุด</div>}
        </div>
      )}
      <div className="mt-4 text-xs text-faint">อัปเดตล่าสุด: {fmtDateTime(product.updatedAt)}</div>
    </Modal>
  );
}
