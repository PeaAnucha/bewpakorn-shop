import { useMemo, useState } from 'react';
import { addProducts, errMsg, useRefreshData, type BulkProductInput } from '../lib/data';
import type { MapRow, ShopIdRow } from '../lib/types';
import { Field, Modal, useToast } from './ui';

export default function BulkProducts({ maps, shops, defaultMapId, onClose }: { maps: MapRow[]; shops: ShopIdRow[]; defaultMapId: string; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshData();
  const [mapId, setMapId] = useState(defaultMapId !== 'all' ? defaultMapId : '');
  const [shopIdRef, setShopIdRef] = useState('');
  const [status, setStatus] = useState('active');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  // แต่ละบรรทัด: ชื่อ, สต็อก, รายละเอียด, แมพ(ชื่อหรือรหัส — ไม่บังคับ ใช้แทนแมพด้านบน)
  const items = useMemo<BulkProductInput[]>(() => {
    const out: BulkProductInput[] = [];
    for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const [name = '', stock = '', description = '', mp = ''] = line.split(',').map((s) => s.trim());
      if (!name) continue;
      const lineMap = mp ? maps.find((m) => m.id === mp || m.name.toLowerCase() === mp.toLowerCase())?.id : undefined;
      out.push({ name, mapId: lineMap ?? mapId, shopIdRef, stock: Math.max(0, parseInt(stock, 10) || 0), description, status });
    }
    return out;
  }, [text, mapId, shopIdRef, status, maps]);

  async function submit() {
    if (!items.length) { toast('กรุณากรอกข้อมูล', 'error'); return; }
    setBusy(true);
    try {
      await addProducts(items);
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
      <p className="text-sm text-mute">จะเพิ่ม <b className="text-accent">{items.length}</b> รายการ</p>
    </Modal>
  );
}
