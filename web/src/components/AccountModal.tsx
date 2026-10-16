import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { errMsg, saveAccount, useRefreshData, type AppUser, type Employee, type RoleRow } from '../lib/data';
import { userSetCommand } from '../lib/cmd';
import { Field, Modal, useToast } from './ui';

export const roleStyle = (color: string | null) => ({ background: `${color || '#7c6fff'}26`, color: color || '#7c6fff' });

export const RoleBadge = ({ role, roles }: { role: string; roles: RoleRow[] }) => {
  const r = roles.find((x) => x.name === role);
  return <span className="mr-1 inline-block rounded-md px-2 py-0.5 text-xs font-bold" style={roleStyle(r?.color ?? null)}>{r?.label || role}</span>;
};

/** กล่องคำสั่งพร้อมคัดลอก: การสร้างบัญชี/ตั้ง PIN ให้คนอื่นต้องรันบนเครื่องผู้ดูแล (ใช้ secret key) */
function CommandBox({ cmd }: { cmd: string }) {
  const toast = useToast();
  async function copy() {
    try { await navigator.clipboard.writeText(cmd); toast('คัดลอกคำสั่งแล้ว ✅'); } catch { toast('คัดลอกไม่ได้ ให้เลือกข้อความแล้วคัดลอกเอง', 'error'); }
  }
  return (
    <div className="mt-3 rounded-lg border border-accent/30 bg-accent/10 p-3">
      <div className="mb-1.5 text-xs font-bold text-accent">คำสั่งสำหรับรันบนเครื่องคุณ</div>
      <pre className="whitespace-pre-wrap break-all rounded bg-bg p-2 font-mono text-xs text-ink">{cmd}</pre>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-mute">เปิด terminal ในโฟลเดอร์หลักของโปรเจค (ที่มีไฟล์ .env) แล้ววางคำสั่งนี้</span>
        <button className="btn btn-g shrink-0 text-xs" onClick={copy}>📋 คัดลอก</button>
      </div>
    </div>
  );
}

export default function AccountModal({ employee, user, roles, employees, onClose }: {
  employee: Employee | null; user: AppUser | null; roles: RoleRow[]; employees: Employee[]; onClose: () => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const refresh = useRefreshData();
  const editing = !!user;
  const [username, setUsername] = useState(user?.username ?? '');
  const [pin, setPin] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName ?? employee?.name ?? '');
  const [empId, setEmpId] = useState(user?.employeeId ?? employee?.id ?? '');
  const [sel, setSel] = useState<string[]>(user?.roles ?? (roles.some((r) => r.name === 'staff') ? ['staff'] : []));
  const [busy, setBusy] = useState(false);
  const [showCmd, setShowCmd] = useState(false);

  const toggle = (name: string) => setSel((l) => (l.includes(name) ? l.filter((x) => x !== name) : [...l, name]));
  const isSelf = !!user && user.username === profile?.username;

  const cmd = useMemo(() => {
    if (editing && !pin) return null;
    return userSetCommand({ username, pin: pin || undefined, roles: editing ? undefined : sel, employeeId: editing ? undefined : empId || null, displayName: editing ? undefined : displayName });
  }, [editing, username, pin, sel, empId, displayName]);

  async function save() {
    if (!sel.length) { toast('กรุณาเลือกอย่างน้อย 1 Role', 'error'); return; }
    setBusy(true);
    try {
      await saveAccount(user!.id, { roles: sel, displayName, employeeId: empId });
      await refresh();
      toast('บันทึกสำเร็จ ✅');
      if (pin) setShowCmd(true); else onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  const chips = (
    <Field label="Roles">
      <div className="flex flex-wrap gap-2">
        {roles.map((r) => {
          const on = sel.includes(r.name);
          return (
            <button key={r.id} type="button" onClick={() => toggle(r.name)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-bold transition ${on ? '' : 'border-line bg-s2 text-mute opacity-70 hover:opacity-100'}`}
              style={on ? { ...roleStyle(r.color), borderColor: r.color || '#7c6fff' } : undefined}>
              {on ? '✓ ' : ''}{r.label}
            </button>
          );
        })}
      </div>
    </Field>
  );

  return (
    <Modal wide title={editing ? `แก้ไขบัญชี: ${user!.username}` : `สร้างบัญชี${employee ? `: ${employee.name}` : ''}`} onClose={onClose}
      footer={editing
        ? <><button className="btn btn-g" onClick={onClose}>ปิด</button><button className="btn btn-p" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></>
        : <><button className="btn btn-g" onClick={onClose}>ปิด</button><button className="btn btn-p" onClick={() => setShowCmd(true)}>สร้างคำสั่ง</button></>}>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Username *"><input className="inp" value={username} onChange={(e) => { setUsername(e.target.value); setShowCmd(false); }} readOnly={editing} autoFocus={!editing} /></Field>
        <Field label={editing ? 'PIN ใหม่ (เว้นว่าง = ไม่เปลี่ยน)' : 'PIN * (อย่างน้อย 6 ตัวอักษร)'}>
          <input className="inp" value={pin} onChange={(e) => { setPin(e.target.value); setShowCmd(false); }} autoComplete="off" />
        </Field>
        <Field label="ชื่อที่แสดง"><input className="inp" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setShowCmd(false); }} /></Field>
        <Field label="พนักงานที่ผูก">
          <select className="inp" value={empId} onChange={(e) => { setEmpId(e.target.value); setShowCmd(false); }}>
            <option value="">— ไม่ผูก —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
      </div>
      {chips}
      {isSelf && <p className="text-xs text-warn">นี่คือบัญชีของคุณเอง ระบบไม่อนุญาตให้ถอดสิทธิ์ admin ของตัวเอง</p>}
      {editing
        ? <p className="text-xs text-mute">การเปลี่ยน Role / ชื่อ / พนักงานที่ผูก บันทึกจากหน้านี้ได้ทันที ส่วนการเปลี่ยน PIN ของคนอื่นต้องรันคำสั่งบนเครื่องคุณ (กรอก PIN ใหม่ แล้วกดบันทึก จะแสดงคำสั่ง)</p>
        : <p className="text-xs text-mute">การสร้างบัญชีใหม่ต้องใช้กุญแจ admin ของ Supabase ซึ่งห้ามอยู่ในหน้าเว็บ ระบบจึงสร้างคำสั่งให้คุณคัดลอกไปรันบนเครื่องตัวเอง</p>}
      {showCmd && (cmd ? (cmd.ok ? <CommandBox cmd={cmd.cmd} /> : <p className="mt-3 text-sm text-danger">{cmd.error}</p>) : null)}
    </Modal>
  );
}
