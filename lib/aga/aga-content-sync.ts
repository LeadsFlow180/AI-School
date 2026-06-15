'use client';

import type { PlaybackSnapshot } from '@/lib/utils/playback-storage';
import { getAgaLaunchBundle, getAgaLaunchContext } from '@/lib/aga/launch-payload';

/**
 * Client helper: POST playback progress to AI-School `/api/learn/progress`,
 * which signs and forwards to AGA `/api/learn/content`.
 */
export async function syncAgaPlaybackProgress(input: {
  classroomId: string;
  currentSceneId: string | null;
  snapshot: PlaybackSnapshot;
  playbackCompleted: boolean;
}): Promise<void> {
  const launch = getAgaLaunchBundle(input.classroomId);
  if (!launch) return;

  const ctx = getAgaLaunchContext(input.classroomId);

  await fetch('/api/learn/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: launch.payload,
      sig: launch.sig,
      classroomId: ctx?.classroomId ?? input.classroomId,
      currentSceneId: input.currentSceneId,
      sceneIndex: input.snapshot.sceneIndex,
      actionIndex: input.snapshot.actionIndex,
      consumedDiscussions: input.snapshot.consumedDiscussions,
      playbackCompleted: input.playbackCompleted,
    }),
  });
}
