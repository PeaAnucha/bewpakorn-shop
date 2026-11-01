import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import useLiquidGlassSurfaces from '../components/useLiquidGlassSurfaces';
import LoginLogoScene from '../components/LoginLogoScene';
import StaticBackground from '../components/StaticBackground';

export default function Login() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const { rootRef, surfaceCallbacks } = useLiquidGlassSurfaces(1);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!username.trim() || !pin.trim()) { setErr('กรอกชื่อผู้ใช้และ PIN'); return; }
    setBusy(true);
    const msg = await signIn(username, pin);
    if (msg) { setErr(msg); setBusy(false); }
  }

  return (
    <div ref={rootRef} className="vanta-page flex min-h-screen items-center justify-center px-4">
      <StaticBackground theme="login" />
      <form
        ref={surfaceCallbacks[0]}
        onSubmit={submit}
        data-config="{&quot;blurAmount&quot;:0.22,&quot;refraction&quot;:0.35,&quot;edgeHighlight&quot;:0.12,&quot;cornerRadius&quot;:12,&quot;opacity&quot;:0.9}"
        className="login-card relative z-10 w-full max-w-[390px] rounded-lg p-9 shadow-2xl"
      >
        <div className="mb-7 text-center">
          <div className="relative mx-auto mb-1 h-24 w-24">
            <LoginLogoScene />
          </div>
          <h1 className="mt-1 font-head text-2xl font-extrabold text-accent">BewpakornShop</h1>
          <p className="mt-1 text-sm text-mute">ระบบจัดการร้านและพนักงาน</p>
        </div>
        <label htmlFor="login-username" className="mb-1 block text-xs font-bold uppercase tracking-wider text-mute">ชื่อผู้ใช้</label>
        <input id="login-username" className="inp mb-3.5" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" />
        <label htmlFor="login-pin" className="mb-1 block text-xs font-bold uppercase tracking-wider text-mute">PIN</label>
        <input id="login-pin" className="inp mb-3.5" type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="current-password" />
        <button className="btn btn-p w-full py-3 font-head" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
        <div className="mt-2 min-h-[18px] text-center text-sm text-danger">{err}</div>
      </form>
    </div>
  );
}


