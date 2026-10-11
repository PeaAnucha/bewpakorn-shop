// สร้างคำสั่ง `npm run user:set` ให้ผู้ดูแลคัดลอกไปรันในเครื่อง (การสร้างบัญชี/ตั้ง PIN ให้คนอื่นต้องใช้ secret key ซึ่งห้ามอยู่ในหน้าเว็บ)

// ห้ามอักขระที่ทำให้คำสั่งถูกตีความผิดใน cmd/PowerShell/bash
const UNSAFE = /["'`$%\\\r\n]/;

export interface UserSetInput { username: string; pin?: string; roles?: string[]; employeeId?: string | null; displayName?: string }

export function userSetCommand(o: UserSetInput): { ok: true; cmd: string } | { ok: false; error: string } {
  const fields: [string, string | undefined][] = [
    ['username', o.username], ['PIN', o.pin], ['Role', o.roles?.join(',')], ['รหัสพนักงาน', o.employeeId ?? undefined], ['ชื่อที่แสดง', o.displayName],
  ];
  for (const [label, v] of fields) if (v !== undefined && UNSAFE.test(v)) return { ok: false, error: `${label} มีอักขระที่ใช้ในคำสั่งไม่ได้ (เครื่องหมายคำพูด ` + "` $ % \\" + ')' };
  if (!o.username.trim()) return { ok: false, error: 'กรุณากรอก username' };
  if (o.pin !== undefined && o.pin.trim().length < 6) return { ok: false, error: 'PIN ต้องมีอย่างน้อย 6 ตัวอักษร' };
  const q = (s: string) => `"${s.trim()}"`;
  const parts = ['npm run user:set --', q(o.username)];
  if (o.pin !== undefined && o.pin.trim() !== '') parts.push(q(o.pin));
  if (o.roles?.length) parts.push('--roles', q(o.roles.join(',')));
  if (o.employeeId) parts.push('--employee', q(o.employeeId));
  if (o.displayName?.trim()) parts.push('--name', q(o.displayName));
  return { ok: true, cmd: parts.join(' ') };
}
