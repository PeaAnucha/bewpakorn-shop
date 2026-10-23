import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useMaps, useProducts, useStockHistory } from '../lib/data';
import { fmtNum } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { StockHistoryEntry } from '../lib/types';

const TABLES = [
  { table: 'products', label: 'สินค้า', icon: '📦' },
  { table: 'shop_ids', label: 'ไอดีร้าน', icon: '🔑' },
  { table: 'maps', label: 'แมพ', icon: '🗺️' },
  { table: 'employees', label: 'พนักงาน', icon: '👥' },
] as const;

function Stat({ table, label, icon }: (typeof TABLES)[number]) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['count', table],
    queryFn: async () => {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  return (
    <div className="card">
      <div className="text-2xl">{icon}</div>
      <div className="mt-1 font-head text-3xl font-extrabold text-accent">{isLoading ? '…' : error ? '—' : data}</div>
      <div className="text-sm text-mute">{label}</div>
    </div>
  );
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

function StockDelta({ entry }: { entry: StockHistoryEntry }) {
  if (entry.oldStock === null) return <span className="text-green">เพิ่มสินค้า · {fmtNum(entry.newStock ?? 0)} ชิ้น</span>;
  if (entry.newStock === null) return <span className="text-danger">ลบสินค้า · เดิม {fmtNum(entry.oldStock)} ชิ้น</span>;
  const delta = entry.newStock - entry.oldStock;
  return <span className={delta > 0 ? 'text-sky-200' : 'text-orange'}>{fmtNum(entry.oldStock)} → {fmtNum(entry.newStock)} ({delta > 0 ? '+' : ''}{fmtNum(delta)})</span>;
}

export default function Dashboard() {
  const { can } = useAuth();
  const canViewProducts = can('products', 'view');
  const canViewMaps = can('maps', 'view');
  const canViewHistory = can('history', 'view');
  const products = useProducts(canViewProducts);
  const maps = useMaps(canViewProducts && canViewMaps);
  const history = useStockHistory(canViewProducts);

  const lowStock = useMemo(
    () => (products.data ?? []).filter((p) => p.status === 'active' && p.stock <= 5).sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name)).slice(0, 8),
    [products.data],
  );
  const movements = useMemo(() => {
    const grouped = new Map<string, { itemType: StockHistoryEntry['itemType']; itemId: string; itemName: string; amount: number; changes: number; latest: string }>();
    for (const entry of history.data ?? []) {
      if (entry.action !== 'updated' || entry.oldStock === null || entry.newStock === null || entry.oldStock === entry.newStock) continue;
      const key = `${entry.itemType}:${entry.itemId}`;
      const current = grouped.get(key) ?? { itemType: entry.itemType, itemId: entry.itemId, itemName: entry.itemName, amount: 0, changes: 0, latest: entry.createdAt };
      current.amount += Math.abs(entry.newStock - entry.oldStock);
      current.changes += 1;
      if (entry.createdAt > current.latest) current.latest = entry.createdAt;
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((a, b) => b.amount - a.amount || b.latest.localeCompare(a.latest)).slice(0, 5);
  }, [history.data]);
  const recent = history.data?.slice(0, 8) ?? [];

  return (
    <div>
      <h1 className="mb-4 font-head text-3xl font-bold tracking-tight text-white">📊 แดชบอร์ด</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {TABLES.map((t) => <Stat key={t.table} {...t} />)}
      </div>

      {canViewProducts && <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="card !p-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="font-head text-lg font-bold text-white">🕘 รายการเปลี่ยนสต็อกล่าสุด</h2>
              <p className="text-xs text-mute">แสดงประวัติย้อนหลัง 3 วัน</p>
            </div>
            {canViewHistory && <Link to="/history" className="text-xs font-semibold text-sky-200 hover:text-white">ดูประวัติทั้งหมด →</Link>}
          </div>
          {history.isLoading ? <div className="p-4 text-sm text-mute">กำลังโหลดประวัติ…</div>
            : history.error ? <div className="p-4 text-sm text-danger">โหลดประวัติไม่ได้</div>
              : recent.length === 0 ? <div className="p-4 text-sm text-mute">ยังไม่มีการเปลี่ยนสต็อกในช่วงนี้</div>
                : <div className="max-h-96 overflow-y-auto px-4">
                  {recent.map((entry) => {
                    const product = entry.itemType === 'product' ? products.data?.find((p) => p.id === entry.itemId) : undefined;
                    const map = product?.mapId ? maps.data?.find((m) => m.id === product.mapId) : undefined;
                    return <div key={entry.id} className="grid gap-x-3 gap-y-1 border-b border-line/60 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-white">{entry.itemType === 'ghost' ? '👻 ' : '📦 '}{entry.itemName}{map && <span className="ml-2 text-xs font-normal text-teal-200">{map.icon} {map.name}</span>}</div>
                        <div className="mt-0.5 text-xs text-mute">{timeLabel(entry.createdAt)} · {entry.actorUsername ?? 'ไม่ระบุผู้ใช้'}</div>
                      </div>
                      <div className="text-sm font-semibold tabular-nums"><StockDelta entry={entry} /></div>
                    </div>;
                  })}
                </div>}
        </section>

        <div className="grid content-start gap-4">
          <section className="card !p-0">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h2 className="font-head text-lg font-bold text-white">⚠️ สินค้าใกล้หมด</h2>
                <p className="text-xs text-mute">สต็อกเหลือ 5 ชิ้นหรือน้อยกว่า</p>
              </div>
              <Link to="/products" className="text-xs font-semibold text-sky-200 hover:text-white">ไปหน้าสินค้า →</Link>
            </div>
            {products.isLoading ? <div className="p-4 text-sm text-mute">กำลังโหลดสินค้า…</div>
              : products.error ? <div className="p-4 text-sm text-danger">โหลดสินค้าไม่ได้</div>
                : lowStock.length === 0 ? <div className="p-4 text-sm text-mute">ไม่มีสินค้าใกล้หมด 🎉</div>
                  : <div className="divide-y divide-line/60 px-4">
                    {lowStock.map((p) => {
                      const map = p.mapId ? maps.data?.find((m) => m.id === p.mapId) : undefined;
                      return <Link key={p.id} to="/products" className="flex items-center justify-between gap-3 py-2.5 hover:text-white">
                        <span className="min-w-0 truncate font-medium text-ink">{p.name}{map && <span className="ml-2 text-xs text-teal-200">{map.icon} {map.name}</span>}</span>
                        <span className={`shrink-0 rounded-md px-2 py-1 font-head text-sm font-extrabold tabular-nums ${p.stock === 0 ? 'bg-danger/15 text-danger' : 'bg-orange/15 text-orange'}`}>{fmtNum(p.stock)} ชิ้น</span>
                      </Link>;
                    })}
                  </div>}
          </section>

          <section className="card !p-0">
            <div className="border-b border-line px-4 py-3">
              <h2 className="font-head text-lg font-bold text-white">🔄 สินค้าที่มีการเคลื่อนไหวมากที่สุด</h2>
              <p className="text-xs text-mute">รวมจำนวนที่เพิ่ม/ลดจริงใน 3 วันล่าสุด · ไม่นับยอดที่ไม่เปลี่ยน</p>
            </div>
            {history.isLoading ? <div className="p-4 text-sm text-mute">กำลังคำนวณ…</div>
              : history.error ? <div className="p-4 text-sm text-danger">โหลดประวัติไม่ได้</div>
                : movements.length === 0 ? <div className="p-4 text-sm text-mute">ยังไม่มีการเปลี่ยนจำนวนจริงในช่วงนี้</div>
                  : <div className="divide-y divide-line/60 px-4">
                    {movements.map((item, i) => <div key={`${item.itemType}:${item.itemId}`} className="flex items-center gap-3 py-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-400/10 text-xs font-bold text-teal-200">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-white">{item.itemType === 'ghost' ? '👻 ' : '📦 '}{item.itemName}<span className="ml-2 text-xs font-normal text-mute">เปลี่ยน {item.changes} ครั้ง</span></span>
                      <span className="shrink-0 font-head font-bold tabular-nums text-sky-200">{fmtNum(item.amount)} ชิ้น</span>
                    </div>)}
                  </div>}
          </section>
        </div>
      </div>}
    </div>
  );
}
