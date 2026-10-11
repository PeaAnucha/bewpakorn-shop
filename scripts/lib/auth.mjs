// ต้องตรงกับ web/src/lib/auth.ts เสมอ
export const AUTH_EMAIL_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || 'bewpakorn.app';
export const toEmail = (username) => `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
// Supabase ต้องการรหัสผ่านยาวอย่างน้อย 6 ตัว แต่ PIN เดิมบางอันสั้นกว่านั้น จึงเติม prefix
export const toPassword = (pin) => `bwk-${pin.trim()}`;
