import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { addShopIds, deleteShopIds, errMsg, saveShopId, useMaps, useRefreshData, useShopIdsOrdered, type ShopIdInput } from '../lib/data';
import type { MapRow, ShopIdRow } from '../lib/types';
import ShopIdSortList from '../components/ShopIdSortList';
import { Empty, ErrorBox, Field, MapChips, Modal, Spinner, useToast } from '../components/ui';

function ShopIdForm({ row, maps, defaultMap, onClose }: { row: ShopIdRow | null; maps: MapRow[]; defaultMap: string; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshData();
  const [shopId, setShopId] = useState(row?.shopId ?? '');
  const [password, setPassword] = useState(row?.password ?? '');
  const [mapId, setMapId] = useState(row?.mapId ?? (defaultMap !== 'all' ? defaultMap : ''));
  const [note, setNote] = useState(row?.note ?? '');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!shopId.trim()) { toast('กรุณากรอก Shop ID', 'error'); return; }
    setBusy(true);
    try {
      await saveShopId(row?.id ?? null, { shopId, password, mapId, note });
      await refresh();
      toast('บันทึกสำเร็จ ✅');
      onClose();
    } catch (e) { toast(errMsg(e).includes('ซ้ำ') ? 'Shop ID นี้มีอยู่แล้ว' : errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal title={row ? 'แก้ไข Shop ID' : 'เพิ่ม Shop ID'} onClose={onClose}
      footer={<><button className="btn btn-g" onClick={onClose}>ยกเลิก</button><button className="btn btn-p" disabled={busy} onClick={submit}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></>}>
      <Field label="Shop ID *"><input className="inp" value={shopId} onChange={(e) => setShopId(e.target.value)} autoFocus /></Field>
      <Field label="Password">
        <div className="flex gap-2">
          <input className="inp" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          <button type="button" className="btn btn-g" onClick={() => setShow((s) => !s)}>{show ? '🙈' : '👁'}</button>
        </div>
      </Field>
      <Field label="แมพ">
        <select className="inp" value={mapId} onChange={(e) => setMapId(e.target.value)}>
          <option value="">— ไม่ระบุแมพ —</option>
          {maps.map((m) => <option key={m.id} value={m.id}>{m.icon} {m.name}</option>)}
        </select>
      </Field>
      <Field label="หมายเหตุ"><input className="inp" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

function BulkForm({ maps, existing, defaultMap, onClose }: { maps: MapRow[]; existing: ShopIdRow[]; defaultMap: string; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshData();
  const [mapId, setMapId] = useState(defaultMap !== 'all' ? defaultMap : '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  // รูปแบบแต่ละบรรทัด: ShopID, Password, หมายเหตุ, แมพ(รหัสหรือชื่อ — ไม่บังคับ)
  const parsed = useMemo(() => {
    const seen = new Set(existing.map((s) => s.shopId.toLowerCase()));
    const items: ShopIdInput[] = [];
    let dup = 0;
    for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const [sid = '', pw = '', note = '', mp = ''] = line.split(',').map((s) => s.trim());
      if (!sid) continue;
      if (seen.has(sid.toLowerCase())) { dup++; continue; }
      seen.add(sid.toLowerCase());
      const lineMap = mp ? maps.find((m) => m.id === mp || m.name.toLowerCase() === mp.toLowerCase())?.id ?? '' : '';
      items.push({ shopId: sid, password: pw, note, mapId: lineMap || mapId });
    }
    return { items, dup };
  }, [text, mapId, maps, existing]);

  async function submit() {
    if (!parsed.items.length) { toast('ไม่มีรายการที่เพิ่มได้', 'error'); return; }
    setBusy(true);
    try {
      await addShopIds(parsed.items);
      await refresh();
      toast(`เพิ่มสำเร็จ ${parsed.items.length} รายการ ✅${parsed.dup ? ` (ข้ามที่ซ้ำ ${parsed.dup})` : ''}`);
      onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal wide title="เพิ่ม Shop ID หลายรายการ" onClose={onClose}
      footer={<><button className="btn btn-g" onClick={onClose}>ยกเลิก</button><button className="btn btn-p" disabled={busy || !parsed.items.length} onClick={submit}>{busy ? 'กำลังเพิ่ม…' : `เพิ่ม ${parsed.items.length} รายการ`}</button></>}>
      <Field label="แมพเริ่มต้น">
        <select className="inp" value={mapId} onChange={(e) => setMapId(e.target.value)}>
          <option value="">— ไม่ระบุแมพ —</option>
          {maps.map((m) => <option key={m.id} value={m.id}>{m.icon} {m.name}</option>)}
        </select>
      </Field>
      <Field label="รายการ (1 บรรทัด = 1 ไอดี)" hint="รูปแบบ: ShopID, Password, หมายเหตุ, แมพ (ชื่อหรือรหัส ไม่บังคับ)">
        <textarea className="inp min-h-[160px] font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={'shop001, pass123, ไอดีหลัก\nshop002, pass456'} />
      </Field>
      <p className="text-sm text-mute">
        จะเพิ่ม <b className="text-accent">{parsed.items.length}</b> รายการ{parsed.dup > 0 && <span className="text-warn"> · ข้าม {parsed.dup} รายการที่ซ้ำ</span>}
      </p>
    </Modal>
  );
}

export default function ShopIdsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const refresh = useRefreshData();
  const maps = useMaps();
  const shops = useShopIdsOrdered();
  const [sortMode, setSortMode] = useState(false);
  const [selMap, setSelMap] = useState('all');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ShopIdRow | 'new' | null>(null);
  const [bulk, setBulk] = useState(false);

  const mapList = maps.data ?? [];
  const all = shops.data ?? [];
  const mapOf = (id: string | null) => mapList.find((m) => m.id === id);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    all.forEach((s) => { if (s.mapId) c[s.mapId] = (c[s.mapId] ?? 0) + 1; });
    return c;
  }, [all]);

  const list = useMemo(() => {
    const k = q.toLowerCase().trim();
    return all
      .filter((s) => selMap === 'all' || s.mapId === selMap)
      .filter((s) => !k || s.shopId.toLowerCase().includes(k) || (mapOf(s.mapId)?.name ?? '').toLowerCase().includes(k) || (s.note ?? '').toLowerCase().includes(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, selMap, q, mapList]);

  const sortList = useMemo(() => (sortMode ? all.filter((s) => selMap === 'all' || s.mapId === selMap) : []), [sortMode, all, selMap]);
  const allIds = useMemo(() => all.map((s) => s.id), [all]);

  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const allPicked = list.length > 0 && list.every((s) => picked.has(s.id));
  const canEdit = can('shopids', 'edit');
  const canDel = can('shopids', 'delete');

  async function removeMany(ids: string[]) {
    if (!ids.length || !confirm(`ลบ ${ids.length} รายการ?\nสินค้าที่ผูกกับไอดีเหล่านี้จะกลายเป็นไม่ระบุไอดี`)) return;
    try { await deleteShopIds(ids); setPicked(new Set()); await refresh(); toast('ลบสำเร็จ'); } catch (e) { toast(errMsg(e), 'error'); }
  }

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-head text-base font-bold">🔑 Shop IDs</h1>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button
              className={`btn text-xs text-white ${sortMode ? 'bg-danger' : 'bg-indigo-500'}`}
              onClick={() => { setQ(''); setPicked(new Set()); setSortMode((m) => !m); }}
            >
              {sortMode ? '✅ เสร็จสิ้นการจัดเรียง' : '↕️ จัดเรียง'}
            </button>
          )}
          {!sortMode && can('shopids', 'add') && <button className="btn btn-g" onClick={() => setBulk(true)}>➕ เพิ่มหลายรายการ</button>}
          {!sortMode && can('shopids', 'add') && <button className="btn btn-p" onClick={() => setEditing('new')}>+ เพิ่ม ID</button>}
        </div>
      </div>
      <div className="mb-3"><MapChips maps={mapList} counts={counts} total={all.length} selected={selMap} onSelect={(id) => { setSelMap(id); setPicked(new Set()); }} /></div>
      {sortMode ? (
        <>
          <div className="mb-3 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
            ↕️ ลากรายการ (หรือกดค้างบนมือถือ) เพื่อจัดลำดับ · ปุ่ม ⤒ ⤓ ย้ายไปบนสุด/ล่างสุด · บันทึกอัตโนมัติ · ลำดับเป็นแบบเดียวทั้งระบบ{selMap !== 'all' ? ' (เลือกแมพอยู่ จึงจัดเฉพาะลำดับของไอดีในแมพนี้ ไอดีอื่นอยู่ที่เดิม)' : ''} · {sortList.length} รายการ
          </div>
          {shops.isLoading ? <Spinner /> : !sortList.length ? <Empty icon="🔑" text="ยังไม่มี Shop ID" /> : <ShopIdSortList shops={sortList} allIds={allIds} />}
        </>
      ) : (
        <>
      <input className="inp mb-3" placeholder="🔍 ค้นหา Shop ID, แมพ, หมายเหตุ…" value={q} onChange={(e) => setQ(e.target.value)} />
      {picked.size > 0 && canDel && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-mute">{picked.size} รายการ</span>
          <button className="btn bg-danger/15 text-danger hover:bg-danger/25" onClick={() => removeMany([...picked])}>🗑️ ลบที่เลือก</button>
          <button className="btn btn-g" onClick={() => setPicked(new Set())}>✕ ยกเลิก</button>
        </div>
      )}
      {shops.isLoading ? <Spinner /> : shops.error ? <ErrorBox error={shops.error} /> : !list.length ? <Empty icon="🔑" text="ยังไม่มี Shop ID" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-mute">
                <th className="w-8 py-2 pl-2">{canDel && <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((s) => s.id)))} />}</th>
                <th className="py-2">Shop ID</th><th>Password</th><th>แมพ</th><th>หมายเหตุ</th>{(canEdit || canDel) && <th />}
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-b border-line/60 hover:bg-s2/60">
                  <td className="py-2 pl-2">{canDel && <input type="checkbox" checked={picked.has(s.id)} onChange={() => setPicked((p) => toggle(p, s.id))} />}</td>
                  <td><code className="rounded bg-s3 px-1.5 py-0.5">{s.shopId}</code></td>
                  <td>
                    <span className={revealed.has(s.id) ? 'text-ink' : 'text-faint'}>{revealed.has(s.id) ? s.password || '(ไม่มี)' : '••••••'}</span>
                    <button className="btn btn-g !ml-1.5 !px-2 !py-0.5 text-xs" onClick={() => setRevealed((r) => toggle(r, s.id))}>👁</button>
                  </td>
                  <td>{mapOf(s.mapId) ? `${mapOf(s.mapId)!.icon ?? ''} ${mapOf(s.mapId)!.name}` : '—'}</td>
                  <td className="text-mute">{s.note || '—'}</td>
                  {(canEdit || canDel) && (
                    <td className="whitespace-nowrap text-right">
                      {canEdit && <button className="btn btn-g !px-2 !py-1 text-xs" onClick={() => setEditing(s)}>✏️</button>}
                      {canDel && <button className="btn !ml-1 !px-2 !py-1 text-xs bg-danger/15 text-danger hover:bg-danger/25" onClick={() => removeMany([s.id])}>🗑️</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
      {editing && <ShopIdForm row={editing === 'new' ? null : editing} maps={mapList} defaultMap={selMap} onClose={() => setEditing(null)} />}
      {bulk && <BulkForm maps={mapList} existing={all} defaultMap={selMap} onClose={() => setBulk(false)} />}
    </div>
  );
}
