'use client';

type LearnContentContext = {
  classroomId: string;
  payload: string;
  sig: string;
  lessonContentId?: string | number;
  capturedAt: string;
};

const CONTEXT_KEY = 'learn_content_context_v1';
const PROGRESS_KEY = 'learn_content_progress_v1';

type LearnContentEvent = {
  status: string;
  classroomId: string;
  sceneId?: string;
  details?: Record<string, unknown>;
  quiz?: Record<string, unknown>;
};

type LearnProgressSnapshot = {
  classroomId: string;
  viewedSceneIds: string[];
  totalSlideViewEvents: number;
  quizStartedCount: number;
  quizSubmittedCount: number;
  quizCompletedCount: number;
  latestQuizScore: number | null;
  latestQuizTotal: number | null;
  bestQuizScore: number | null;
  updatedAt: string;
};

function decodePayload(rawPayload: string): Record<string, unknown> | null {
  try {
    const base64 = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function saveLearnContentContext(input: {
  classroomId: string;
  payload: string;
  sig: string;
}) {
  if (typeof window === 'undefined') return;
  const decoded = decodePayload(input.payload);
  const lessonContentId = decoded?.lessonContentId;
  const record: LearnContentContext = {
    classroomId: input.classroomId,
    payload: input.payload,
    sig: input.sig,
    lessonContentId:
      typeof lessonContentId === 'string' || typeof lessonContentId === 'number'
        ? lessonContentId
        : input.classroomId,
    capturedAt: new Date().toISOString(),
  };
  window.sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(record));
}

function readLearnContentContext(): LearnContentContext | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(CONTEXT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LearnContentContext;
  } catch {
    return null;
  }
}

function readProgress(): LearnProgressSnapshot | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(PROGRESS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LearnProgressSnapshot;
  } catch {
    return null;
  }
}

function getOrInitProgress(classroomId: string): LearnProgressSnapshot {
  const existing = readProgress();
  if (existing && existing.classroomId === classroomId) return existing;
  return {
    classroomId,
    viewedSceneIds: [],
    totalSlideViewEvents: 0,
    quizStartedCount: 0,
    quizSubmittedCount: 0,
    quizCompletedCount: 0,
    latestQuizScore: null,
    latestQuizTotal: null,
    bestQuizScore: null,
    updatedAt: new Date().toISOString(),
  };
}

function saveProgress(progress: LearnProgressSnapshot) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export async function trackLearnContentEvent(event: LearnContentEvent): Promise<void> {
  const context = readLearnContentContext();
  if (!context) return;
  if (context.classroomId !== event.classroomId) return;
  const progress = getOrInitProgress(event.classroomId);

  if (event.status === 'slide_viewed') {
    progress.totalSlideViewEvents += 1;
    if (event.sceneId && !progress.viewedSceneIds.includes(event.sceneId)) {
      progress.viewedSceneIds.push(event.sceneId);
    }
  } else if (event.status === 'quiz_started') {
    progress.quizStartedCount += 1;
  } else if (event.status === 'quiz_filled') {
    progress.quizSubmittedCount += 1;
  } else if (event.status === 'quiz_marks') {
    progress.quizCompletedCount += 1;
    const score = event.details?.score;
    const total = event.details?.totalPoints;
    if (typeof score === 'number') {
      progress.latestQuizScore = score;
      progress.bestQuizScore = Math.max(progress.bestQuizScore ?? score, score);
    }
    if (typeof total === 'number') {
      progress.latestQuizTotal = total;
    }
  }
  progress.updatedAt = new Date().toISOString();
  saveProgress(progress);

  try {
    await fetch('/api/learn/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: context.payload,
        sig: context.sig,
        lessonContentId: context.lessonContentId,
        status: event.status,
        details: {
          ...(event.details ?? {}),
          classroomId: event.classroomId,
          sceneId: event.sceneId ?? null,
          progressSummary: {
            uniqueSlidesViewed: progress.viewedSceneIds.length,
            totalSlideViewEvents: progress.totalSlideViewEvents,
            quizStartedCount: progress.quizStartedCount,
            quizSubmittedCount: progress.quizSubmittedCount,
            quizCompletedCount: progress.quizCompletedCount,
            latestQuizScore: progress.latestQuizScore,
            latestQuizTotal: progress.latestQuizTotal,
            bestQuizScore: progress.bestQuizScore,
            updatedAt: progress.updatedAt,
          },
        },
        quiz: event.quiz ?? undefined,
      }),
    });
  } catch {
    // Best-effort analytics path; never block classroom interactions.
  }
}
