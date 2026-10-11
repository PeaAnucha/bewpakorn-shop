import { useMemo, useState } from 'react';
import { deleteRole, errMsg, saveRole, saveRolePermissions, useAppUsers, usePermRows, useRefreshData, useRoles, type RoleRow } from '../lib/data';
import { ACTION_LABEL, ACTIONS, PAGES, cleanPerms, toggleAction, type Action, type PermMap } from '../lib/perms';
import { roleStyle } from './AccountModal';
import { Empty, ErrorBox, Field, Modal, Spinner, useToast } from './ui';

function RoleForm({ role, onClose }: { role: RoleRow | null; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshData();
  const [name, setName] = useState(role?.name ?? '');
  const [label, setLabel] = useState(role?.label ?? '');
  const [color, setColor] = useState(role?.color ?? '#8a8ab8');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || !label.trim()) { toast('กรุณากรอกให้ครบ', 'error'); return; }
    setBusy(true);
    try {
      await saveRole(role?.id ?? null, { name, label, color });
      await refresh();
      toast(role ? 'บันทึกสำเร็จ ✅' : 'เพิ่ม Role สำเร็จ ✅');
      onClose();
    } catch (e) { toast(errMsg(e).includes('ซ้ำ') ? 'Role นี้มีอยู่แล้ว' : errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal title={role ? `แก้ไข Role: ${role.name}` : 'เพิ่ม Role'} onClose={onClose}
      footer={<><button className="btn btn-g" onClick={onClose}>ยกเลิก</button><button className="btn btn-p" disabled={busy} onClick={submit}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></>}>
      <Field label="ชื่อ (ใช้ภายใน) *" hint={role ? 'เปลี่ยนชื่อภายในไม่ได้ เพราะผู้ใช้อ้างอิงอยู่' : 'ตัวพิมพ์เล็ก เว้นวรรคจะกลายเป็น _'}>
        <input className="inp" value={name} onChange={(e) => setName(e.target.value)} readOnly={!!role} autoFocus={!role} />
      </Field>
      <Field label="ชื่อที่แสดง *"><input className="inp" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus={!!role} /></Field>
      <Field label="สี"><input className="h-10 w-20 cursor-pointer rounded border border-line bg-s2" type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
    </Modal>
  );
}

export default function RolesTab() {
  const toast = useToast();
  const refresh = useRefreshData();
  const roles = useRoles();
  const users = useAppUsers(true);
  const perms = usePermRows(true);
  const [form, setForm] = useState<RoleRow | 'new' | null>(null);
  const [role, setRole] = useState('');
  const [draft, setDraft] = useState<PermMap | null>(null);
  const [saving, setSaving] = useState(false);

  const roleList = roles.data ?? [];
  const editable = roleList.filter((r) => r.name !== 'admin');
  const current = role && editable.some((r) => r.name === role) ? role : editable[0]?.name ?? '';

  const saved = useMemo<PermMap>(() => {
    const m: PermMap = {};
    for (const p of perms.data ?? []) if (p.role === current) m[p.page] = p.actions as Action[];
    return cleanPerms(m);
  }, [perms.data, current]);
  const shown = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(cleanPerms(draft)) !== JSON.stringify(saved);
  const usersOf = (name: string) => (users.data ?? []).filter((u) => u.roles.includes(name)).length;

  async function save() {
    setSaving(true);
    try {
      await saveRolePermissions(current, cleanPerms(shown));
      await refresh();
      setDraft(null);
      toast('บันทึกสิทธิ์สำเร็จ ✅');
    } catch (e) { toast(errMsg(e), 'error'); } finally { setSaving(false); }
  }
  async function remove(r: RoleRow) {
    if (!confirm(`ลบ Role "${r.label}"?`)) return;
    try { await deleteRole(r.id); await refresh(); toast('ลบ Role สำเร็จ'); } catch (e) { toast(errMsg(e), 'error'); }
  }

  if (roles.isLoading) return <Spinner />;
  if (roles.error) return <ErrorBox error={roles.error} />;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-head text-base font-bold">🏷️ Roles</h2>
          <button className="btn btn-p" onClick={() => setForm('new')}>+ เพิ่ม Role</button>
        </div>
        {!roleList.length ? <Empty icon="🏷️" text="ยังไม่มี Role" /> : (
          <div className="space-y-2">
            {roleList.map((r) => {
              const n = usersOf(r.name);
              const builtin = r.name === 'admin' || r.name === 'staff';
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-s2/60 p-3">
                  <span className="rounded-md px-2.5 py-1 text-sm font-bold" style={roleStyle(r.color)}>{r.label}</span>
                  <code className="rounded bg-s3 px-1.5 py-0.5 text-xs text-mute">{r.name}</code>
                  <span className="flex-1 text-xs text-mute">{n} ผู้ใช้{r.name === 'admin' && ' · มีสิทธิ์ทั้งหมดเสมอ'}</span>
                  <button className="btn btn-g !px-2 !py-1 text-xs" onClick={() => setForm(r)}>✏️</button>
                  <button className="btn !px-2 !py-1 text-xs bg-danger/15 text-danger hover:bg-danger/25 disabled:opacity-30" disabled={builtin || n > 0}
                    title={builtin ? 'Role ในระบบ ลบไม่ได้' : n > 0 ? 'ยังมีผู้ใช้อยู่ ลบไม่ได้' : 'ลบ'} onClick={() => remove(r)}>🗑️</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="font-head text-base font-bold">🔐 สิทธิ์ของ Role</h2>
          <select className="inp !w-auto min-w-[180px]" value={current} onChange={(e) => { setRole(e.target.value); setDraft(null); }}>
            {editable.map((r) => <option key={r.id} value={r.name}>{r.label || r.name}</option>)}
          </select>
        </div>
        {perms.isLoading ? <Spinner /> : perms.error ? <ErrorBox error={perms.error} /> : !current ? <Empty icon="🔐" text="ยังไม่มี Role ให้ตั้งสิทธิ์" /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-center text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wider text-mute">
                    <th className="py-2 text-left">หน้า / สิทธิ์</th>{ACTIONS.map((a) => <th key={a}>{ACTION_LABEL[a]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {PAGES.map((pg) => (
                    <tr key={pg.key} className="border-b border-line/60">
                      <td className="py-2.5 text-left">
                        <div className="font-semibold">{pg.label}</div>
                        {pg.note && <div className="text-xs text-faint">{pg.note}</div>}
                      </td>
                      {ACTIONS.map((a) => (
                        <td key={a}>
                          {pg.actions.includes(a)
                            ? <input type="checkbox" className="h-4 w-4 cursor-pointer accent-emerald-500" aria-label={`${pg.key}:${a}`}
                                checked={(shown[pg.key] ?? []).includes(a)} onChange={(e) => setDraft(toggleAction(shown, pg.key, a, e.target.checked))} />
                            : <span className="text-faint">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-faint">* Admin มีสิทธิ์ทั้งหมดเสมอ แก้ไขไม่ได้ · ติ๊กสิทธิ์อื่นแล้ว "ดู" จะถูกติ๊กให้อัตโนมัติ · ผู้ใช้ต้องล็อกอินใหม่เพื่อให้สิทธิ์ใหม่มีผล</p>
            <div className="mt-3 flex items-center gap-2">
              <button className="btn btn-p" disabled={!dirty || saving} onClick={save}>{saving ? 'กำลังบันทึก…' : '💾 บันทึกสิทธิ์'}</button>
              {dirty && <><button className="btn btn-g" onClick={() => setDraft(null)}>↩️ ยกเลิกการแก้ไข</button><span className="text-xs font-semibold text-warn">มีการแก้ไขที่ยังไม่บันทึก</span></>}
            </div>
          </>
        )}
      </div>
      {form && <RoleForm key={form === 'new' ? 'new' : form.id} role={form === 'new' ? null : form} onClose={() => setForm(null)} />}
    </div>
  );
}
