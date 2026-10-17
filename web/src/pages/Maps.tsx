import { useState } from 'react';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../auth/AuthProvider';
import { deleteMaps, errMsg, reorderMaps, saveMap, useMaps, useProducts, useRefreshData } from '../lib/data';
import type { MapRow } from '../lib/types';
import { Empty, ErrorBox, Field, Modal, Spinner, useToast } from '../components/ui';
import { screenReaderTexts, useReorder } from '../components/reorder';

function MapForm({ map, onClose }: { map: MapRow | null; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshData();
  const [name, setName] = useState(map?.name ?? '');
  const [icon, setIcon] = useState(map?.icon ?? '');
  const [desc, setDesc] = useState(map?.description ?? '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) { toast('กรุณากรอกชื่อแมพ', 'error'); return; }
    setBusy(true);
    try {
      await saveMap(map?.id ?? null, { name, icon, description: desc });
      await refresh();
      toast('บันทึกสำเร็จ ✅');
      onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal title={map ? 'แก้ไขแมพ' : 'เพิ่มแมพ'} onClose={onClose}
      footer={<><button className="btn btn-g" onClick={onClose}>ยกเลิก</button><button className="btn btn-p" disabled={busy} onClick={submit}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></>}>
      <Field label="ชื่อแมพ *"><input className="inp" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <Field label="ไอคอน (อีโมจิ)"><input className="inp" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🗺️" /></Field>
      <Field label="คำอธิบาย"><textarea className="inp min-h-[70px]" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
    </Modal>
  );
}


interface CardProps {
  map: MapRow;
  index: number;
  canEdit: boolean;
  canDelete: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

/** ตัวการ์ดแมพ (ใช้ทั้งในตาราง และเป็นภาพที่ลอยตามเมาส์ตอนลาก) */
function MapCard({ map, index, canEdit, canDelete, onEdit, onDelete, handle }: CardProps & { handle?: React.ReactNode }) {
  return (
    <div className="relative h-full select-none rounded-lg bg-s2 p-4 pb-7 text-center">
      <span className="absolute left-2 top-2 rounded-md bg-s3 px-1.5 py-0.5 text-[0.65rem] font-bold text-faint">{index + 1}</span>
      {handle}
      <div className="absolute right-2 top-2 flex gap-1">
        {canEdit && <button className="btn btn-g !px-2 !py-1 text-xs" onClick={onEdit}>✏️</button>}
        {canDelete && <button className="btn !px-2 !py-1 text-xs bg-danger/15 text-danger hover:bg-danger/25" onClick={onDelete}>🗑️</button>}
      </div>
      <div className="mt-5 text-4xl">{map.icon || '🗺️'}</div>
      <div className="mt-2 font-head text-base font-bold text-teal-200">{map.name}</div>
      <div className="mt-1 text-xs text-mute">{map.description || '—'}</div>
    </div>
  );
}

function SortableMap(props: CardProps & { canDrag: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.map.id, disabled: !props.canDrag,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`h-full ${props.canDrag ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'opacity-30' : ''}`}
      {...(props.canDrag ? listeners : {})}
    >
      <MapCard
        {...props}
        handle={props.canDrag && (
          <button ref={setActivatorNodeRef} {...attributes} aria-label={`ลากเพื่อจัดลำดับ ${props.map.name}`} title="ลากเพื่อจัดลำดับ"
            className="absolute bottom-1.5 left-1/2 -translate-x-1/2 cursor-grab rounded px-2 text-lg leading-none text-faint hover:text-accent">
            ⠿
          </button>
        )}
      />
    </div>
  );
}

export default function MapsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const refresh = useRefreshData();
  const maps = useMaps();
  const products = useProducts();
  const [editing, setEditing] = useState<MapRow | 'new' | null>(null);
  const canEdit = can('maps', 'edit');
  const canDelete = can('maps', 'delete');

  async function persist(ids: string[]) {
    try {
      await reorderMaps(ids);
      await refresh();
      toast('บันทึกลำดับแมพแล้ว ✅');
    } catch (e) {
      toast(`บันทึกลำดับไม่สำเร็จ: ${errMsg(e)}`, 'error'); // ลำดับจะย้อนกลับเป็นของจริงในฐานข้อมูลเอง
    }
  }
  const r = useReorder(maps.data ?? [], persist, 'grid');
  const list = r.list;
  const saving = r.saving;

  async function remove(m: MapRow) {
    const n = (products.data ?? []).filter((p) => p.mapId === m.id).length;
    if (!confirm(`ลบแมพ "${m.name}"?${n ? `\nสินค้า ${n} รายการในแมพนี้จะกลายเป็นไม่ระบุแมพ` : ''}`)) return;
    try { await deleteMaps([m.id]); await refresh(); toast('ลบแมพสำเร็จ'); } catch (e) { toast(errMsg(e), 'error'); }
  }

  const activeMap = r.activeId ? list.find((m) => m.id === r.activeId) : undefined;
  const nameOf = (id: unknown) => list.find((m) => m.id === id)?.name ?? '';

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-head text-2xl font-bold tracking-tight">🗺️ จัดการแมพ</h1>
        {can('maps', 'add') && <button className="btn btn-p" onClick={() => setEditing('new')}>+ เพิ่มแมพ</button>}
      </div>
      {canEdit && list.length > 1 && (
        <p className="mb-4 text-xs text-mute">
          💡 ลากการ์ดเพื่อจัดลำดับ (บันทึกอัตโนมัติ) · บนมือถือให้กดค้างที่การ์ดแล้วลาก · ลำดับนี้ใช้กับตัวเลือกแมพทุกหน้า
          {saving && <span className="ml-2 font-semibold text-warn">⏳ กำลังบันทึกลำดับ…</span>}
        </p>
      )}
      {maps.isLoading ? <Spinner /> : maps.error ? <ErrorBox error={maps.error} /> : !list.length ? <Empty icon="🗺️" text="ยังไม่มีแมพ" /> : (
        <DndContext
          sensors={r.sensors}
          collisionDetection={closestCenter}
          onDragStart={r.onDragStart}
          onDragEnd={r.onDragEnd}
          onDragCancel={r.onDragCancel}
          accessibility={screenReaderTexts(nameOf)}
        >
          <SortableContext items={r.ids} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((m, i) => (
                <SortableMap key={m.id} map={m} index={i} canDrag={canEdit && !saving} canEdit={canEdit} canDelete={canDelete}
                  onEdit={() => setEditing(m)} onDelete={() => remove(m)} />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeMap && (
              <div className="rotate-2 cursor-grabbing opacity-95 shadow-2xl shadow-black/60">
                <MapCard map={activeMap} index={list.findIndex((m) => m.id === activeMap.id)} canEdit={false} canDelete={false} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
      {editing && <MapForm map={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
