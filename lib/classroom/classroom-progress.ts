'use client';



import { useStageStore } from '@/lib/store';

import type { PlaybackSnapshot } from '@/lib/utils/playback-storage';

import {

  loadPlaybackState,

  savePlaybackState,

} from '@/lib/utils/playback-storage';

import {

  getAgaLaunchBundle,

  getAgaLaunchContext,

  hasAgaCompleteBeenSent,

  hasAgaLaunchContext,

  markAgaCompleteSent,

  type AgaLaunchContext,

} from '@/lib/aga/launch-payload';

import { getSessionSafe, getSupabaseClient } from '@/lib/supabase/client';

import {

  playbackSnapshotFromProgress,

  type ClassroomProgressPayload,

  progressFromPlaybackSnapshot,

} from '@/lib/types/classroom-progress';



const DEBOUNCE_MS = 900;

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();



export interface ClassroomProgressState {

  currentSceneId: string | null;

  playbackSnapshot: PlaybackSnapshot | null;

  playbackCompleted: boolean;

  updatedAt: number;

}



type ProgressSaveInput = {

  classroomId: string;

  currentSceneId: string | null;

  snapshot?: PlaybackSnapshot | null;

  playbackCompleted?: boolean;

};



function rowToState(row: ClassroomProgressPayload): ClassroomProgressState {

  const snapshot =

    row.actionIndex > 0 || row.sceneIndex > 0 || row.consumedDiscussions.length > 0

      ? playbackSnapshotFromProgress(row)

      : null;



  return {

    currentSceneId: row.currentSceneId,

    playbackSnapshot: snapshot,

    playbackCompleted: row.playbackCompleted,

    updatedAt: new Date(row.updatedAt).getTime(),

  };

}



function sceneIndexForId(scenes: { id: string }[], sceneId: string | null): number {

  if (!sceneId) return 0;

  const idx = scenes.findIndex((s) => s.id === sceneId);

  return idx >= 0 ? idx : 0;

}



function isLastSlideComplete(

  scenes: { id: string }[],

  sceneId: string | null,

  playbackCompleted: boolean,

  totalSlides: number,

): boolean {

  if (!playbackCompleted || scenes.length === 0) return false;

  const idx = sceneIndexForId(scenes, sceneId);

  const lastIndex = Math.min(scenes.length, totalSlides) - 1;

  return idx >= lastIndex && lastIndex >= 0;

}



function buildSnapshot(input: ProgressSaveInput): PlaybackSnapshot {

  const scenes = useStageStore.getState().scenes;

  const sceneIndex = sceneIndexForId(scenes, input.currentSceneId);

  return (

    input.snapshot ?? {

      sceneIndex,

      actionIndex: 0,

      consumedDiscussions: [],

      sceneId: input.currentSceneId ?? undefined,

    }

  );

}



async function fetchRemoteProgress(classroomId: string): Promise<ClassroomProgressState | null> {

  const supabase = getSupabaseClient();

  if (!supabase) return null;



  const session = await getSessionSafe(supabase);

  const token = session?.access_token;

  if (!token) return null;



  const res = await fetch(`/api/classroom/progress?classroomId=${encodeURIComponent(classroomId)}`, {

    headers: { Authorization: `Bearer ${token}` },

    cache: 'no-store',

  });

  if (!res.ok) return null;



  const json = await res.json().catch(() => null);

  if (!json?.success || !json?.progress) return null;

  return rowToState(json.progress as ClassroomProgressPayload);

}



async function pushAgaProgress(input: ProgressSaveInput): Promise<void> {

  const launch = getAgaLaunchBundle(input.classroomId);

  if (!launch) return;



  const ctx = getAgaLaunchContext(input.classroomId);

  const scenes = useStageStore.getState().scenes;

  const snapshot = buildSnapshot(input);

  const totalSlides = ctx?.totalSlides ?? (scenes.length || 5);

  const wantsComplete = !!input.playbackCompleted;

  const sendComplete =

    wantsComplete &&

    isLastSlideComplete(scenes, input.currentSceneId, true, totalSlides) &&

    !hasAgaCompleteBeenSent(input.classroomId, ctx?.step);



  if (sendComplete) {

    markAgaCompleteSent(input.classroomId, ctx?.step);

  }



  await fetch('/api/learn/progress', {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({

      payload: launch.payload,

      sig: launch.sig,

      classroomId: ctx?.classroomId ?? input.classroomId,

      currentSceneId: input.currentSceneId,

      sceneIndex: snapshot.sceneIndex,

      actionIndex: snapshot.actionIndex,

      consumedDiscussions: snapshot.consumedDiscussions,

      playbackCompleted: sendComplete,

    }),

  });

}



/** AI-School Supabase — only when not launched from AGA embed. */

async function pushAiSchoolProgress(input: ProgressSaveInput): Promise<void> {

  const supabase = getSupabaseClient();

  if (!supabase) return;



  const session = await getSessionSafe(supabase);

  const token = session?.access_token;

  if (!token) return;



  const snapshot = buildSnapshot(input);



  const body = progressFromPlaybackSnapshot(

    input.classroomId,

    input.currentSceneId,

    snapshot,

    input.playbackCompleted ?? false,

  );



  await fetch('/api/classroom/progress', {

    method: 'POST',

    headers: {

      'Content-Type': 'application/json',

      Authorization: `Bearer ${token}`,

    },

    body: JSON.stringify(body),

  });

}



async function pushRemoteProgress(input: ProgressSaveInput): Promise<void> {

  if (hasAgaLaunchContext(input.classroomId)) {

    await pushAgaProgress(input);

    return;

  }

  await pushAiSchoolProgress(input);

}



async function saveLocalProgress(input: ProgressSaveInput): Promise<void> {

  const snapshot = buildSnapshot(input);

  await savePlaybackState(input.classroomId, snapshot);

}



/**

 * Debounced save while lecture is playing (IndexedDB + Supabase).

 */

export function scheduleClassroomProgressSave(input: ProgressSaveInput): void {

  const key = input.classroomId;

  const existing = pendingTimers.get(key);

  if (existing) clearTimeout(existing);



  pendingTimers.set(

    key,

    setTimeout(() => {

      pendingTimers.delete(key);

      void (async () => {

        try {

          await saveLocalProgress(input);

          await pushRemoteProgress(input);

        } catch {

          // best-effort persistence

        }

      })();

    }, DEBOUNCE_MS),

  );

}



/** Immediate save when the user picks a slide from the sidebar. */

export async function persistClassroomProgressOnSceneSelect(

  classroomId: string,

  sceneId: string,

): Promise<void> {

  const pending = pendingTimers.get(classroomId);

  if (pending) {

    clearTimeout(pending);

    pendingTimers.delete(classroomId);

  }



  const scenes = useStageStore.getState().scenes;

  const sceneIndex = sceneIndexForId(scenes, sceneId);



  const input: ProgressSaveInput = {

    classroomId,

    currentSceneId: sceneId,

    snapshot: {

      sceneIndex,

      actionIndex: 0,

      consumedDiscussions: [],

      sceneId,

    },

    playbackCompleted: false,

  };



  try {

    await saveLocalProgress(input);

    await pushRemoteProgress(input);

  } catch {

    // best-effort

  }

}



let pendingRestore: PlaybackSnapshot | null = null;

let hydratedPlaybackCompleted = false;



export function setPendingPlaybackRestore(snapshot: PlaybackSnapshot | null): void {

  pendingRestore = snapshot;

}



export function consumeHydratedPlaybackCompleted(): boolean {

  const value = hydratedPlaybackCompleted;

  hydratedPlaybackCompleted = false;

  return value;

}



export function consumePendingPlaybackRestore(): PlaybackSnapshot | null {

  const value = pendingRestore;

  pendingRestore = null;

  return value;

}



function resumeFromAgaContext(

  ctx: AgaLaunchContext,

  scenes: { id: string }[],

): { sceneId: string | null; snapshot: PlaybackSnapshot | null } {

  const byId =

    ctx.resumeSceneId && scenes.some((s) => s.id === ctx.resumeSceneId)

      ? ctx.resumeSceneId

      : null;



  if (byId) {

    const sceneIndex = sceneIndexForId(scenes, byId);

    return {

      sceneId: byId,

      snapshot: {

        sceneIndex,

        actionIndex: 0,

        consumedDiscussions: [],

        sceneId: byId,

      },

    };

  }



  if (typeof ctx.resumeSceneIndex === 'number' && ctx.resumeSceneIndex >= 0) {

    const clamped = Math.min(ctx.resumeSceneIndex, Math.max(0, scenes.length - 1));

    const scene = scenes[clamped];

    if (scene) {

      return {

        sceneId: scene.id,

        snapshot: {

          sceneIndex: clamped,

          actionIndex: 0,

          consumedDiscussions: [],

          sceneId: scene.id,

        },

      };

    }

  }



  return { sceneId: scenes[0]?.id ?? null, snapshot: null };

}



/**

 * Load progress from Supabase and IndexedDB; prefer the newest snapshot.

 * Applies resume slide to the stage store when valid.

 */

export async function hydrateClassroomProgress(classroomId: string): Promise<ClassroomProgressState | null> {

  const scenes = useStageStore.getState().scenes;

  const agaCtx = getAgaLaunchContext(classroomId);



  if (agaCtx && scenes.length > 0) {

    const { sceneId, snapshot } = resumeFromAgaContext(agaCtx, scenes);

    if (sceneId && sceneId !== useStageStore.getState().currentSceneId) {

      useStageStore.getState().setCurrentSceneId(sceneId);

    }

    if (snapshot) {

      setPendingPlaybackRestore(snapshot);

      try {

        await savePlaybackState(classroomId, snapshot);

      } catch {

        // ignore

      }

    }

    return {

      currentSceneId: sceneId,

      playbackSnapshot: snapshot,

      playbackCompleted: false,

      updatedAt: Date.now(),

    };

  }



  let localState: ClassroomProgressState | null = null;

  try {

    const local = await loadPlaybackState(classroomId);

    if (local) {

      localState = {

        currentSceneId: local.sceneId ?? null,

        playbackSnapshot: local,

        playbackCompleted: false,

        updatedAt: 0,

      };

    }

  } catch {

    localState = null;

  }



  let remoteState: ClassroomProgressState | null = null;

  if (!hasAgaLaunchContext(classroomId)) {

    try {

      remoteState = await fetchRemoteProgress(classroomId);

    } catch {

      remoteState = null;

    }

  }



  const merged =

    remoteState && (!localState || remoteState.updatedAt >= localState.updatedAt)

      ? remoteState

      : localState;



  if (!merged) return null;



  const sceneExists = (id: string | null) => !!id && scenes.some((s) => s.id === id);

  const resumeSceneId = sceneExists(merged.currentSceneId) ? merged.currentSceneId : scenes[0]?.id ?? null;



  hydratedPlaybackCompleted = merged.playbackCompleted;



  if (resumeSceneId && resumeSceneId !== useStageStore.getState().currentSceneId) {

    useStageStore.getState().setCurrentSceneId(resumeSceneId);

  }



  if (merged.playbackSnapshot && (!merged.playbackSnapshot.sceneId || merged.playbackSnapshot.sceneId === resumeSceneId)) {

    setPendingPlaybackRestore(merged.playbackSnapshot);

    try {

      await savePlaybackState(classroomId, merged.playbackSnapshot);

    } catch {

      // ignore

    }

  }



  return { ...merged, currentSceneId: resumeSceneId };

}


