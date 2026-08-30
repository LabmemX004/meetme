-- meetme · Supabase 建表脚本（v2：自由绘制块状时段）
-- 用法：Supabase 控制台 → SQL Editor → New query → 粘贴全部 → Run
-- 注意：v2 数据结构与 v1 不兼容；如果是老项目重新执行本文件即可（会先删旧表）。

drop table if exists public.slots;
drop table if exists public.profiles;

create table public.slots (
  id text primary key,                     -- 客户端按自然键生成的确定性 id
  user_name text not null,
  week_start date not null,                -- 该块所属周的周一（每周固定块用 1970-01-05 占位）
  is_fixed boolean not null default false, -- 每周固定 = true
  day_of_week int not null check (day_of_week between 0 and 6),  -- 0=周一
  start_min int not null check (start_min % 5 = 0 and start_min >= 0 and start_min < 1440),
  end_min   int not null check (end_min   % 5 = 0 and end_min > start_min and end_min <= 1440),
  status text not null check (status in ('busy','free')),        -- busy=有事 free=没事
  note text not null default '',
  sticky_text text not null default '',
  has_image boolean not null default false,
  sticky_image text,                       -- data URL，列表请求不取这列（懒加载）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index slots_week_idx on public.slots (week_start);

create table public.profiles (
  user_name text primary key,
  email text not null default '',
  updated_at timestamptz not null default now()
);

-- 玩具级开放策略：知道网址的人都能读写
alter table public.slots enable row level security;
alter table public.profiles enable row level security;

create policy "slots read"   on public.slots for select using (true);
create policy "slots write"  on public.slots for insert with check (true);
create policy "slots update" on public.slots for update using (true) with check (true);
create policy "slots delete" on public.slots for delete using (true);

create policy "profiles read"   on public.profiles for select using (true);
create policy "profiles write"  on public.profiles for insert with check (true);
create policy "profiles update" on public.profiles for update using (true) with check (true);
create policy "profiles delete" on public.profiles for delete using (true);

-- 实时同步
alter table public.slots replica identity full;
alter table public.profiles replica identity full;

-- 如果下面两句报 "already exists"，忽略即可
alter publication supabase_realtime add table public.slots;
alter publication supabase_realtime add table public.profiles;
