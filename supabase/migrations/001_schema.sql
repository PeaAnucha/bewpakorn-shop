-- BewpakornShop: Phase 1 schema (Supabase / Postgres)
-- วิธีใช้: Supabase Dashboard -> SQL Editor -> New query -> วางทั้งไฟล์ -> Run

-- รหัส 8 ตัวอักษรแบบเดียวกับ ID เดิมในชีต (ใช้เป็นค่าเริ่มต้นของแถวใหม่)
create or replace function public.gen_short_id() returns text
language sql volatile as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────── Roles / Permissions ─────────
create table public.roles (
  id         text primary key default public.gen_short_id(),
  name       text not null unique,
  label      text not null,
  color      text,
  created_at timestamptz not null default now()
);

create table public.permissions (
  role    text not null references public.roles(name) on update cascade on delete cascade,
  page    text not null,
  actions text[] not null default '{}',
  primary key (role, page)
);

-- ───────── พนักงาน / ผู้ใช้ ─────────
create table public.employees (
  id         text primary key default public.gen_short_id(),
  name       text not null,
  position   text,
  email      text,
  created_at timestamptz not null default now()
);

create table public.ranks (
  id          text primary key default public.gen_short_id(),
  employee_id text not null unique references public.employees(id) on delete cascade,
  pronoun     text,
  rank        text,
  updated_at  timestamptz not null default now()
);
create trigger trg_ranks_updated before update on public.ranks
  for each row execute function public.set_updated_at();

-- เก็บ PIN แบบ hash (bcrypt) เท่านั้น ไม่เก็บ PIN จริง
-- เฟส 2 จะเชื่อมกับ Supabase Auth
create table public.app_users (
  id           text primary key default public.gen_short_id(),
  username     text not null unique,
  pin_hash     text not null,
  roles        text[] not null default '{staff}',
  employee_id  text references public.employees(id) on delete set null,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- ───────── แมพ / ไอดีร้าน / สินค้า ─────────
create table public.maps (
  id          text primary key default public.gen_short_id(),
  name        text not null,
  icon        text,
  description text,
  created_at  timestamptz not null default now()
);

create table public.shop_ids (
  id         text primary key default public.gen_short_id(),
  shop_id    text not null unique,
  password   text,                       -- เฟสถัดไปจะจำกัดให้เฉพาะ admin อ่านได้ผ่าน RLS
  map_id     text references public.maps(id) on delete set null,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_shop_ids_updated before update on public.shop_ids
  for each row execute function public.set_updated_at();

create table public.products (
  id           text primary key default public.gen_short_id(),
  name         text not null,
  map_id       text references public.maps(id) on delete set null,
  shop_id_ref  text references public.shop_ids(id) on delete set null,
  stock        integer not null default 0,
  description  text,
  status       text not null default 'active',
  image_url    text,
  is_bundle    boolean not null default false,
  bundle_items jsonb not null default '[]'::jsonb,
  sort_order   integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index products_map_idx  on public.products(map_id);
create index products_shop_idx on public.products(shop_id_ref);
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

create table public.ghost_items (
  id         text primary key default public.gen_short_id(),
  name       text not null unique,
  stock      integer not null default 0,
  note       text,
  sort_order integer,
  updated_at timestamptz not null default now()
);
create trigger trg_ghost_updated before update on public.ghost_items
  for each row execute function public.set_updated_at();

-- ───────── ตารางงาน / วันหยุด / เช็กอิน ─────────
create table public.schedule (
  id          text primary key default public.gen_short_id(),
  year_month  text not null check (year_month ~ '^\d{4}-\d{2}$'),
  employee_id text not null references public.employees(id) on delete cascade,
  day         date not null,
  shift       text not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index schedule_ym_idx  on public.schedule(year_month);
create index schedule_emp_idx on public.schedule(employee_id, day);

create table public.holiday_votes (
  id          text primary key default public.gen_short_id(),
  year_month  text not null check (year_month ~ '^\d{4}-\d{2}$'),
  employee_id text not null references public.employees(id) on delete cascade,
  voted_days  integer[] not null default '{}',
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index holiday_votes_ym_idx on public.holiday_votes(year_month);
create trigger trg_holiday_votes_updated before update on public.holiday_votes
  for each row execute function public.set_updated_at();

create table public.holiday_locks (
  id         text primary key default public.gen_short_id(),
  year_month text not null check (year_month ~ '^\d{4}-\d{2}$'),
  day        integer not null check (day between 1 and 31),
  locked_by  text,
  locked_at  timestamptz not null default now(),
  unique (year_month, day)
);

create table public.attendance_logs (
  id          text primary key default public.gen_short_id(),
  employee_id text not null references public.employees(id) on delete cascade,
  type        text not null check (type in ('IN','OUT')),
  ts          timestamptz not null default now(),
  note        text
);
create index attendance_emp_ts_idx on public.attendance_logs(employee_id, ts desc);

-- ───────── Row Level Security ─────────
-- เปิดไว้ก่อนและยังไม่มี policy = เบราว์เซอร์เข้าตารางไม่ได้เลย (ปลอดภัยไว้ก่อน)
-- สคริปต์ import ใช้ secret key ซึ่งข้าม RLS; policy จริงจะเขียนในเฟส 2
do $$
declare t text;
begin
  for t in select unnest(array['roles','permissions','employees','ranks','app_users','maps',
    'shop_ids','products','ghost_items','schedule','holiday_votes','holiday_locks','attendance_logs'])
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
