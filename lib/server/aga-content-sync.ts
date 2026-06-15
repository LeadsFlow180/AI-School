import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import {
  AGA_DEFAULT_CLASSROOM_ID,
  AGA_SOURCE,
  ladderStepIndex,
  signAgaBody,
} from '@/lib/aga/redirect-crypto';
import { normalizeAgaLaunchUserIds } from '@/lib/aga/aga-user-identity';
import type { QuizResultPayload } from '@/lib/types/quiz-result';

const log = createLogger('AgaContentSync');

export const agaProgressDetailsSchema = z.object({
  classroomId: z.string().min(1),
  sectionId: z.union([z.string(), z.number()]).optional(),
  unitIndex: z.number().optional(),
  dbSectionId: z.union([z.string(), z.number()]).optional(),
  dbUnitId: z.union([z.string(), z.number(), z.null()]).optional(),
  ladderStep: z.string().optional(),
  ladderStepIndex: z.number().int().nonnegative().optional(),
  totalSlides: z.number().int().positive().optional(),
  sceneIndex: z.number().int().nonnegative().optional(),
  currentSceneId: z.string().nullable().optional(),
  actionIndex: z.number().int().nonnegative().optional(),
  consumedDiscussions: z.array(z.string()).optional(),
  playbackCompleted: z.boolean().optional(),
  /** learnerId ?? guestSessionId — required on every AGA progress row */
  userId: z.string().uuid(),
});

export const agaQuizPayloadSchema = z.object({
  sceneId: z.string(),
  classroomId: z.string(),
  score: z.number(),
  totalPoints: z.number(),
  percent: z.number().int().min(0).max(100),
  correctCount: z.number().int().nonnegative(),
  incorrectCount: z.number().int().nonnegative(),
  questionCount: z.number().int().positive(),
  submittedAt: z.string(),
  results: z.array(
    z.object({
      questionId: z.string(),
      correct: z.boolean().nullable().optional(),
      status: z.enum(['correct', 'incorrect']),
      earned: z.number(),
      aiComment: z.string().optional(),
    }),
  ),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
});

export const agaContentSyncInputSchema = z.object({
  learnerId: z.string().uuid().nullable().optional(),
  guestSessionId: z.string().uuid().nullable().optional(),
  status: z.enum(['progress', 'complete', 'quiz']),
  details: agaProgressDetailsSchema,
  quiz: agaQuizPayloadSchema.optional(),
});

export type AgaContentSyncInput = z.infer<typeof agaContentSyncInputSchema>;

export type AgaLaunchFields = {
  learnerId?: string | null;
  guestSessionId?: string | null;
  sectionId?: string | number;
  unitIndex?: number;
  step?: string;
  dbSectionId?: string | number;
  dbUnitId?: string | number | null;
  classroomId?: string;
  totalSlides?: number | null;
};

function getAgaBaseUrl(): string {
  return (
    process.env.AGA_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_AGA_BASE_URL?.trim() ||
    process.env.AGA_SITE_URL?.trim() ||
    process.env.Main_SCHOOL_SITE_URL?.trim() ||
    ''
  );
}

function getAgaProgressPath(): string {
  const path = process.env.AGA_LEARN_PROGRESS_PATH?.trim() || '/api/learn/content';
  return path.startsWith('/') ? path : `/${path}`;
}

function userFieldsFromLaunch(launch: AgaLaunchFields) {
  const identity = normalizeAgaLaunchUserIds(launch);
  if (!identity) {
    throw new Error('missing_user_identity');
  }
  return identity;
}

export function buildAgaContentBody(
  launch: AgaLaunchFields,
  input: {
    status: 'progress' | 'complete';
    sceneIndex: number;
    currentSceneId: string | null;
    actionIndex: number;
    consumedDiscussions: string[];
    playbackCompleted: boolean;
    classroomId: string;
  },
): AgaContentSyncInput {
  const { learnerId, guestSessionId, userId } = userFieldsFromLaunch(launch);
  const ladderStep = launch.step || 'start';
  const classroomId = launch.classroomId?.trim() || input.classroomId || AGA_DEFAULT_CLASSROOM_ID;
  const totalSlides =
    typeof launch.totalSlides === 'number' && launch.totalSlides > 0
      ? launch.totalSlides
      : input.playbackCompleted
        ? input.sceneIndex + 1
        : 5;

  return {
    learnerId,
    guestSessionId,
    status: input.status,
    details: {
      classroomId,
      sectionId: launch.sectionId,
      unitIndex: launch.unitIndex,
      dbSectionId: launch.dbSectionId,
      dbUnitId: launch.dbUnitId ?? null,
      ladderStep,
      ladderStepIndex: ladderStepIndex(ladderStep),
      totalSlides,
      sceneIndex: input.sceneIndex,
      currentSceneId: input.currentSceneId,
      actionIndex: input.actionIndex,
      consumedDiscussions: input.consumedDiscussions,
      playbackCompleted: input.playbackCompleted,
      userId,
    },
  };
}

/**
 * POST signed progress/complete payload to AGA `/api/learn/content`.
 */
export async function postAgaContent(body: AgaContentSyncInput): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
}> {
  const agaBase = getAgaBaseUrl();
  if (!agaBase) {
    log.warn('AGA_BASE_URL / AGA_SITE_URL not configured; skipping AGA content sync');
    return { ok: false, error: 'aga_site_not_configured' };
  }

  if (!body.details.userId) {
    log.warn('AGA content sync skipped: missing details.userId');
    return { ok: false, error: 'missing_user_identity' };
  }

  const secret = process.env.AI_SCHOOL_REDIRECT_SECRET?.trim() || '';
  const payload = { ...body, source: AGA_SOURCE };
  const sig = secret ? signAgaBody(payload as Record<string, unknown>, secret) : '';
  const targetUrl = `${agaBase.replace(/\/$/, '')}${getAgaProgressPath()}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, sig }),
    });
    const responseText = await response.text();
    if (!response.ok) {
      log.warn('AGA content sync failed', { status: response.status, body: responseText });
      return { ok: false, status: response.status, error: responseText || 'aga_sync_failed' };
    }
    log.info('AGA content sync ok', {
      status: response.status,
      classroomId: body.details.classroomId,
      userId: body.details.userId,
      learnerId: body.learnerId,
      syncStatus: body.status,
      sceneId: body.quiz?.sceneId,
    });
    return { ok: true, status: response.status };
  } catch (error) {
    log.error('AGA content sync exception', error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** POST graded quiz results to AGA (`status: quiz` + top-level `quiz` object). */
export function buildAgaQuizContentBody(
  launch: AgaLaunchFields,
  quiz: QuizResultPayload,
  sceneIndex: number,
): AgaContentSyncInput {
  const { learnerId, guestSessionId, userId } = userFieldsFromLaunch(launch);
  const ladderStep = launch.step || 'start';
  const classroomId = launch.classroomId?.trim() || quiz.classroomId || AGA_DEFAULT_CLASSROOM_ID;
  const totalSlides =
    typeof launch.totalSlides === 'number' && launch.totalSlides > 0 ? launch.totalSlides : 5;

  return {
    learnerId,
    guestSessionId,
    status: 'quiz',
    details: {
      classroomId,
      sectionId: launch.sectionId,
      unitIndex: launch.unitIndex,
      dbSectionId: launch.dbSectionId,
      dbUnitId: launch.dbUnitId ?? null,
      ladderStep,
      ladderStepIndex: ladderStepIndex(ladderStep),
      totalSlides,
      sceneIndex,
      currentSceneId: quiz.sceneId,
      actionIndex: 0,
      consumedDiscussions: [],
      playbackCompleted: false,
      userId,
    },
    quiz: {
      sceneId: quiz.sceneId,
      classroomId: quiz.classroomId,
      score: quiz.score,
      totalPoints: quiz.totalPoints,
      percent: quiz.percent,
      correctCount: quiz.correctCount,
      incorrectCount: quiz.incorrectCount,
      questionCount: quiz.questionCount,
      submittedAt: quiz.submittedAt,
      results: quiz.results,
      answers: quiz.answers,
    },
  };
}

export async function forwardQuizResultToAga(input: {
  launch: AgaLaunchFields;
  quiz: QuizResultPayload;
  sceneIndex: number;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  return postAgaContent(buildAgaQuizContentBody(input.launch, input.quiz, input.sceneIndex));
}
