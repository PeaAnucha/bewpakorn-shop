import { useState } from 'react';

// ตารางกะอยู่ที่เว็บแยก (มีรหัสผ่านของเว็บนั้นเอง) เปลี่ยนลิงก์ได้ด้วย VITE_SCHEDULE_URL ใน web/.env
const SCHEDULE_URL = import.meta.env.VITE_SCHEDULE_URL || 'https://admirable-khapse-c06af8.netlify.app/';

export default function SchedulePage() {
  const [embed, setEmbed] = useState(false);
  return (
    <div className="card">
      <h1 className="mb-1 font-head text-base font-bold">📅 ตารางกะงาน</h1>
      <p className="mb-5 text-sm text-mute">ตารางกะของพนักงานอยู่ที่เว็บแยก ใช้รหัสผ่านของเว็บนั้นในการเข้าดู</p>
      <div className="flex flex-wrap gap-2">
        <a href={SCHEDULE_URL} target="_blank" rel="noopener noreferrer" className="btn btn-p !px-6 !py-3 text-base">
          📅 เปิดตารางกะ ↗
        </a>
        <button className="btn btn-g !py-3" onClick={() => setEmbed((v) => !v)}>
          {embed ? '🙈 ซ่อนในหน้านี้' : '🖼️ แสดงในหน้านี้'}
        </button>
      </div>
      {embed && (
        <div className="mt-5">
          <iframe
            src={SCHEDULE_URL}
            title="ตารางกะงาน"
            className="h-[80vh] w-full rounded-xl border border-line bg-white"
            referrerPolicy="no-referrer"
          />
          <p className="mt-2 text-xs text-faint">
            ถ้าพื้นที่ด้านบนว่างเปล่าหรือขึ้นข้อความปฏิเสธ แปลว่าเว็บตารางกะไม่อนุญาตให้ฝังในเว็บอื่น ให้ใช้ปุ่ม "เปิดตารางกะ" แทน
          </p>
        </div>
      )}
    </div>
  );
}
