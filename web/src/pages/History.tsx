import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStockHistory } from '../lib/data';
import { fmtNum } from '../lib/format';
import type { StockHistoryEntry } from '../lib/types';

type ActionFilter = 'all' | StockHistoryEntry['action'];
type PeriodPreset = 'today' | 'yesterday' | 'three-days' | 'custom';
type ItemTypeFilter = 'all' | StockHistoryEntry['itemType'];
const UNKNOWN_ACTOR = '__unknown_actor__';

function bangkokDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function offsetDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

function changeLabel(entry: StockHistoryEntry) {
  if (entry.action === 'created' || entry.oldStock === null) return <span className="text-green">เพิ่มสินค้า · {fmtNum(entry.newStock ?? 0)} ชิ้น</span>;
  if (entry.action === 'deleted' || entry.newStock === null) return <span className="text-danger">ลบสินค้า · เดิม {fmtNum(entry.oldStock)} ชิ้น</span>;
  const delta = entry.newStock - entry.oldStock;
  return <span className={delta > 0 ? 'text-sky-200' : delta < 0 ? 'text-orange' : 'text-mute'}>{fmtNum(entry.oldStock)} → {fmtNum(entry.newStock)}{delta !== 0 && ` (${delta > 0 ? '+' : ''}${fmtNum(delta)})`}</span>;
}

export default function HistoryPage() {
  const history = useStockHistory(true, true);
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<ActionFilter>('all');
  const [itemType, setItemType] = useState<ItemTypeFilter>('all');
  const [actor, setActor] = useState('');
  const today = bangkokDateKey(new Date());
  const earliestDate = offsetDate(today, -2);
  const [startDate, setStartDate] = useState(() => offsetDate(bangkokDateKey(new Date()), -2));
  const [endDate, setEndDate] = useState(() => bangkokDateKey(new Date()));
  const preset: PeriodPreset = startDate === today && endDate === today ? 'today'
    : startDate === offsetDate(today, -1) && endDate === offsetDate(today, -1) ? 'yesterday'
      : startDate === earliestDate && endDate === today ? 'three-days' : 'custom';

  const selectPreset = (value: Exclude<PeriodPreset, 'custom'>) => {
    if (value === 'today') { setStartDate(today); setEndDate(today); }
    else if (value === 'yesterday') { const yesterday = offsetDate(today, -1); setStartDate(yesterday); setEndDate(yesterday); }
    else { setStartDate(earliestDate); setEndDate(today); }
  };
  const actors = useMemo(() => [...new Set((history.data ?? []).map((entry) => entry.actorUsername).filter((name): name is string => !!name))]
    .sort((a, b) => a.localeCompare(b, 'th')), [history.data]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (history.data ?? []).filter((entry) => {
      const matchesQuery = !needle || [entry.itemName, entry.itemId, entry.actorUsername ?? '', entry.itemType === 'ghost' ? 'ghost ผี' : 'สินค้า product']
        .some((value) => value.toLocaleLowerCase().includes(needle));
      const date = bangkokDateKey(new Date(entry.createdAt));
      const matchesActor = actor === '' || (actor === UNKNOWN_ACTOR ? !entry.actorUsername : entry.actorUsername === actor);
      return matchesQuery && date >= startDate && date <= endDate
        && (action === 'all' || entry.action === action)
        && (itemType === 'all' || entry.itemType === itemType)
        && matchesActor;
    });
  }, [history.data, query, action, itemType, actor, startDate, endDate]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-head text-3xl font-bold tracking-tight text-white">🕘 ประวัติเปลี่ยนสต็อก</h1>
          <p className="mt-1 text-sm text-mute">ค้นหาชื่อสินค้า ไอดีสินค้า หรือผู้แก้ไข · เก็บประวัติย้อนหลัง 3 วัน</p>
        </div>
        <Link to="/stockcount" className="btn btn-g btn-sm">ไปหน้านับสต็อก →</Link>
      </div>

      <section className="card !p-0">
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_12rem_14rem]">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">ค้นหาประวัติ</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">🔍</span>
            <input className="inp w-full pl-10" placeholder="ค้นหาชื่อสินค้า, ไอดี หรือผู้แก้ไข…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select className="inp sm:w-52" aria-label="กรองประเภทประวัติ" value={action} onChange={(event) => setAction(event.target.value as ActionFilter)}>
            <option value="all">ทุกประเภท</option>
            <option value="created">เพิ่มสินค้า</option>
            <option value="updated">แก้ไขสต็อก</option>
            <option value="deleted">ลบสินค้า</option>
          </select>
          <select className="inp" aria-label="กรองชนิดสินค้า" value={itemType} onChange={(event) => setItemType(event.target.value as ItemTypeFilter)}>
            <option value="all">สินค้าและ Ghost</option>
            <option value="product">📦 สินค้า</option>
            <option value="ghost">👻 Ghost</option>
          </select>
          <select className="inp" aria-label="กรองผู้แก้ไข" value={actor} onChange={(event) => setActor(event.target.value)}>
            <option value="">ผู้แก้ไขทุกคน</option>
            {actors.map((name) => <option key={name} value={name}>{name}</option>)}
            {(history.data ?? []).some((entry) => !entry.actorUsername) && <option value={UNKNOWN_ACTOR}>ไม่ระบุผู้ใช้</option>}
          </select>
        </div>
        <div className="border-b border-line/70 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-bold text-mute">ช่วงเวลา</span>
            {([
              ['today', 'วันนี้'],
              ['yesterday', 'เมื่อวาน'],
              ['three-days', '3 วันล่าสุด'],
            ] as const).map(([value, label]) => <button key={value} type="button" className={`btn btn-sm ${preset === value ? 'btn-p' : 'btn-g'}`} aria-pressed={preset === value} onClick={() => selectPreset(value)}>{label}</button>)}
            {preset === 'custom' && <span className="text-xs font-semibold text-sky-200">กำหนดเอง</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2 text-mute">ตั้งแต่
              <input className="inp !w-auto" type="date" aria-label="วันที่เริ่มต้น" min={earliestDate} max={today} value={startDate}
                onChange={(event) => { const value = event.target.value; setStartDate(value); if (value > endDate) setEndDate(value); }} />
            </label>
            <span className="text-mute">ถึง</span>
            <label className="sr-only" htmlFor="history-end-date">วันที่สิ้นสุด</label>
            <input id="history-end-date" className="inp !w-auto" type="date" aria-label="วันที่สิ้นสุด" min={startDate} max={today} value={endDate}
              onChange={(event) => setEndDate(event.target.value)} />
          </div>
        </div>
        <div className="border-b border-line/70 px-4 py-2 text-xs text-mute">พบ {filtered.length} จาก {history.data?.length ?? 0} รายการ</div>
        {history.isLoading ? <div className="p-5 text-sm text-mute">กำลังโหลดประวัติ…</div>
          : history.error ? <div className="p-5 text-sm text-danger">โหลดประวัติไม่ได้</div>
            : filtered.length === 0 ? <div className="p-8 text-center text-sm text-mute">{history.data?.length ? 'ไม่พบประวัติที่ตรงกับคำค้น' : 'ยังไม่มีประวัติในช่วง 3 วันที่ผ่านมา'}</div>
              : <div className="divide-y divide-line/60 px-4">
                {filtered.map((entry) => <article key={entry.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-white">{entry.itemType === 'ghost' ? '👻 ' : '📦 '}{entry.itemName}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-mute">
                      <time>{timeLabel(entry.createdAt)}</time>
                      <span>ผู้แก้ไข: {entry.actorUsername ?? 'ไม่ระบุผู้ใช้'}</span>
                      <span className="font-mono text-faint">ID: {entry.itemId}</span>
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">{changeLabel(entry)}</div>
                </article>)}
              </div>}
      </section>
    </div>
  );
}
