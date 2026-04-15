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
- [x] 2026-04-10 - Add Gemma AI prompt button and force generation-preview API calls to use Gemma model when that button is used.
- [x] 2026-04-10 - Add Gamma AI slide generation integration (env key, server proxy routes, and home toolbar button with polling/open flow).
- [x] 2026-04-13 - Prevent repeated Gamma API hits by adding single-flight generation lock and polling run guard in home prompt flow.
- [x] 2026-04-13 - Render Gamma slides inside classroom via server-side PDF export proxy (`/api/gamma/export/[generationId]`) instead of blocked `gamma.app` iframe.
- [x] 2026-04-10 - Show Gamma-generated classroom as scene-by-scene in AI Tutor flow by resolving PDF page count and creating one classroom scene per page.
- [x] 2026-04-10 - Align Gamma classroom rendering with AI Tutor slide engine by rasterizing each PDF page into per-scene slide canvas images.
- [x] 2026-04-10 - Add backward-compatible migration for legacy Gamma classrooms: convert interactive PDF scenes to native slide scenes and inject missing speech actions on load.
- [x] 2026-04-10 - Stabilize Gamma classroom rendering on Windows by switching to per-page interactive PDF scenes with speech and migrating blank image-based scenes on load.
- [x] 2026-04-10 - Download Gamma export and render PDF pages client-side into native slide scenes (with interactive fallback) for AI Tutor-style display.
- [x] 2026-04-10 - Auto-convert existing Gamma interactive classrooms to native slide scenes on classroom load by rendering export PDF pages client-side.
- [x] 2026-04-10 - Generate AI narration scripts per Gamma slide via dedicated `/api/gamma/scripts` route using extracted page text.
- [x] 2026-04-10 - Send selected AI model headers to `/api/gamma/scripts` so per-slide narration uses configured provider/key reliably.
- [x] 2026-04-10 - Embed AI-generated quiz scenes into Gamma classrooms (insert quiz checks between slide groups).
- [x] 2026-04-10 - Change Gamma quiz strategy to a single large final quiz (5-10 questions) instead of periodic mini-quizzes.
- [x] 2026-04-10 - Improve Gamma slide narration quality to match simple-prompt teaching style (stronger prompts, language-aware scripts, 3 lines per slide).
- [x] 2026-04-10 - Expand Gamma narration coverage to better explain full slide content (longer extracted text + 4-6 script lines + dynamic speech actions).
- [x] 2026-04-10 - Persist Gamma-generated classrooms to Supabase explicitly at creation time (in addition to store save sync).
- [ ] Replace in-memory vector store with persistent vector DB for production.
- [ ] Add RAG source citation rendering in chat and generated lesson scenes.
