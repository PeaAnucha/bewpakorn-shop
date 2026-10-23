import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { errMsg, saveMyAvatarUrl } from '../lib/data';
import { Field, Modal, useToast } from './ui';

function validImageUrl(value: string) {
  if (!value.trim()) return true;
  try { return ['http:', 'https:'].includes(new URL(value.trim()).protocol); } catch { return false; }
}

export default function ProfileAvatarModal({ onClose }: { onClose: () => void }) {
  const { profile, setAvatarUrl } = useAuth();
  const toast = useToast();
  const [url, setUrl] = useState(profile?.avatarUrl ?? '');
  const [broken, setBroken] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!validImageUrl(url)) { toast('URL รูปต้องเป็นลิงก์ http หรือ https', 'error'); return; }
    setBusy(true);
    try {
      const normalized = url.trim() || null;
      await saveMyAvatarUrl(normalized ?? '');
      setAvatarUrl(normalized);
      toast(normalized ? 'เปลี่ยนรูปโปรไฟล์แล้ว ✅' : 'ลบรูปโปรไฟล์แล้ว ✅');
      onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  const name = profile?.displayName ?? '?';
  return (
    <Modal title="เปลี่ยนรูปโปรไฟล์ของฉัน" onClose={onClose}
      footer={<><button className="btn btn-g" disabled={busy} onClick={onClose}>ยกเลิก</button><button className="btn btn-p" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึกรูปโปรไฟล์'}</button></>}>
      <p className="mb-3 text-sm text-mute">ตั้งรูปได้เฉพาะบัญชีของคุณ รูปนี้จะแสดงที่แถบด้านข้าง</p>
      <Field label="URL รูปโปรไฟล์" hint="ใช้ลิงก์รูปภาพที่เข้าถึงได้ผ่าน http หรือ https เว้นว่างเพื่อลบรูป">
        <input className="inp" type="url" value={url} disabled={busy} onChange={(e) => { setUrl(e.target.value); setBroken(false); }} placeholder="https://…" autoFocus />
      </Field>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-accent/15 text-2xl font-bold text-accent">
          {url.trim() && !broken ? <img src={url.trim()} alt="ตัวอย่างรูปโปรไฟล์" className="h-full w-full object-cover" onError={() => setBroken(true)} /> : name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-semibold">{name}</div>
          <div className="text-xs text-mute">ตัวอย่างรูปที่จะแสดง</div>
        </div>
      </div>
    </Modal>
  );
}
