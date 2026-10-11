import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
          <div key={t.id} className={`pointer-events-auto rounded-xl border bg-s2 px-4 py-3 text-sm font-semibold shadow-xl ${color[t.kind]}`}>{t.msg}</div>
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`my-4 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl border border-line bg-surface shadow-2xl sm:my-8`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-head text-base font-bold">{title}</h2>
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
  <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">โหลดข้อมูลล้มเหลว: {(error as Error)?.message ?? String(error)}</div>
);

export function Thumb({ src, className = 'h-16 w-16' }: { src?: string | null; className?: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <div className={`${className} flex shrink-0 items-center justify-center rounded-lg bg-s3 text-2xl`}>🎁</div>;
  return <img src={src} alt="" onError={() => setBad(true)} className={`${className} shrink-0 rounded-lg object-cover`} loading="lazy" />;
}

export const Chip = ({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'ok' | 'low' | 'shop' | 'off' }) => {
  const tones = {
    default: 'bg-s3 text-mute', ok: 'bg-green/15 text-green', low: 'bg-danger/15 text-danger', shop: 'bg-accent/15 text-accent', off: 'bg-danger/10 text-danger',
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
};

/** แถบเลือกแมพ (ชิป) พร้อมจำนวน */
export function MapChips({ maps, counts, total, selected, onSelect }: {
  maps: MapRow[]; counts: Record<string, number>; total: number; selected: string; onSelect: (id: string) => void;
}) {
  const cls = (on: boolean) =>
    `cursor-pointer whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition ${on ? 'border-accent bg-accent/15 text-accent' : 'border-line bg-s2 text-mute hover:text-ink'}`;
  return (
    <div className="flex flex-wrap gap-2">
      <button className={cls(selected === 'all')} onClick={() => onSelect('all')}>🌐 ทั้งหมด <span className="ml-1 text-xs opacity-70">{total}</span></button>
      {maps.map((m) => (
        <button key={m.id} className={cls(selected === m.id)} onClick={() => onSelect(m.id)}>
          {m.icon} {m.name} <span className="ml-1 text-xs opacity-70">{counts[m.id] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

export const SortTabs = <K extends string>({ tabs, value, onChange }: { tabs: [K, string][]; value: K; onChange: (k: K) => void }) => (
  <div className="mb-3 flex flex-wrap gap-2">
    {tabs.map(([k, label]) => (
      <button key={k} onClick={() => onChange(k)}
        className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${value === k ? 'border-accent bg-accent/15 text-accent' : 'border-line bg-s2 text-mute hover:text-ink'}`}>
        {label}
      </button>
    ))}
  </div>
);
