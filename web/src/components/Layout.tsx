import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { NAV } from '../nav';
import ChangePin from './ChangePin';

function Avatar({ src, name }: { src: string | null; name: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    return <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">{name.slice(0, 1).toUpperCase()}</div>;
  }
  return <img src={src} alt="" onError={() => setBad(true)} className="h-9 w-9 rounded-full object-cover" />;
}

export default function Layout() {
  const { profile, can, signOut } = useAuth();
  const [pinOpen, setPinOpen] = useState(false);
  const items = NAV.filter((n) => !n.perm || can(n.perm[0], n.perm[1]));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-line bg-surface md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <div className="font-head text-lg font-extrabold text-accent">🛒 BewpakornShop</div>
          <div className="mt-0 flex items-center gap-2 md:mt-4">
            <Avatar src={profile?.avatarUrl ?? null} name={profile?.displayName ?? '?'} />
            <div className="text-sm leading-tight">
              <div className="font-bold">{profile?.displayName}</div>
              <div className="text-xs text-mute">{profile?.roles.join(', ')}</div>
            </div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {items.map((n) => (
            <NavLink
              key={n.path}
              to={`/${n.path}`}
              className={({ isActive }) =>
                `flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  isActive ? 'bg-accent/15 text-accent' : 'text-mute hover:bg-s2 hover:text-ink'
                }`
              }
            >
              <span>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
          <button onClick={() => setPinOpen(true)} className="btn btn-g mt-1 md:mt-4">🔒 เปลี่ยน PIN</button>
          <button onClick={signOut} className="btn btn-g md:mt-1">ออกจากระบบ</button>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">
        <Outlet />
      </main>
      {pinOpen && <ChangePin onClose={() => setPinOpen(false)} />}
    </div>
  );
}
