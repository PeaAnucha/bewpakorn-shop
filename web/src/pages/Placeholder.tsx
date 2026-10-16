import { useLocation } from 'react-router-dom';
import { NAV } from '../nav';

export default function Placeholder() {
  const { pathname } = useLocation();
  const item = NAV.find((n) => `/${n.path}` === pathname);
  return (
    <div>
      <h1 className="mb-4 font-head text-3xl font-bold tracking-tight text-white">{item?.icon} {item?.label}</h1>
      <div className="card text-mute">หน้านี้จะย้ายมาในเฟสถัดไป</div>
    </div>
  );
}
