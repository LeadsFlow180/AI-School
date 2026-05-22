-- Per-user classroom playback progress (Allen Girls Adventure / Supabase)
-- Run in Supabase SQL Editor after deploying the app update.

create table if not exists public.classroom_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  classroom_id text not null references public.classrooms (id) on delete cascade,
  current_scene_id text,
  scene_index integer not null default 0,
  action_index integer not null default 0,
  consumed_discussions jsonb not null default '[]'::jsonb,
  playback_completed boolean not null default false,
  last_played_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, classroom_id)
);

create index if not exists classroom_progress_classroom_id_idx
  on public.classroom_progress (classroom_id);

alter table public.classroom_progress enable row level security;

drop policy if exists "classroom_progress_select_own" on public.classroom_progress;
create policy "classroom_progress_select_own"
on public.classroom_progress
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "classroom_progress_insert_own" on public.classroom_progress;
create policy "classroom_progress_insert_own"
on public.classroom_progress
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "classroom_progress_update_own" on public.classroom_progress;
create policy "classroom_progress_update_own"
on public.classroom_progress
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists classroom_progress_set_updated_at on public.classroom_progress;
create trigger classroom_progress_set_updated_at
before update on public.classroom_progress
for each row
execute function public.set_updated_at();
