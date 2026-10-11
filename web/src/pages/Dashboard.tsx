import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const TABLES = [
  { table: 'products', label: 'สินค้า', icon: '📦' },
  { table: 'shop_ids', label: 'ไอดีร้าน', icon: '🔑' },
  { table: 'maps', label: 'แมพ', icon: '🗺️' },
  { table: 'employees', label: 'พนักงาน', icon: '👥' },
] as const;

function Stat({ table, label, icon }: (typeof TABLES)[number]) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['count', table],
    queryFn: async () => {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  return (
    <div className="card">
      <div className="text-2xl">{icon}</div>
      <div className="mt-1 font-head text-3xl font-extrabold text-accent">{isLoading ? '…' : error ? '—' : data}</div>
      <div className="text-sm text-mute">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div>
      <h1 className="mb-4 font-head text-xl font-extrabold text-accent">📊 แดชบอร์ด</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {TABLES.map((t) => <Stat key={t.table} {...t} />)}
      </div>
      <p className="mt-6 text-sm text-mute">ตัวเลขด้านบนอ่านจากฐานข้อมูลจริงผ่านสิทธิ์ของผู้ใช้ที่ล็อกอิน ใช้ตรวจว่าระบบ Auth + RLS ทำงาน หน้าเต็มจะมาในเฟส 3</p>
    </div>
  );
}
