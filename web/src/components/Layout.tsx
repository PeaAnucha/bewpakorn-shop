import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { NAV } from '../nav';
import ChangePin from './ChangePin';
import ProfileAvatarModal from './ProfileAvatarModal';
import VantaBackground from './VantaBackground';

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
  const items = NAV.filter((n) => !n.perm || can(n.perm[0], n.perm[1]));

  return (
    <div className="vanta-page flex min-h-screen flex-col md:flex-row">
      <VantaBackground effect="net" />
      <aside className="relative z-10 bg-black/80 backdrop-blur-sm md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
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
          {items.map((n) => (
            <NavLink
              key={n.path}
              to={`/${n.path}`}
              className={({ isActive }) =>
                `flex items-center gap-2 whitespace-nowrap rounded-lg border-l-[3px] px-3 py-2 text-sm font-bold transition duration-200 ${
                  isActive ? 'border-accent bg-surface text-accent' : 'border-transparent text-mute hover:text-white'
                }`
              }
            >
              <span>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
          <button onClick={() => setPinOpen(true)} className="btn btn-g btn-sm shrink-0 md:mt-auto">🔒 เปลี่ยน PIN</button>
          <button onClick={signOut} className="btn btn-g btn-sm shrink-0 md:mt-1">ออกจากระบบ</button>
        </nav>
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
