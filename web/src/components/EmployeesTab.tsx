import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { deleteEmployee, errMsg, removeAccount, saveEmployee, useAppUsers, useEmployees, useRefreshData, useRoles, type AppUser, type Employee } from '../lib/data';
import AccountModal, { RoleBadge } from './AccountModal';
import { Chip, Empty, ErrorBox, Field, Modal, Spinner, useToast } from './ui';

function UserAvatar({ src, name }: { src: string | null; name: string }) {
  return <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-accent/15 text-sm font-bold text-accent">
    <span>{name.trim().slice(0, 1).toUpperCase() || '?'}</span>
    {src && <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => e.currentTarget.remove()} />}
  </div>;
}

function EmployeeForm({ emp, onClose }: { emp: Employee | null; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshData();
  const [name, setName] = useState(emp?.name ?? '');
  const [position, setPosition] = useState(emp?.position ?? '');
  const [email, setEmail] = useState(emp?.email ?? '');
  const [pronoun, setPronoun] = useState(emp?.pronoun ?? '');
  const [rank, setRank] = useState(emp?.rank ?? '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) { toast('กรุณากรอกชื่อ', 'error'); return; }
    setBusy(true);
    try {
      await saveEmployee(emp?.id ?? null, { name, position, email, pronoun, rank });
      await refresh();
      toast(emp ? 'บันทึกสำเร็จ ✅' : 'เพิ่มพนักงานสำเร็จ ✅');
      onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal title={emp ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'} onClose={onClose}
      footer={<><button className="btn btn-g" onClick={onClose}>ยกเลิก</button><button className="btn btn-p" disabled={busy} onClick={submit}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></>}>
      <Field label="ชื่อ *"><input className="inp" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <Field label="ตำแหน่ง"><input className="inp" value={position} onChange={(e) => setPosition(e.target.value)} /></Field>
      <Field label="อีเมล"><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="สรรพนาม"><input className="inp" value={pronoun} onChange={(e) => setPronoun(e.target.value)} placeholder="เช่น ผม / ดิฉัน" /></Field>
        <Field label="ยศ"><input className="inp" value={rank} onChange={(e) => setRank(e.target.value)} placeholder="เช่น หัวหน้า" /></Field>
      </div>
    </Modal>
  );
}

export default function EmployeesTab() {
  const { can, profile } = useAuth();
  const isAdmin = !!profile?.isAdmin;
  const toast = useToast();
  const refresh = useRefreshData();
  const emps = useEmployees();
  const roles = useRoles();
  const users = useAppUsers(isAdmin);
  const [form, setForm] = useState<Employee | 'new' | null>(null);
  const [acct, setAcct] = useState<{ employee: Employee | null; user: AppUser | null } | null>(null);

  const list = emps.data ?? [];
  const roleList = roles.data ?? [];
  const userList = users.data ?? [];
  const userOf = (e: Employee) => userList.find((u) => u.employeeId === e.id);
  const unlinked = userList.filter((u) => !u.employeeId || !list.some((e) => e.id === u.employeeId));
  const canEdit = can('employees', 'edit');
  const canDel = can('employees', 'delete');

  async function delEmp(e: Employee) {
    const u = userOf(e);
    if (!confirm(`ลบพนักงาน "${e.name}"?${u ? `\nบัญชี "${u.username}" ที่ผูกอยู่จะถูกลบด้วย (ล็อกอินไม่ได้อีก)` : ''}`)) return;
    try { await deleteEmployee(e.id, isAdmin && u ? u.id : null); await refresh(); toast('ลบสำเร็จ'); } catch (err) { toast(errMsg(err), 'error'); }
  }
  async function delAcct(u: AppUser) {
    if (!confirm(`ถอดบัญชี "${u.username}"?\nผู้ใช้นี้จะล็อกอินเข้าระบบไม่ได้อีก (สร้างใหม่ได้ภายหลัง)`)) return;
    try { await removeAccount(u.id); await refresh(); toast('ถอดบัญชีสำเร็จ'); } catch (err) { toast(errMsg(err), 'error'); }
  }

  const loading = emps.isLoading || roles.isLoading;
  const error = emps.error || roles.error || users.error;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-head text-xl font-bold tracking-tight">👥 พนักงาน</h2>
          {can('employees', 'add') && <button className="btn btn-p" onClick={() => setForm('new')}>+ เพิ่มพนักงาน</button>}
        </div>
        {loading ? <Spinner /> : error ? <ErrorBox error={error} /> : !list.length ? <Empty icon="👥" text="ยังไม่มีพนักงาน" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wider text-mute">
                  <th className="w-8 py-2 pl-2">#</th><th>ชื่อ</th><th>ยศ / สรรพนาม</th><th>ตำแหน่ง</th>
                  {isAdmin && <><th>Roles</th><th>Username</th></>}
                  {(canEdit || canDel || isAdmin) && <th />}
                </tr>
              </thead>
              <tbody>
                {list.map((e, i) => {
                  const u = userOf(e);
                  return (
                    <tr key={e.id} className="border-b border-line/60 align-top hover:bg-s2/60">
                      <td className="py-2.5 pl-2 text-faint">{i + 1}</td>
                      <td><div className="flex items-center gap-2.5"><UserAvatar src={u?.avatarUrl ?? null} name={u?.displayName || e.name} /><div><strong>{e.name}</strong>{e.email && <div className="text-xs text-mute">{e.email}</div>}</div></div></td>
                      <td>
                        {e.pronoun && <span className="mr-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">{e.pronoun}</span>}
                        {e.rank && <span className="rounded-md bg-s3 px-2 py-0.5 text-xs text-mute">{e.rank}</span>}
                        {!e.pronoun && !e.rank && <span className="text-faint">—</span>}
                      </td>
                      <td>{e.position || '—'}</td>
                      {isAdmin && <>
                        <td>{u ? u.roles.map((r) => <RoleBadge key={r} role={r} roles={roleList} />) : <span className="text-faint">—</span>}</td>
                        <td>{u ? <code className="rounded bg-s3 px-1.5 py-0.5">{u.username}</code> : <span className="text-faint">—</span>}</td>
                      </>}
                      {(canEdit || canDel || isAdmin) && (
                        <td className="whitespace-nowrap text-right">
                          {canEdit && <button className="btn btn-g !px-2 !py-1 text-xs" title="แก้ไข" onClick={() => setForm(e)}>✏️</button>}
                          {isAdmin && (u
                            ? <><button className="btn btn-g !ml-1 !px-2 !py-1 text-xs" title="แก้ไขบัญชี / สิทธิ์" onClick={() => setAcct({ employee: e, user: u })}>🔐</button>
                                <button className="btn !ml-1 !px-2 !py-1 text-xs bg-warn/15 text-warn hover:bg-warn/25" title="ถอดบัญชี" onClick={() => delAcct(u)}>🔓</button></>
                            : <button className="btn btn-g !ml-1 !px-2 !py-1 text-xs" title="สร้างบัญชี" onClick={() => setAcct({ employee: e, user: null })}>🔐 สร้าง</button>)}
                          {canDel && <button className="btn !ml-1 !px-2 !py-1 text-xs bg-danger/15 text-danger hover:bg-danger/25" title="ลบพนักงาน" onClick={() => delEmp(e)}>🗑️</button>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isAdmin && unlinked.length > 0 && (
        <div className="card">
          <h2 className="mb-1 font-head text-xl font-bold tracking-tight">🔑 บัญชีที่ไม่ได้ผูกกับพนักงาน</h2>
          <p className="mb-3 text-xs text-mute">เช่น บัญชีผู้ดูแลระบบ</p>
          <div className="space-y-2">
            {unlinked.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-s2 transition duration-200 hover:bg-s3 p-3">
                <UserAvatar src={u.avatarUrl} name={u.displayName || u.username} />
                <code className="rounded bg-s3 px-1.5 py-0.5 text-sm">{u.username}</code>
                <span className="text-sm text-mute">{u.displayName}</span>
                <div className="flex-1">{u.roles.map((r) => <RoleBadge key={r} role={r} roles={roleList} />)}</div>
                <button className="btn btn-g !px-2 !py-1 text-xs" onClick={() => setAcct({ employee: null, user: u })}>🔐 แก้ไข</button>
                {u.username !== profile?.username && <button className="btn !px-2 !py-1 text-xs bg-warn/15 text-warn hover:bg-warn/25" onClick={() => delAcct(u)}>🔓 ถอดบัญชี</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && !!userList.length && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
          <Chip tone="shop">ผู้ดูแล</Chip> สร้างบัญชีใหม่ / เปลี่ยน PIN ให้ผู้อื่น: ระบบสร้างคำสั่งให้คัดลอกไปรันบนเครื่องของคุณ (ไม่ต้อง deploy อะไรเพิ่ม)
          <button className="btn btn-g !px-2 !py-1 text-xs" onClick={() => setAcct({ employee: null, user: null })}>+ สร้างบัญชีที่ไม่ผูกพนักงาน</button>
        </div>
      )}

      {form && <EmployeeForm key={form === 'new' ? 'new' : form.id} emp={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {acct && <AccountModal key={acct.user?.id ?? acct.employee?.id ?? 'new'} employee={acct.employee} user={acct.user} roles={roleList} employees={list} onClose={() => setAcct(null)} />}
    </div>
  );
}
