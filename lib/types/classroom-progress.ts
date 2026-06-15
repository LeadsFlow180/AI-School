import type { PlaybackSnapshot } from '@/lib/utils/playback-storage';

export interface ClassroomProgressPayload {
  classroomId: string;
  currentSceneId: string | null;
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: string[];
  playbackCompleted: boolean;
  lastPlayedAt: string;
  updatedAt: string;
}

export function playbackSnapshotFromProgress(
  row: Pick<ClassroomProgressPayload, 'sceneIndex' | 'actionIndex' | 'consumedDiscussions' | 'currentSceneId'>,
): PlaybackSnapshot {
  return {
    sceneIndex: row.sceneIndex,
    actionIndex: row.actionIndex,
    consumedDiscussions: row.consumedDiscussions,
    sceneId: row.currentSceneId ?? undefined,
  };
}

export function progressFromPlaybackSnapshot(
  classroomId: string,
  currentSceneId: string | null,
  snapshot: PlaybackSnapshot,
  playbackCompleted: boolean,
): Omit<ClassroomProgressPayload, 'lastPlayedAt' | 'updatedAt'> & { classroomId: string } {
  return {
    classroomId,
    currentSceneId,
    sceneIndex: snapshot.sceneIndex,
    actionIndex: snapshot.actionIndex,
    consumedDiscussions: snapshot.consumedDiscussions,
    playbackCompleted,
  };
}
