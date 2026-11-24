import { lazy, useEffect, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import Layout from './components/Layout';
import Login from './pages/Login';
import Placeholder from './pages/Placeholder';
import { NAV } from './nav';

// โหลดแยกไฟล์ต่อหน้า (code-split ตามเส้นทาง) เพื่อให้ผู้ใช้โหลดเฉพาะโค้ดของหน้าที่เปิดจริง
const PAGE_LOADERS: Record<string, () => Promise<{ default: ComponentType }>> = {
  dashboard: () => import('./pages/Dashboard'),
  maps: () => import('./pages/Maps'),
  employees: () => import('./pages/Employees'),
  products: () => import('./pages/Products'),
  shopids: () => import('./pages/ShopIds'),
  schedule: () => import('./pages/Schedule'),
  stockcount: () => import('./pages/StockCount'),
  history: () => import('./pages/History'),
};
// หลัง deploy รอบใหม่ ไฟล์โค้ดชุดเก่าจะถูกแทนที่ แท็บที่เปิดค้างไว้จะโหลดหน้าที่ยังไม่เคยเปิดไม่ได้
// จึงรีโหลดหน้าเว็บให้อัตโนมัติ 1 ครั้งเพื่อรับไฟล์ชุดใหม่ (กันวนรีโหลดด้วย sessionStorage)
const RELOAD_FLAG = 'chunk-reload-at';
function loadWithReload(load: () => Promise<{ default: ComponentType }>) {
  return () => load().then((mod) => {
    try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
    return mod;
  }, (error: unknown) => {
    let last = 0;
    try { last = Number(sessionStorage.getItem(RELOAD_FLAG)) || 0; } catch { /* ignore */ }
    if (Date.now() - last > 60_000) {
      try { sessionStorage.setItem(RELOAD_FLAG, String(Date.now())); } catch { /* ignore */ }
      window.location.reload();
      return new Promise<never>(() => {}); // รอรีโหลด ไม่ต้องแสดง error
    }
    throw error;
  });
}
const PAGES: Record<string, JSX.Element> = Object.fromEntries(Object.entries(PAGE_LOADERS).map(([path, load]) => {
  const Page = lazy(loadWithReload(load));
  return [path, <Page />];
}));

export default function App() {
  const { loading, session, profile, can } = useAuth();
  const allowed = NAV.filter((n) => !n.perm || can(n.perm[0], n.perm[1]));
  const allowedKey = allowed.map((n) => n.path).join(',');

  // หลังล็อกอินและหน้าแรกขึ้นแล้ว ทยอยโหลดโค้ดหน้าอื่นที่มีสิทธิ์ไว้ล่วงหน้าตอนเครื่องว่าง
  // เปลี่ยนเมนูครั้งแรกจะไม่ต้องรอโหลดไฟล์ (ไม่โหลดหน้าที่ไม่มีสิทธิ์)
  useEffect(() => {
    if (!session || !profile || !allowedKey) return;
    const paths = allowedKey.split(',');
    const prefetch = () => paths.forEach((path) => { void PAGE_LOADERS[path]?.().catch(() => { /* ลองใหม่ตอนเปิดหน้านั้นจริง */ }); });
    const idle = window.requestIdleCallback?.(prefetch, { timeout: 4000 });
    const timer = idle === undefined ? window.setTimeout(prefetch, 2000) : undefined;
    return () => {
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [session, profile, allowedKey]);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-mute">กำลังโหลด…</div>;
  if (!session || !profile) return <Login />;

  const home = allowed[0]?.path ?? 'schedule';

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={`/${home}`} replace />} />
        {allowed.map((n) => (
          <Route key={n.path} path={n.path} element={PAGES[n.path] ?? <Placeholder />} />
        ))}
        <Route path="*" element={<Navigate to={`/${home}`} replace />} />
      </Route>
    </Routes>
  );
}
