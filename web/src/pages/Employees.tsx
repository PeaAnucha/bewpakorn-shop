import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import EmployeesTab from '../components/EmployeesTab';
import RolesTab from '../components/RolesTab';

export default function EmployeesPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'emp' | 'roles'>('emp');
  const isAdmin = !!profile?.isAdmin;
  const cls = (on: boolean) => `rounded-full px-4 py-2 text-sm font-bold transition duration-200 ${on ? 'bg-accent text-black' : 'bg-s2 text-white hover:bg-s3'}`;
  return (
    <div>
      {isAdmin && (
        <div className="mb-4 flex gap-2">
          <button className={cls(tab === 'emp')} onClick={() => setTab('emp')}>👥 พนักงาน & บัญชี</button>
          <button className={cls(tab === 'roles')} onClick={() => setTab('roles')}>🏷️ Roles & สิทธิ์</button>
        </div>
      )}
      {tab === 'roles' && isAdmin ? <RolesTab /> : <EmployeesTab />}
    </div>
  );
}
