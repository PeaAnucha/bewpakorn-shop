begin;

-- One lightweight heartbeat row per application account. Status is derived from last_seen_at.
create table public.account_presence (
  user_id text primary key references public.app_users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.account_presence enable row level security;
revoke all on public.account_presence from anon, public;
grant select, insert, update on public.account_presence to authenticated;

create policy account_presence_read_own_or_admin
  on public.account_presence for select to authenticated
  using (
    public.is_admin()
    or user_id = (select id from public.app_users where auth_user_id = auth.uid())
  );

create policy account_presence_insert_own
  on public.account_presence for insert to authenticated
  with check (user_id = (select id from public.app_users where auth_user_id = auth.uid()));

create policy account_presence_update_own
  on public.account_presence for update to authenticated
  using (user_id = (select id from public.app_users where auth_user_id = auth.uid()))
  with check (user_id = (select id from public.app_users where auth_user_id = auth.uid()));

-- Use database time so a client cannot keep itself online with a future timestamp.
create or replace function public.touch_account_presence()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.last_seen_at := now();
  return new;
end;
$$;

create trigger trg_account_presence_touch
  before insert or update on public.account_presence
  for each row execute function public.touch_account_presence();

commit;
