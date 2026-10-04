-- Giai đoạn B — migration khởi tạo (Supabase Postgres).
-- Chưa áp dụng lên project thật (BLOCKED: thiếu credential). Không mở bằng mọi quyền.
-- Áp dụng khi có Supabase: supabase db push / SQL editor.

create table if not exists learning_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  course_id text not null,
  chapter_id text not null,
  lesson_id text not null,
  part_id text not null,
  kind text not null check (kind in ('text','highlight','ink','region','image','video_note')),
  source jsonb not null default '{}',
  title text,
  body text,
  quote text,
  asset_id text,
  vector_data jsonb,
  status text not null default 'normal' check (status in ('normal','unresolved','resolved')),
  sort_order double precision not null default 0,
  revision integer not null default 1,
  client_operation_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists learning_items_owner_lesson_idx
  on learning_items (owner_id, lesson_id) where deleted_at is null;

alter table learning_items enable row level security;

drop policy if exists learning_items_owner_all on learning_items;
create policy learning_items_owner_all on learning_items
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table if not exists chat_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Cuộc trò chuyện mới',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table chat_threads enable row level security;
drop policy if exists chat_threads_owner_all on chat_threads;
create policy chat_threads_owner_all on chat_threads
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  scope jsonb,
  source_ids text[] not null default '{}',
  model text,
  request_id text,
  created_at timestamptz not null default now()
);
alter table chat_messages enable row level security;
drop policy if exists chat_messages_owner_all on chat_messages;
create policy chat_messages_owner_all on chat_messages
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table if not exists ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('summary','mindmap')),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  payload jsonb not null,
  original_item_ids text[] not null default '{}',
  source_revision integer,
  model text,
  created_at timestamptz not null default now()
);
alter table ai_artifacts enable row level security;
drop policy if exists ai_artifacts_owner_all on ai_artifacts;
create policy ai_artifacts_owner_all on ai_artifacts
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create table if not exists progress (
  owner_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (owner_id, lesson_id)
);
alter table progress enable row level security;
drop policy if exists progress_owner_all on progress;
create policy progress_owner_all on progress
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
