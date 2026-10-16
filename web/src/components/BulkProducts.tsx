import { useMemo, useState } from 'react';
import { addProducts, errMsg, useRefreshData, type BulkProductInput } from '../lib/data';
import type { MapRow, ShopIdRow } from '../lib/types';
import { Field, Modal, useToast } from './ui';

function BulkImagePreview({ url, onState }: { url: string; onState: (state: 'loaded' | 'error') => void }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  if (!url) return <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-s3 text-xl">🎁</div>;
  return (
    <div className="shrink-0">
      <img src={url} alt="" onLoad={() => { setState('loaded'); onState('loaded'); }} onError={() => { setState('error'); onState('error'); }} className="h-10 w-10 rounded-lg object-cover" />
      <div className={`mt-1 max-w-24 text-[0.65rem] leading-tight ${state === 'error' ? 'text-danger' : state === 'loaded' ? 'text-green' : 'text-mute'}`}>
        {state === 'error' ? 'โหลดรูปไม่สำเร็จ' : state === 'loaded' ? 'รูปพร้อมใช้งาน' : 'กำลังตรวจ URL…'}
      </div>
    </div>
  );
}

export default function BulkProducts({ maps, shops, defaultMapId, onClose }: { maps: MapRow[]; shops: ShopIdRow[]; defaultMapId: string; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshData();
  const [mapId, setMapId] = useState(defaultMapId !== 'all' ? defaultMapId : '');
  const [shopIdRef, setShopIdRef] = useState('');
  const [status, setStatus] = useState('active');
  const [text, setText] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [bulkImageText, setBulkImageText] = useState('');
  const [imageStates, setImageStates] = useState<Record<string, 'loaded' | 'error'>>({});
  const [busy, setBusy] = useState(false);

  // แต่ละบรรทัด: ชื่อ, สต็อก, รายละเอียด, แมพ(ชื่อหรือรหัส — ไม่บังคับ ใช้แทนแมพด้านบน)
  const items = useMemo<BulkProductInput[]>(() => {
    const out: BulkProductInput[] = [];
    for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const [name = '', stock = '', description = '', mp = ''] = line.split(',').map((s) => s.trim());
      if (!name) continue;
      const lineMap = mp ? maps.find((m) => m.id === mp || m.name.toLowerCase() === mp.toLowerCase())?.id : undefined;
      out.push({ name, mapId: lineMap ?? mapId, shopIdRef, stock: Math.max(0, parseInt(stock, 10) || 0), description, status, thumbnail: '' });
    }
    return out;
  }, [text, mapId, shopIdRef, status, maps]);

  const failedImages = items.filter((item, index) => imageUrls[index]?.trim() && imageStates[`${index}-${item.name}`] === 'error').length;

  function applyImageUrls() {
    const lines = bulkImageText.split(/\r?\n/).map((line) => line.trim());
    setImageUrls(items.map((_, index) => lines[index] ?? ''));
    setImageStates({});
    toast(`ใส่ URL ให้ ${Math.min(lines.filter(Boolean).length, items.length)} จาก ${items.length} รายการแล้ว`, 'info');
  }

  async function submit() {
    if (!items.length) { toast('กรุณากรอกข้อมูล', 'error'); return; }
    setBusy(true);
    try {
      await addProducts(items.map((item, index) => ({ ...item, thumbnail: imageUrls[index]?.trim() ?? '' })));
      await refresh();
      toast(`เพิ่มสำเร็จ ${items.length} รายการ ✅`);
      onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal wide title="เพิ่มสินค้าหลายรายการ" onClose={onClose}
      footer={<><button className="btn btn-g" onClick={onClose}>ยกเลิก</button><button className="btn btn-p" disabled={busy || !items.length} onClick={submit}>{busy ? 'กำลังเพิ่ม…' : `เพิ่ม ${items.length} รายการ`}</button></>}>
      <div className="grid gap-x-3 sm:grid-cols-3">
        <Field label="แมพ">
          <select className="inp" value={mapId} onChange={(e) => setMapId(e.target.value)}>
            <option value="">— ไม่ระบุแมพ —</option>
            {maps.map((m) => <option key={m.id} value={m.id}>{m.icon} {m.name}</option>)}
          </select>
        </Field>
        <Field label="Shop ID">
          <select className="inp" value={shopIdRef} onChange={(e) => setShopIdRef(e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.shopId}</option>)}
          </select>
        </Field>
        <Field label="สถานะ">
          <select className="inp" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">✅ ใช้งาน</option><option value="inactive">🔴 ปิด</option>
          </select>
        </Field>
      </div>
      <Field label="รายการ (1 บรรทัด = 1 สินค้า)" hint="รูปแบบ: ชื่อสินค้า, สต็อก, รายละเอียด, แมพ (ชื่อหรือรหัส ไม่บังคับ)">
        <textarea className="inp min-h-[160px] font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={'ดาบไฟ, 10, ดาบระดับหายาก\nโล่เหล็ก, 5'} />
      </Field>
      {items.length > 0 && (
        <div className="mb-3 overflow-hidden rounded-xl border border-line">
          <div className="border-b border-line bg-s2 px-3 py-2 text-xs font-bold text-mute">รูปสินค้าแยกรายการ (URL)</div>
          <div className="border-b border-line bg-surface p-3">
            <Field label="วาง URL หลายรายการ" hint="1 บรรทัดต่อ 1 สินค้า ตามลำดับด้านบน · เว้นบรรทัดว่างได้หากสินค้านั้นไม่มีรูป">
              <textarea className="inp min-h-[90px] font-mono text-xs" value={bulkImageText} onChange={(e) => setBulkImageText(e.target.value)} placeholder={'https://example.com/image-1.png\nhttps://example.com/image-2.png'} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-g btn-sm" onClick={applyImageUrls}>ใส่ URL ตามลำดับสินค้า</button>
              <span className="text-xs text-mute">มี {bulkImageText.split(/\r?\n/).filter((line) => line.trim()).length} URL · สินค้า {items.length} รายการ</span>
              {bulkImageText.split(/\r?\n/).filter((line) => line.trim()).length > items.length && <span className="text-xs text-warn">เกินจำนวนสินค้า — URL ส่วนเกินจะไม่ถูกนำไปใช้</span>}
            </div>
          </div>
          <div className="max-h-56 divide-y divide-line overflow-y-auto">
            {items.map((item, index) => {
              const imageUrl = imageUrls[index] ?? '';
              return (
                <div key={`${index}-${item.name}`} className="flex items-center gap-3 p-2.5">
                  <BulkImagePreview key={`${index}-${imageUrl}`} url={imageUrl} onState={(state) => setImageStates((current) => ({ ...current, [`${index}-${item.name}`]: state }))} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 truncate text-xs font-semibold">{item.name}</div>
                    <input className="inp !py-1.5 text-xs" type="url" value={imageUrl}
                      onChange={(e) => {
                        setImageUrls((urls) => { const next = [...urls]; next[index] = e.target.value; return next; });
                        setImageStates((current) => { const next = { ...current }; delete next[`${index}-${item.name}`]; return next; });
                      }}
                      placeholder="https://… (เว้นว่างได้)" aria-label={`URL รูปสินค้า ${item.name}`} />
                  </div>
                </div>
              );
            })}
          </div>
          {failedImages > 0 && <div className="border-t border-danger/30 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">⚠️ มี {failedImages} URL ที่เปิดรูปไม่ได้ กรุณาตรวจ URL หรือแก้รายการที่ขึ้น “โหลดรูปไม่สำเร็จ” ก่อนบันทึก</div>}
        </div>
      )}
      <p className="text-sm text-mute">จะเพิ่ม <b className="text-accent">{items.length}</b> รายการ</p>
    </Modal>
  );
}
