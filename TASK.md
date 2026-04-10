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
- [x] 2026-04-09 - Fix `/api/learn/redirect` 400 errors by adding base64url decoding, validating current payload shape, and server-side signature verification.
- [x] 2026-04-10 - Support signed lesson deep-link flow directly on `/classroom/[id]` by forwarding `payload`/`sig` to `/api/learn/redirect`.
- [x] 2026-04-10 - Fix classroom preview regression for signed deep links by preserving raw query payloads and restoring clean `/classroom/[id]` URL after sync.
- [x] 2026-04-10 - Make classroom viewing public by adding server-side Supabase admin fallback in `/api/classroom` GET when local storage is missing.
- [x] 2026-04-10 - Send classroom interaction telemetry to `/api/learn/content` (slide viewed, quiz filled, quiz marks) using signed deep-link context.
- [x] 2026-04-10 - Ensure exact `lessonContentId` is forwarded to `/api/learn/content` and attach cumulative progress (slides viewed + quiz progress) in interaction details.

## Discovered During Work

- [ ] Replace in-memory vector store with persistent vector DB for production.
- [ ] Add RAG source citation rendering in chat and generated lesson scenes.
