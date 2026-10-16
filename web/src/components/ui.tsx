import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { MapRow } from '../lib/types';

// ───────── Toast ─────────
type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; msg: string; kind: ToastKind }
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((msg: string, kind: ToastKind = 'success') => {
    const id = ++seq.current;
    setItems((l) => [...l, { id, msg, kind }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === 'error' ? 5000 : 2800);
  }, []);
  const color = { success: 'border-green/50 text-green', error: 'border-danger/50 text-danger', info: 'border-info/50 text-info' };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex max-w-[90vw] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto rounded-lg border bg-s2 px-4 py-3 text-sm font-semibold shadow-xl ${color[t.kind]}`}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ───────── Modal ─────────
export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`my-auto w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-lg bg-s3 shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-head text-xl font-bold tracking-tight">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-mute hover:bg-s2 hover:text-ink" aria-label="ปิด">✕</button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

// ───────── อื่นๆ ─────────
export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="mb-3.5 block">
    <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-mute">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
  </label>
);

export const Spinner = () => (
  <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" /></div>
);

export const Empty = ({ icon, text }: { icon: string; text: string }) => (
  <div className="py-12 text-center text-mute"><div className="mb-2 text-4xl">{icon}</div><p>{text}</p></div>
);

export const ErrorBox = ({ error }: { error: unknown }) => (
  <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">โหลดข้อมูลล้มเหลว: {(error as Error)?.message ?? String(error)}</div>
);

export function Thumb({ src, className = 'h-16 w-16' }: { src?: string | null; className?: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <div className={`${className} flex shrink-0 items-center justify-center rounded-lg bg-s3 text-2xl`}>🎁</div>;
  return <img src={src} alt="" onError={() => setBad(true)} className={`${className} shrink-0 rounded-lg object-cover`} loading="lazy" />;
}

export const Chip = ({ children, tone = 'default', className = '' }: { children: ReactNode; tone?: 'default' | 'ok' | 'low' | 'shop' | 'off' | 'id' | 'map'; className?: string }) => {
  const tones = {
    default: 'bg-s3 text-mute', ok: 'bg-green/15 text-green', low: 'bg-danger/15 text-danger', shop: 'bg-accent/15 text-accent', off: 'bg-danger/10 text-danger',
    id: 'border border-sky-300/25 bg-sky-400/15 font-mono text-sky-200',
    map: 'border border-amber-300/25 bg-amber-400/15 text-amber-200',
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>{children}</span>;
};

/**
 * แถบเลือกแมพ (ชิป) พร้อมจำนวน: ปกติแสดงแถวเดียว ถ้าชิปเกินแถวจะมีปุ่ม "ดูทั้งหมด" กางทุกอันออกมา
 * (ไม่ใช้การเลื่อนแนวนอนที่ซ่อนแถบเลื่อน เพราะเมาส์เลื่อนไม่ได้)
 */
export function MapChips({ maps, counts, total, selected, onSelect }: {
  maps: MapRow[]; counts: Record<string, number>; total: number; selected: string; onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [rowH, setRowH] = useState(36);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) return;
      setRowH(first.offsetHeight);
      setOverflow(el.scrollHeight > first.offsetHeight + 4);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maps.length, total]);

  const cls = (on: boolean) =>
    `cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition duration-200 ${on ? 'bg-accent text-black' : 'bg-amber-400/10 text-amber-200 ring-1 ring-amber-300/20 hover:bg-amber-400/20'}`;
  const count = (n: number, on: boolean) => <span className={`ml-1 text-xs ${on ? 'opacity-70' : 'text-mute'}`}>{n}</span>;
  return (
    <div className="flex items-start gap-2">
      <div ref={ref} className="flex min-w-0 flex-1 flex-wrap gap-2 overflow-hidden" style={expanded ? undefined : { maxHeight: rowH }}>
        <button className={cls(selected === 'all')} onClick={() => onSelect('all')}>ทั้งหมด{count(total, selected === 'all')}</button>
        {maps.map((m) => (
          <button key={m.id} className={cls(selected === m.id)} onClick={() => onSelect(m.id)}>
            {m.icon} {m.name}{count(counts[m.id] ?? 0, selected === m.id)}
          </button>
        ))}
      </div>
      {(overflow || expanded) && (
        <button className="btn btn-g btn-sm shrink-0 !normal-case" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'ย่อ ▴' : `ดูทั้งหมด (${maps.length + 1}) ▾`}
        </button>
      )}
    </div>
  );
}

/** เมนูเพิ่มเติม (⋯) สำหรับการกระทำที่ไม่ใช้บ่อย เพื่อไม่ให้หน้าจอรก */
export function Menu({ items }: { items: { key: string; label: string; onClick: () => void; hidden?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const visible = items.filter((i) => !i.hidden);
  if (!visible.length) return null;
  return (
    <div ref={ref} className="relative">
      <button className="btn btn-g btn-sm !px-3" aria-haspopup="menu" aria-expanded={open} aria-label="เมนูเพิ่มเติม" onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 min-w-[210px] overflow-hidden rounded-lg bg-s3 py-1 shadow-xl shadow-black/60">
          {visible.map((i) => (
            <button key={i.key} role="menuitem" className="block w-full px-4 py-2.5 text-left text-sm transition hover:bg-s4" onClick={() => { setOpen(false); i.onClick(); }}>{i.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export const SortTabs = <K extends string>({ tabs, value, onChange }: { tabs: [K, string][]; value: K; onChange: (k: K) => void }) => (
  <div className="mb-3 flex flex-wrap gap-2">
    {tabs.map(([k, label]) => (
      <button key={k} onClick={() => onChange(k)}
        className={`rounded-full px-3 py-1.5 text-xs font-medium transition duration-200 ${value === k ? 'bg-accent text-black' : 'bg-s2 text-white hover:bg-s3'}`}>
        {label}
      </button>
    ))}
  </div>
);
