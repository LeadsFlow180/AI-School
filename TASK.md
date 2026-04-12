# TASK

## Active

- [x] 2026-04-01 - Integrate RAG end-to-end into UI generation and chat flow, and expose in-app RAG management page.
- [x] 2026-04-03 - Course creator onboarding UI at `/onboarding` (local profile + link from home); wire full persistence/API later.
- [x] 2026-04-01 - Add Supabase login/signup UI at `/auth`, gate creator onboarding behind auth, and wire env placeholders.
- [x] 2026-04-01 - Add root `schema.sql` for Supabase `creator_profiles` table, RLS policies, and auto-create profile trigger.
- [x] 2026-04-01 - Wire creator onboarding to load/save profile in Supabase `creator_profiles` (upsert + prefill).
- [x] 2026-04-01 - Persist classrooms to Supabase `classrooms` table on each stage save (mirror local IndexedDB flow).
- [x] 2026-04-01 - Fetch Recents from Supabase when logged in with local IndexedDB fallback and source logging.
- [x] 2026-04-01 - Restrict auth to admin-only login (remove signup UI) and add `admin_users` SQL grant query.
- [x] 2026-04-01 - Add secure server API to create admin user directly with email/password (`/api/admin/create-admin-user`).

## Discovered During Work

- [x] 2026-04-10 - Restore home generation prompt after visiting Manage RAG (`/rag`): fix draft hydration from `useDraftCache` and sync-save before navigation.
- [ ] Replace in-memory vector store with persistent vector DB for production.
- [ ] Add RAG source citation rendering in chat and generated lesson scenes.
