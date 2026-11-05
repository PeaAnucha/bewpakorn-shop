-- Let each signed-in user update only their own profile image.
begin;

create or replace function public.update_my_avatar_url(p_avatar_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_url text := nullif(btrim(p_avatar_url), '');
  v_rows integer;
begin
  if v_user_id is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  if v_url is not null and (char_length(v_url) > 2048 or v_url !~* '^https?://') then
    raise exception 'URL รูปโปรไฟล์ต้องเป็นลิงก์ http หรือ https และยาวไม่เกิน 2048 ตัวอักษร';
  end if;

  update public.app_users
     set avatar_url = v_url
   where auth_user_id = v_user_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'ไม่พบบัญชีผู้ใช้'; end if;
end $$;

revoke all on function public.update_my_avatar_url(text) from public, anon;
grant execute on function public.update_my_avatar_url(text) to authenticated;

commit;
