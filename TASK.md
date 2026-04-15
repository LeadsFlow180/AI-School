# TASK

## Active

- [x] 2026-04-15 - Reposition Home Guidance Book button into the top profile-controls header row (above prompt area).
- [x] 2026-04-15 - Move Home-page Guidance Book button out of prompt toolbar into a separate top-level action row.
- [x] 2026-04-15 - Add in-classroom Guidance Book button to reopen the classroom tour overlay on demand.
- [x] 2026-04-15 - Randomize loading-scene educational chips on each classroom open so the experience feels fresh per load.
- [x] 2026-04-15 - Add more educational floating items to the classroom loading scene so the post-entrance learning phase feels fuller.
- [x] 2026-04-15 - Enhance classroom loading scene with delayed educational floating elements (math theorems, alphabets/languages, and physics symbols) that appear after mascot entrance.
- [x] 2026-04-15 - Add subtle sparkling gradient stars in the classroom canvas area to make the scene feel more interactive.
- [x] 2026-04-15 - Fix Home Recents disappearing after returning from classroom: restore proper local IndexedDB fallback when Supabase session/query is empty or errors.
- [x] 2026-04-15 - Fix classroom route stale-load bug: always clear previous stage on `[id]` change and error if requested classroom id is missing/not found (prevents showing guided `Q_aCAqhuTq` for unrelated recents).
- [x] 2026-04-15 - Kid-friendly classroom strip below slides: clearer zone labels (i18n), warmer visuals, larger tap targets, dot texture — same layout and behavior (`Roundtable` + stage wrapper).
- [x] 2026-04-14 - Prevent guide character overlap with sidebar content by shifting its position when the sidebar is open.
- [x] 2026-04-14 - Redesign slide sidebar visuals for a cleaner kid-friendly look with improved card polish and icon-based scroll controls.
- [x] 2026-04-14 - Improve slide sidebar scroll clarity with a sticky slide count chip and kid-friendly up/down scroll buttons.
- [x] 2026-04-14 - Add high-clarity kids-theme cues to bottom bar with simple section labels and stronger action-button contrast, without changing behavior.
- [x] 2026-04-14 - Further strengthen the bottom bar (below slides) with a clearer kids-theme surface and playful visual grouping while preserving all existing interactions.
- [x] 2026-04-14 - Refresh the bottom classroom roundtable bar with kid-friendly gradients and playful panel styling that matches the app theme.
- [x] 2026-04-14 - Animate the right-side floating classroom character down into the Notes/Chat zone when the panel is open.
- [x] 2026-04-14 - Use the same classroom character overlays on the home page so mascot appearance matches classroom screens.
- [x] 2026-04-14 - Restore classroom mascot overlays in stage layout so character guides/background render again on classroom detail pages.
- [x] 2026-04-13 - Apply cleaner classroom visual redesign by reducing decoration intensity and flattening presentation containers.
- [x] 2026-04-13 - Simplify classroom UI to a cleaner minimal-kids style by reducing overlays and decorative clutter.
- [x] 2026-04-13 - Refine classroom stage presentation layout below top banner for cleaner visual structure.
- [x] 2026-04-13 - Add above-screen guide characters with rotating speech-bubble hints for top bar/chat/recents.
- [x] 2026-04-13 - Improve classroom Notes and Chat sections with cleaner, more professional visual styling.
- [x] 2026-04-13 - Add pagination controls to Home Recents classrooms section.
- [x] 2026-04-13 - Enhance home Recents section with polished professional card and container styling.
- [x] 2026-04-13 - Fix Recents classroom card navigation reliability on home page.
- [x] 2026-04-13 - Add the same classroom mascot characters to the home screen background.
- [x] 2026-04-13 - Expand placeholder mascot pack with expression variants, pose diversity, and classroom props (book/pencil/globe/rocket) and place them in parallax background.
- [x] 2026-04-13 - Add placeholder kid character assets and place them in classroom background with parallax movement.
- [x] 2026-04-13 - Refresh classroom page UI with kids-focused gradients, playful cartoon-style decorative background, and parallax/3D visual effects.
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

- [x] 2026-04-15 - Extend classroom tour with explicit action guidance steps for Export PPT, Play/Pause audio, Speed, and Whiteboard (button-level spotlight selectors).
- [x] 2026-04-15 - Smart tour card placement: auto-position guidance card to side with available space around spotlight target.
- [x] 2026-04-15 - Tour trigger policy + readability fixes: show only via `?tour=1`, remove overlay blur, force-open sidebar/chat on relevant tour steps, move chat-step card to left.
- [x] 2026-04-15 - Upgrade classroom tour spotlight to target real DOM regions (`data-tour` markers + live rect measurement on resize/scroll).
- [x] 2026-04-15 - Add home “Guidance Book” shortcut to `/classroom/Q_aCAqhuTq?tour=1` and implement interactive classroom spotlight tour (Next/Back/Done + seen state).
- [x] 2026-04-15 - Keep classroom loading scene visible until mascot entrance completes (minimum hold duration before rendering `Stage`).
- [x] 2026-04-15 - Classroom route loading: cinematic kids scene with blurred “set”, letterbox, mascot motion (`ClassroomLoadingScene` + `stage.*` i18n).
- [x] 2026-04-15 - Kid-friendly labels + tooltips on canvas toolbar: speed, auto-read, whiteboard, sound, play/pause (`canvas-toolbar.tsx` + `stage` i18n).
- [x] 2026-04-15 - Fix `KidsGuideOverlay` left mascot sliding horizontally: avoid Motion on `left` (use CSS + transition), fixed bubble column width, bottom-anchored rotate only (no stacked `y` + rotate on the doll).
- [x] 2026-04-10 - Restore home generation prompt after visiting Manage RAG (`/rag`): fix draft hydration from `useDraftCache` and sync-save before navigation.
- [ ] Replace in-memory vector store with persistent vector DB for production.
- [ ] Add RAG source citation rendering in chat and generated lesson scenes.
