import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { changeOwnPin, errMsg } from '../lib/data';
import { Field, Modal, useToast } from './ui';

export default function ChangePin({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [oldPin, setOld] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!oldPin || !pin) { toast('กรุณากรอก PIN', 'error'); return; }
    if (pin !== pin2) { toast('PIN ใหม่ไม่ตรงกัน', 'error'); return; }
    if (pin.trim().length < 6) { toast('PIN ใหม่ต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return; }
    if (pin === oldPin) { toast('PIN ใหม่ต้องต่างจากเดิม', 'error'); return; }
    setBusy(true);
    try {
      await changeOwnPin(profile!.username, oldPin, pin);
      toast('เปลี่ยน PIN สำเร็จ ✅');
      onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  }

  return (
    <Modal title="🔒 เปลี่ยน PIN" onClose={onClose}
      footer={<><button className="btn btn-g" onClick={onClose}>ยกเลิก</button><button className="btn btn-p" disabled={busy} onClick={submit}>{busy ? 'กำลังบันทึก…' : 'เปลี่ยน PIN'}</button></>}>
      <Field label="PIN เดิม"><input className="inp" type="password" value={oldPin} onChange={(e) => setOld(e.target.value)} autoComplete="current-password" autoFocus /></Field>
      <Field label="PIN ใหม่" hint="อย่างน้อย 6 ตัวอักษร"><input className="inp" type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="new-password" /></Field>
      <Field label="ยืนยัน PIN ใหม่"><input className="inp" type="password" value={pin2} onChange={(e) => setPin2(e.target.value)} autoComplete="new-password" /></Field>
    </Modal>
  );
}
