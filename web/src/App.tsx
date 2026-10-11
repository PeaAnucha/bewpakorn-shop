import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import EmployeesPage from './pages/Employees';
import Placeholder from './pages/Placeholder';
import MapsPage from './pages/Maps';
import ProductsPage from './pages/Products';
import ShopIdsPage from './pages/ShopIds';
import SchedulePage from './pages/Schedule';
import StockCountPage from './pages/StockCount';
import { NAV } from './nav';

const PAGES: Record<string, JSX.Element> = {
  dashboard: <Dashboard />,
  maps: <MapsPage />,
  employees: <EmployeesPage />,
  products: <ProductsPage />,
  shopids: <ShopIdsPage />,
  schedule: <SchedulePage />,
  stockcount: <StockCountPage />,
};

export default function App() {
  const { loading, session, profile, can } = useAuth();

  if (loading) return <div className="flex min-h-screen items-center justify-center text-mute">กำลังโหลด…</div>;
  if (!session || !profile) return <Login />;

  const allowed = NAV.filter((n) => !n.perm || can(n.perm[0], n.perm[1]));
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
