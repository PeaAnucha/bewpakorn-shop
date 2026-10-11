import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ReactNode } from 'react';
import { bulkUpdateSort, errMsg, useRefreshData } from '../lib/data';
import { fmtNum } from '../lib/format';
import type { Product, ShopIdRow } from '../lib/types';
import { EdgeButtons, SortableItem, screenReaderTexts, useReorder } from './reorder';
import { Chip, Thumb, useToast } from './ui';

function Row({ p, index, shop, handle, edge }: { p: Product; index: number; shop?: ShopIdRow; handle?: ReactNode; edge?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl border border-line bg-s2/80 p-2.5">
      {handle}
      <span className="w-9 shrink-0 text-center font-head text-sm font-bold text-info">{index + 1}</span>
      <Thumb src={p.thumbnail} className="h-12 w-12" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <strong className="break-words text-sm">{p.name}</strong>
          {p.isBundle && <Chip tone="shop">📦 Bundle</Chip>}
          {p.status !== 'active' && <Chip tone="off">🔴 ปิด</Chip>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {shop && <Chip tone="shop">🔑 {shop.shopId}</Chip>}
          <Chip tone={p.stock <= 0 ? 'low' : 'ok'}>📦 {fmtNum(p.stock)}</Chip>
        </div>
      </div>
      {edge}
    </div>
  );
}

/** จัดลำดับสินค้าของแมพหนึ่งด้วยการลากวาง (บันทึกอัตโนมัติ: ลำดับ 1..n ตามที่เห็น) */
export default function ProductSortList({ products, shops }: { products: Product[]; shops: ShopIdRow[] }) {
  const toast = useToast();
  const refresh = useRefreshData();

  async function persist(ids: string[]) {
    const current = new Map(products.map((p) => [p.id, p.sortOrder]));
    const items = ids.map((id, i) => ({ id, sort: i + 1 })).filter((x) => current.get(x.id) !== x.sort);
    if (!items.length) return;
    try {
      await bulkUpdateSort(items);
      await refresh();
      toast('บันทึกลำดับสินค้าแล้ว ✅');
    } catch (e) {
      toast(`บันทึกลำดับไม่สำเร็จ: ${errMsg(e)}`, 'error');
    }
  }

  const r = useReorder(products, persist, 'list');
  const shopOf = (p: Product) => shops.find((s) => s.id === p.shopIdRef);
  const nameOf = (id: unknown) => r.list.find((p) => p.id === id)?.name ?? '';
  const active = r.activeId ? r.list.find((p) => p.id === r.activeId) : undefined;

  return (
    <DndContext sensors={r.sensors} collisionDetection={closestCenter} onDragStart={r.onDragStart} onDragEnd={r.onDragEnd}
      onDragCancel={r.onDragCancel} accessibility={screenReaderTexts(nameOf)}>
      <SortableContext items={r.ids} strategy={verticalListSortingStrategy}>
        {r.list.map((p, i) => (
          <SortableItem key={p.id} id={p.id} label={p.name} disabled={r.saving}>
            {({ handle }) => (
              <Row p={p} index={i} shop={shopOf(p)} handle={handle}
                edge={<EdgeButtons disabled={r.saving} onTop={() => r.moveToEdge(p.id, 'top')} onBottom={() => r.moveToEdge(p.id, 'bottom')} />} />
            )}
          </SortableItem>
        ))}
      </SortableContext>
      <DragOverlay>
        {active && (
          <div className="rotate-1 cursor-grabbing opacity-95 shadow-2xl shadow-black/60">
            <Row p={active} index={r.list.findIndex((p) => p.id === active.id)} shop={shopOf(active)} />
          </div>
        )}
      </DragOverlay>
      {r.saving && <div className="sticky bottom-3 mx-auto mt-2 w-fit rounded-full border border-warn/40 bg-s2 px-4 py-1.5 text-xs font-semibold text-warn shadow-xl">⏳ กำลังบันทึกลำดับ…</div>}
    </DndContext>
  );
}
