// ต้องตรงกับ scripts/lib/auth.mjs เสมอ
const DOMAIN = import.meta.env.VITE_AUTH_EMAIL_DOMAIN || 'bewpakorn.app';

/** Supabase Auth ต้องใช้อีเมล จึงแปลง username เป็นอีเมลสมมติ (ไม่มีการส่งอีเมลจริง) */
export const toEmail = (username: string) => `${username.trim().toLowerCase()}@${DOMAIN}`;

/** รหัสผ่านขั้นต่ำของ Supabase คือ 6 ตัว แต่ PIN เดิมบางอันสั้นกว่า จึงเติม prefix */
export const toPassword = (pin: string) => `bwk-${pin.trim()}`;
