export const fmtNum = (v: unknown): string => {
  const n = Number(String(v ?? 0).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.trunc(n).toLocaleString('en-US') : '0';
};

export const fmtDateTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

/** ดาวน์โหลด CSV (มี BOM เพื่อให้ Excel อ่านภาษาไทยได้) */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (c: string | number) => `"${String(c ?? '').replace(/"/g, '""')}"`;
  const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const today = () => new Date().toISOString().slice(0, 10);
