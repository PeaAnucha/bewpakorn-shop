import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { NAV } from '../nav';
import { supabase } from '../lib/supabase';
import { useAccountPresence, useAppUsers } from '../lib/data';
import ChangePin from './ChangePin';
import HangingLight from './HangingLight';
import ProfileAvatarModal from './ProfileAvatarModal';
import StaticBackground from './StaticBackground';
import useLiquidGlassSurfaces from './useLiquidGlassSurfaces';

function formatLastOnline(value: string | undefined) {
  if (!value) return 'ยังไม่เคยออนไลน์';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ไม่ทราบเวลา';
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}
function Avatar({ src, name }: { src: string | null; name: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    return <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/20 text-xl font-bold text-accent md:h-16 md:w-16 md:text-2xl">{name.slice(0, 1).toUpperCase()}</div>;
  }
  return <img src={src} alt="" onError={() => setBad(true)} className="h-14 w-14 rounded-full object-cover md:h-16 md:w-16" />;
}

export default function Layout() {
  const { profile, can, signOut } = useAuth();
  const [pinOpen, setPinOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [navOrder, setNavOrder] = useState<string[]>([]);
  const navOrderKey = profile ? `sidebar-order:${profile.id}` : null;
  const [loadedOrderKey, setLoadedOrderKey] = useState<string | null>(null);
  const { rootRef, surfaceCallbacks } = useLiquidGlassSurfaces(1);
  const isAdmin = !!profile?.isAdmin;
  const statusAccounts = useAppUsers(isAdmin);
  const statusRecords = useAccountPresence(isAdmin);
  const onlineAccountIds = useMemo(() => {
    const now = Date.now();
    return new Set((statusRecords.data ?? [])
      .filter((record) => {
        const age = now - Date.parse(record.lastSeenAt);
        return age >= 0 && age <= 90_000;
      })
      .map((record) => record.userId));
  }, [statusRecords.data]);
  const accountList = statusAccounts.data ?? [];
  const statusError = !!(statusAccounts.error || statusRecords.error);

  useEffect(() => {
    if (!profile?.id) return;
    let warned = false;
    const sendHeartbeat = async () => {
      const { error } = await supabase.from('account_presence').upsert({ user_id: profile.id }, { onConflict: 'user_id' });
      if (error && !warned) {
        warned = true;
        console.warn('Online status is unavailable. Apply Supabase migration 013_account_presence.sql.', error);
      }
    };
    void sendHeartbeat();
    const interval = window.setInterval(() => { void sendHeartbeat(); }, 30_000);
    return () => window.clearInterval(interval);
  }, [profile?.id]);


  useEffect(() => {
    if (!navOrderKey) return;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(navOrderKey) ?? '[]');
      setNavOrder(Array.isArray(saved) ? saved.filter((path): path is string => typeof path === 'string') : []);
    } catch {
      setNavOrder([]);
    }
    setLoadedOrderKey(navOrderKey);
  }, [navOrderKey]);

  useEffect(() => {
    if (!navOrderKey || loadedOrderKey !== navOrderKey) return;
    try { localStorage.setItem(navOrderKey, JSON.stringify(navOrder)); } catch { /* Keep the current order for this session. */ }
  }, [navOrder, navOrderKey, loadedOrderKey]);

  const items = useMemo(() => {
    const visible = NAV.filter((n) => !n.perm || can(n.perm[0], n.perm[1]));
    const rank = new Map(navOrder.map((path, index) => [path, index]));
    return visible
      .map((item, originalIndex) => ({ item, originalIndex }))
      .sort((a, b) => (rank.get(a.item.path) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.item.path) ?? Number.MAX_SAFE_INTEGER) || a.originalIndex - b.originalIndex)
      .map(({ item }) => item);
  }, [can, navOrder]);

  function moveNavItem(path: string, direction: -1 | 1) {
    const current = items.map((item) => item.path);
    const index = current.indexOf(path);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    [current[index], current[nextIndex]] = [current[nextIndex], current[index]];
    const visiblePaths = new Set(current);
    const hiddenPaths = NAV.map((item) => item.path).filter((itemPath) => !visiblePaths.has(itemPath));
    setNavOrder([...current, ...hiddenPaths]);
  }


  return (
    <div ref={rootRef} className="vanta-page flex min-h-screen flex-col md:flex-row">
      <StaticBackground theme="app" />
      <HangingLight profileId={profile?.id} />
      <aside ref={surfaceCallbacks[0]} className="liquid-surface liquid-surface-sidebar relative z-10 backdrop-blur-sm md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <div className="flex items-center gap-2 font-head text-lg font-extrabold text-accent">
            <img src="/brand-logo.png" alt="Bewpakorn Shop" className="h-10 w-10 rounded-lg object-cover" />
            <span>BewpakornShop</span>
          </div>
          <div className="mt-0 flex items-center gap-2 md:mt-4">
            <Avatar src={profile?.avatarUrl ?? null} name={profile?.displayName ?? '?'} />
            <div className="text-sm leading-tight">
              <div className="font-bold">{profile?.displayName}</div>
              <div className="text-xs text-mute">{profile?.roles.join(', ')}</div>
              <button type="button" className="mt-1 text-xs font-semibold text-accent hover:underline" onClick={() => setAvatarOpen(true)}>🖼️ เปลี่ยนรูปของฉัน</button>
            </div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-y-auto">
          <button
            type="button"
            className={`btn btn-g btn-sm shrink-0 !justify-start ${reorderMode ? 'text-accent' : ''}`}
            aria-pressed={reorderMode}
            onClick={() => setReorderMode((value) => !value)}
          >
            {reorderMode ? '✅ เสร็จสิ้นการจัดเมนู' : '↕️ จัดเรียงเมนู'}
          </button>
          {reorderMode && <button type="button" className="btn btn-g btn-sm shrink-0 !justify-start" onClick={() => setNavOrder([])}>คืนค่าเริ่มต้น</button>}
          {items.map((n) => (
            <div key={n.path} className="flex shrink-0 items-center gap-1 md:w-full">
              <NavLink
                to={`/${n.path}`}
                className={({ isActive }) =>
                  `sidebar-link flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap rounded-lg border-l-[3px] px-3 py-2 text-sm font-bold transition duration-200 hover:scale-[1.01] ${
                    isActive ? 'border-accent bg-surface text-accent' : 'border-transparent text-mute hover:text-white'
                  }`
                }
              >
                <span>{n.icon}</span>
                {n.label}
              </NavLink>
              {reorderMode && <div className="flex shrink-0 gap-0.5">
                <button type="button" className="rounded px-1.5 py-1 text-xs text-mute hover:bg-s2 hover:text-white disabled:opacity-30" aria-label={`ย้าย ${n.label} ขึ้น`} title="ย้ายขึ้น" disabled={items[0]?.path === n.path} onClick={() => moveNavItem(n.path, -1)}>↑</button>
                <button type="button" className="rounded px-1.5 py-1 text-xs text-mute hover:bg-s2 hover:text-white disabled:opacity-30" aria-label={`ย้าย ${n.label} ลง`} title="ย้ายลง" disabled={items[items.length - 1]?.path === n.path} onClick={() => moveNavItem(n.path, 1)}>↓</button>
              </div>}
            </div>
          ))}
        </nav>
              <div className="shrink-0 border-t border-white/10 px-3 pt-2 pb-3">
          {isAdmin && <section aria-label="สถานะบัญชี" className="mb-2">
            <div className="mb-1 flex items-center justify-between px-2 text-xs font-semibold">
              <span className="text-white">สถานะบัญชี</span>
              <span className={statusError ? 'text-warn' : 'text-mute'}>{statusError ? 'ยังไม่พร้อม' : statusAccounts.isLoading || statusRecords.isLoading ? 'กำลังตรวจ…' : `${onlineAccountIds.size}/${accountList.length} ออนไลน์`}</span>
            </div>
            <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg bg-black/20 p-1">
              {statusError ? <p className="px-2 py-1.5 text-xs text-warn">รัน migration 013_account_presence.sql ใน Supabase ก่อน</p>
                : statusAccounts.isLoading || statusRecords.isLoading ? <p className="px-2 py-1.5 text-xs text-mute">กำลังโหลดสถานะ…</p>
                  : accountList.length === 0 ? <p className="px-2 py-1.5 text-xs text-mute">ยังไม่มีบัญชี</p>
                    : [...accountList].sort((a, b) => Number(onlineAccountIds.has(b.id)) - Number(onlineAccountIds.has(a.id)) || (a.displayName || a.username).localeCompare(b.displayName || b.username)).map((account) => {
                      const online = onlineAccountIds.has(account.id);
                      const lastSeen = statusRecords.data?.find((record) => record.userId === account.id)?.lastSeenAt;
                      return <div key={account.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ${online ? 'bg-lime-300 ring-lime-100/70 shadow-[0_0_9px_rgba(190,242,100,0.95)]' : 'bg-gray-400 ring-white/25'}`} />
                        <span className="min-w-0 flex-1 truncate text-white" title={account.username}>{account.displayName || account.username}</span>
                        <span className="flex shrink-0 flex-col items-end leading-tight">
                          <span className={online ? 'text-green-300' : 'text-mute'}>{online ? 'ออนไลน์' : 'ออฟไลน์'}</span>
                          {!online && <span className="text-[10px] text-faint" title={lastSeen ? `ออนไลน์ล่าสุด ${formatLastOnline(lastSeen)}` : 'บัญชีนี้ยังไม่เคยออนไลน์'}>{lastSeen ? `ล่าสุด ${formatLastOnline(lastSeen)}` : 'ยังไม่เคยออนไลน์'}</span>}
                        </span>
                      </div>;
                    })}
            </div>
          </section>}
          <div className="flex flex-col gap-1">
            <button onClick={() => setPinOpen(true)} className="btn btn-g btn-sm w-full">🔒 เปลี่ยน PIN</button>
            <button onClick={signOut} className="btn btn-g btn-sm w-full">ออกจากระบบ</button>
          </div>
        </div>
      </aside>
      <main className="relative z-10 min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
      {pinOpen && <ChangePin onClose={() => setPinOpen(false)} />}
      {avatarOpen && <ProfileAvatarModal onClose={() => setAvatarOpen(false)} />}
    </div>
  );
}















