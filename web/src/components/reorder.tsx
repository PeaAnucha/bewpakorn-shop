import { useMemo, useState, type ReactNode } from 'react';
import {
  KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * ตัวช่วยย้ายด้วยคีย์บอร์ดแบบตาราง: ← → ย้ายทีละช่อง, ↑ ↓ ย้ายทีละแถว
 * (ตัวมาตรฐานของ dnd-kit เลือกช่องเป้าหมายผิดในตารางหลายแถว จึงคำนวณเองจากลำดับในรายการ)
 */
export const gridKeyboard = (ids: string[]): KeyboardCoordinateGetter => (event, { context: { active, droppableRects, over, collisionRect } }) => {
  if (!active || !collisionRect) return undefined;
  const currentId = String(over?.id ?? active.id);
  const cur = ids.indexOf(currentId);
  if (cur < 0) return undefined;
  const firstTop = droppableRects.get(ids[0])?.top ?? 0;
  const cols = Math.max(1, ids.filter((id) => Math.abs((droppableRects.get(id)?.top ?? 1e9) - firstTop) < 4).length);
  const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols } as Record<string, number>)[event.code];
  if (!step) return undefined;
  const target = ids[Math.min(ids.length - 1, Math.max(0, cur + step))];
  const rect = droppableRects.get(target);
  if (target === currentId || !rect) return undefined;
  event.preventDefault();
  return { x: rect.left, y: rect.top };
};

/**
 * จัดลำดับด้วยการลากวาง: แสดงลำดับใหม่ทันที (optimistic) แล้วเรียก persist ให้บันทึก
 * persist ต้องจัดการแจ้งเตือนเองและไม่ throw; เมื่อเสร็จ (สำเร็จหรือพลาด) จะกลับไปใช้ข้อมูลจริงจากฐานข้อมูล
 *
 * เมาส์: ลากเมื่อขยับเกิน 6px (กดปุ่มในแถวได้ปกติ) · มือถือ: กดค้างสั้นๆ แล้วลาก (เลื่อนหน้าจอได้ปกติ)
 * คีย์บอร์ด: โฟกัสที่ ⠿ กด Space แล้วใช้ลูกศร กด Space เพื่อวาง
 */
export function useReorder<T extends { id: string }>(items: T[], persist: (ids: string[]) => Promise<void>, layout: 'grid' | 'list' = 'list') {
  const [local, setLocal] = useState<string[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => {
    if (!local) return items;
    const byId = new Map(items.map((m) => [m.id, m]));
    const ordered = local.map((id) => byId.get(id)).filter((m): m is T => !!m);
    return [...ordered, ...items.filter((m) => !local.includes(m.id))]; // เผื่อมีรายการใหม่เข้ามาระหว่างลาก
  }, [items, local]);

  const ids = useMemo(() => list.map((m) => m.id), [list]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: layout === 'grid' ? gridKeyboard(ids) : sortableKeyboardCoordinates }),
  );

  async function commit(next: string[]) {
    setLocal(next);
    setSaving(true);
    try { await persist(next); } catch { /* persist แจ้งเตือนเองแล้ว */ } finally { setLocal(null); setSaving(false); }
  }

  return {
    list, ids, sensors, activeId, saving,
    onDragStart: (e: DragStartEvent) => setActiveId(String(e.active.id)),
    onDragCancel: () => setActiveId(null),
    onDragEnd: (e: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      void commit(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
    },
    /** ย้ายไปบนสุด/ล่างสุด (สะดวกเมื่อรายการยาวและต้องลากไกล) */
    moveToEdge: (id: string, edge: 'top' | 'bottom') => {
      const rest = ids.filter((x) => x !== id);
      const next = edge === 'top' ? [id, ...rest] : [...rest, id];
      if (next.every((x, i) => x === ids[i])) return;
      void commit(next);
    },
  };
}

/** ครอบรายการที่ลากได้ทั้งแถว พร้อมปุ่มจับ ⠿ สำหรับคีย์บอร์ด/การเข้าถึง */
export function SortableItem({ id, label, disabled, children }: {
  id: string; label: string; disabled?: boolean;
  children: (p: { handle: ReactNode }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const handle = (
    <button ref={setActivatorNodeRef} {...attributes} aria-label={`ลากเพื่อจัดลำดับ ${label}`} title="ลากเพื่อจัดลำดับ"
      className="cursor-grab rounded px-1.5 text-lg leading-none text-faint hover:text-accent">⠿</button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${disabled ? '' : 'cursor-grab select-none active:cursor-grabbing'} ${isDragging ? 'opacity-30' : ''}`}
      {...(disabled ? {} : listeners)}
    >
      {children({ handle })}
    </div>
  );
}

export const EdgeButtons = ({ onTop, onBottom, disabled }: { onTop: () => void; onBottom: () => void; disabled?: boolean }) => (
  <div className="flex gap-1">
    <button className="btn btn-g !px-2 !py-1 text-xs" title="ย้ายไปบนสุด" disabled={disabled} onClick={onTop}>⤒</button>
    <button className="btn btn-g !px-2 !py-1 text-xs" title="ย้ายไปล่างสุด" disabled={disabled} onClick={onBottom}>⤓</button>
  </div>
);

export const screenReaderTexts = (nameOf: (id: unknown) => string) => ({
  screenReaderInstructions: { draggable: 'กด Space เพื่อหยิบรายการ ใช้ปุ่มลูกศรเพื่อย้าย กด Space อีกครั้งเพื่อวาง หรือกด Esc เพื่อยกเลิก' },
  announcements: {
    onDragStart: ({ active }: { active: { id: unknown } }) => `หยิบ ${nameOf(active.id)}`,
    onDragOver: ({ active, over }: { active: { id: unknown }; over: { id: unknown } | null }) => (over ? `${nameOf(active.id)} อยู่เหนือ ${nameOf(over.id)}` : undefined),
    onDragEnd: ({ active, over }: { active: { id: unknown }; over: { id: unknown } | null }) => (over ? `วาง ${nameOf(active.id)} แล้ว` : `ยกเลิกการย้าย ${nameOf(active.id)}`),
    onDragCancel: ({ active }: { active: { id: unknown } }) => `ยกเลิกการย้าย ${nameOf(active.id)}`,
  },
});
