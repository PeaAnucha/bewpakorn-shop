// ตารางกะอยู่ที่เว็บแยก (มีรหัสผ่านของเว็บนั้นเอง) เปลี่ยนลิงก์ได้ด้วย VITE_SCHEDULE_URL ใน web/.env
const SCHEDULE_URL = import.meta.env.VITE_SCHEDULE_URL || 'https://admirable-khapse-c06af8.netlify.app/';

export default function SchedulePage() {
  return (
    <div className="card">
      <h1 className="mb-1 font-head text-2xl font-bold tracking-tight">📅 ตารางกะงาน</h1>
      <p className="mb-5 text-sm text-mute">ตารางกะแสดงในหน้านี้ หากเว็บขอให้เข้าสู่ระบบ ให้กรอกข้อมูลบนหน้าเว็บตารางกะ</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <a href={SCHEDULE_URL} target="_blank" rel="noopener noreferrer" className="btn btn-p !px-6 !py-3 text-base">
          📅 เปิดตารางกะ ↗
        </a>
      </div>
      <iframe
        src={SCHEDULE_URL}
        title="ตารางกะงาน"
        className="h-[calc(100vh-260px)] min-h-[620px] w-full rounded-lg border border-line bg-white"
        referrerPolicy="no-referrer"
      />
      <p className="mt-2 text-xs text-faint">
        หาก iframe ว่างหรือแสดงข้อความปฏิเสธ เว็บตารางกะอาจไม่อนุญาตให้ฝัง ให้เปิดผ่านปุ่มด้านบนแทน
      </p>
    </div>
  );
}
