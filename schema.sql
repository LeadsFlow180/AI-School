-- Supabase schema for creator profile storage.
-- Run this in Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.creator_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text,
  organization text,
  audience text,
  subjects text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classrooms (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  stage_data jsonb not null default '{}'::jsonb,
  scenes_data jsonb not null default '[]'::jsonb,
  chats_data jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.creator_profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.admin_users enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists creator_profiles_set_updated_at on public.creator_profiles;
create trigger creator_profiles_set_updated_at
before update on public.creator_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists classrooms_set_updated_at on public.classrooms;
create trigger classrooms_set_updated_at
before update on public.classrooms
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.creator_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

drop policy if exists "profiles_select_own" on public.creator_profiles;
create policy "profiles_select_own"
on public.creator_profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.creator_profiles;
create policy "profiles_update_own"
on public.creator_profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.creator_profiles;
create policy "profiles_insert_own"
on public.creator_profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "classrooms_select_own" on public.classrooms;
create policy "classrooms_select_own"
on public.classrooms
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "classrooms_insert_own" on public.classrooms;
create policy "classrooms_insert_own"
on public.classrooms
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "classrooms_update_own" on public.classrooms;
create policy "classrooms_update_own"
on public.classrooms
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "classrooms_delete_own" on public.classrooms;
create policy "classrooms_delete_own"
on public.classrooms
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "admin_users_select_own" on public.admin_users;
create policy "admin_users_select_own"
on public.admin_users
for select
to authenticated
using (auth.uid() = user_id);

-- =============================================================================
-- Admin user management query (run manually in Supabase SQL editor)
-- Replace with the email you want to grant admin access.
-- =============================================================================
-- insert into public.admin_users (user_id)
-- select id
-- from auth.users
-- where email = 'admin@example.com'
-- on conflict (user_id) do nothing;
