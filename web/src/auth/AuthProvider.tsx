import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { toEmail, toPassword } from '../lib/auth';

export type Action = 'view' | 'add' | 'edit' | 'delete' | 'export' | 'approve';

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roles: string[];
  employeeId: string | null;
  isAdmin: boolean;
}

interface AuthCtx {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** เช็กสิทธิ์ เหมือน can(page, action) ในระบบเดิม (admin ทำได้ทุกอย่าง) */
  can: (page: string, action: Action) => boolean;
  setAvatarUrl: (url: string | null) => void;
  signIn: (username: string, pin: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [perms, setPerms] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  // ติดตามสถานะล็อกอิน (อย่าเรียก Supabase ภายใน callback นี้ ให้ทำใน effect ด้านล่างแทน)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) { setProfile(null); setPerms({}); setLoading(false); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // โหลดโปรไฟล์ + สิทธิ์ เมื่อมี session
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true); // ล็อกอินสำเร็จแล้ว รอโหลดโปรไฟล์/สิทธิ์
    (async () => {
      const { data: u } = await supabase
        .from('app_users')
        .select('id, username, display_name, avatar_url, roles, employee_id')
        .eq('auth_user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (!u) { await supabase.auth.signOut(); setLoading(false); return; }
      const roles: string[] = u.roles ?? [];
      const merged: Record<string, string[]> = {};
      if (!roles.includes('admin')) {
        const { data: rows } = await supabase.from('permissions').select('page, actions').in('role', roles);
        for (const r of rows ?? []) merged[r.page] = [...new Set([...(merged[r.page] ?? []), ...(r.actions as string[])])];
      }
      if (cancelled) return;
      setPerms(merged);
      setProfile({
        id: u.id, username: u.username, displayName: u.display_name ?? u.username,
        avatarUrl: u.avatar_url, roles, employeeId: u.employee_id, isAdmin: roles.includes('admin'),
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const can = useCallback(
    (page: string, action: Action) => !!profile && (profile.isAdmin || (perms[page] ?? []).includes(action)),
    [profile, perms],
  );
  const setAvatarUrl = useCallback((url: string | null) => {
    setProfile((current) => current ? { ...current, avatarUrl: url } : current);
  }, []);

  // ไม่ตั้ง loading ตรงนี้ เพราะจะทำให้หน้าล็อกอินถูกถอดออกแล้วข้อความผิดพลาดหายไป
  const signIn = useCallback(async (username: string, pin: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password: toPassword(pin) });
    return error ? 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง' : null;
  }, []);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);

  const value = useMemo(() => ({ loading, session, profile, can, setAvatarUrl, signIn, signOut }), [loading, session, profile, can, setAvatarUrl, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth ต้องอยู่ใน <AuthProvider>');
  return v;
}
