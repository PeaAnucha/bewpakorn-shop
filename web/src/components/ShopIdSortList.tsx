import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ReactNode } from 'react';
import { errMsg, reorderShopIds, useRefreshData } from '../lib/data';
import { mergeIntoGlobal } from '../lib/products';
import type { ShopIdRow } from '../lib/types';
import { EdgeButtons, SortableItem, screenReaderTexts, useReorder } from './reorder';
import { useToast } from './ui';

function Row({ s, index, handle, edge }: { s: ShopIdRow; index: number; handle?: ReactNode; edge?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl border border-line bg-s2/80 p-2.5">
      {handle}
      <span className="w-9 shrink-0 text-center font-head text-sm font-bold text-info">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <code className="rounded bg-s3 px-1.5 py-0.5 text-sm">{s.shopId}</code>
        {s.note && <span className="ml-2 text-xs text-mute">{s.note}</span>}
      </div>
      {edge}
    </div>
  );
}

/**
 * จัดลำดับ Shop ID ด้วยการลากวาง (บันทึกอัตโนมัติ) ลำดับเป็นแบบเดียวทั้งระบบ
 * shops = รายการที่แสดงอยู่ (ทั้งหมด หรือกรองตามแมพ) · allIds = รหัสทั้งหมดเรียงตามลำดับปัจจุบัน
 * ถ้าแสดงเฉพาะบางส่วน จะจัดลำดับสัมพัทธ์ของส่วนนั้น รายการอื่นอยู่ที่เดิม
 */
export default function ShopIdSortList({ shops, allIds }: { shops: ShopIdRow[]; allIds: string[] }) {
  const toast = useToast();
  const refresh = useRefreshData();

  async function persist(ids: string[]) {
    try {
      await reorderShopIds(mergeIntoGlobal(allIds, ids));
      await refresh();
      toast('บันทึกลำดับ Shop ID แล้ว ✅');
    } catch (e) {
      toast(`บันทึกลำดับไม่สำเร็จ: ${errMsg(e)}`, 'error');
    }
  }

  const r = useReorder(shops, persist, 'list');
  const nameOf = (id: unknown) => r.list.find((s) => s.id === id)?.shopId ?? '';
  const active = r.activeId ? r.list.find((s) => s.id === r.activeId) : undefined;

  return (
    <DndContext sensors={r.sensors} collisionDetection={closestCenter} onDragStart={r.onDragStart} onDragEnd={r.onDragEnd}
      onDragCancel={r.onDragCancel} accessibility={screenReaderTexts(nameOf)}>
      <SortableContext items={r.ids} strategy={verticalListSortingStrategy}>
        {r.list.map((s, i) => (
          <SortableItem key={s.id} id={s.id} label={s.shopId} disabled={r.saving}>
            {({ handle }) => (
              <Row s={s} index={i} handle={handle}
                edge={<EdgeButtons disabled={r.saving} onTop={() => r.moveToEdge(s.id, 'top')} onBottom={() => r.moveToEdge(s.id, 'bottom')} />} />
            )}
          </SortableItem>
        ))}
      </SortableContext>
      <DragOverlay>
        {active && (
          <div className="rotate-1 cursor-grabbing opacity-95 shadow-2xl shadow-black/60">
            <Row s={active} index={r.list.findIndex((s) => s.id === active.id)} />
          </div>
        )}
      </DragOverlay>
      {r.saving && <div className="sticky bottom-3 mx-auto mt-2 w-fit rounded-full border border-warn/40 bg-s2 px-4 py-1.5 text-xs font-semibold text-warn shadow-xl">⏳ กำลังบันทึกลำดับ…</div>}
    </DndContext>
  );
}
