'use client';

import { getAgaLaunchBundle, getAgaLaunchContext, hasAgaLaunchContext } from '@/lib/aga/launch-payload';
import { saveQuizResultLocal } from '@/lib/classroom/quiz-result-storage';
import type { QuizQuestionResultRecord, QuizResultPayload } from '@/lib/types/quiz-result';
import { useStageStore } from '@/lib/store';

export function buildQuizResultPayload(input: {
  classroomId: string;
  sceneId: string;
  results: QuizQuestionResultRecord[];
  totalPoints: number;
  answers: Record<string, string | string[]>;
}): QuizResultPayload {
  const score = input.results.reduce((sum, r) => sum + r.earned, 0);
  const correctCount = input.results.filter((r) => r.status === 'correct').length;
  const incorrectCount = input.results.length - correctCount;
  const percent =
    input.totalPoints > 0 ? Math.round((score / input.totalPoints) * 100) : 0;

  return {
    classroomId: input.classroomId,
    sceneId: input.sceneId,
    score,
    totalPoints: input.totalPoints,
    percent,
    correctCount,
    incorrectCount,
    questionCount: input.results.length,
    submittedAt: new Date().toISOString(),
    results: input.results,
    answers: input.answers,
  };
}

function sceneIndexForId(scenes: { id: string }[], sceneId: string): number {
  const idx = scenes.findIndex((s) => s.id === sceneId);
  return idx >= 0 ? idx : 0;
}

/**
 * Persist quiz results locally (IndexedDB) and sync to AGA when launched from embed.
 */
export async function persistQuizResult(input: {
  classroomId: string;
  sceneId: string;
  results: QuizQuestionResultRecord[];
  totalPoints: number;
  answers: Record<string, string | string[]>;
}): Promise<{ saved: boolean; synced: boolean }> {
  const payload = buildQuizResultPayload(input);

  try {
    await saveQuizResultLocal(payload);
  } catch {
    return { saved: false, synced: false };
  }

  if (!hasAgaLaunchContext(input.classroomId)) {
    return { saved: true, synced: false };
  }

  const launch = getAgaLaunchBundle(input.classroomId);
  if (!launch) return { saved: true, synced: false };

  const ctx = getAgaLaunchContext(input.classroomId);
  const scenes = useStageStore.getState().scenes;
  const sceneIndex = sceneIndexForId(scenes, input.sceneId);

  try {
    const res = await fetch('/api/learn/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: launch.payload,
        sig: launch.sig,
        sceneIndex,
        quiz: {
          ...payload,
          classroomId: ctx?.classroomId ?? payload.classroomId,
        },
      }),
    });
    return { saved: true, synced: res.ok };
  } catch {
    return { saved: true, synced: false };
  }
}
