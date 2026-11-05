-- Persist each user's current stock-count round so it can be resumed later.
begin;

create table if not exists public.stock_count_rounds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  counted_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(counted_ids) = 'array'),
  skipped_map_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(skipped_map_ids) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.stock_count_rounds enable row level security;
revoke all on public.stock_count_rounds from anon, authenticated;
grant select on public.stock_count_rounds to authenticated;
create policy stock_count_round_own_read on public.stock_count_rounds
  for select to authenticated using (user_id = auth.uid() and public.has_perm('products', 'edit'));

create or replace function public.save_stock_count_round(p_counted_ids jsonb, p_skipped_map_ids jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'กรุณาเข้าสู่ระบบ'; end if;
  if not public.has_perm('products', 'edit') then raise exception 'ไม่มีสิทธิ์นับสต็อก'; end if;
  if jsonb_typeof(p_counted_ids) is distinct from 'array' or jsonb_typeof(p_skipped_map_ids) is distinct from 'array' then
    raise exception 'ข้อมูลรอบนับไม่ถูกต้อง';
  end if;

  insert into public.stock_count_rounds(user_id, counted_ids, skipped_map_ids, updated_at)
  values (v_user_id, p_counted_ids, p_skipped_map_ids, now())
  on conflict (user_id) do update set
    counted_ids = excluded.counted_ids,
    skipped_map_ids = excluded.skipped_map_ids,
    updated_at = excluded.updated_at;
end $$;

revoke all on function public.save_stock_count_round(jsonb, jsonb) from public, anon;
grant execute on function public.save_stock_count_round(jsonb, jsonb) to authenticated;

commit;
