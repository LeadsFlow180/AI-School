import { PENDING_SCENE_ID } from '@/lib/store/stage';
import { ladderStepIndex } from '@/lib/aga/redirect-crypto';
import type { AgaLaunchContext } from '@/lib/aga/launch-payload';

export type ClassroomProgressDisplay = {
  /** 1-based slide number for UI */
  currentSlide: number;
  totalSlides: number;
  /** 0–100 how far through this classroom run */
  percentDone: number;
  /** Slides fully played in this session (0-based index + 1 when current slide completed) */
  slidesDone: number;
  sessionComplete: boolean;
  ladderStep?: string;
  ladderStepIndex?: number;
  ladderStepLabel?: string;
};

const LADDER_LABELS: Record<string, string> = {
  start: 'Start',
  lesson: 'Lesson',
  chest: 'Chest',
  practice: 'Practice',
  review: 'Review',
};

export function formatLadderStepLabel(step: string | undefined): string | undefined {
  if (!step) return undefined;
  return LADDER_LABELS[step] ?? step.charAt(0).toUpperCase() + step.slice(1);
}

export function computeClassroomProgressDisplay(
  scenes: { id: string }[],
  currentSceneId: string | null,
  options?: {
    totalSlides?: number;
    playbackCompleted?: boolean;
    agaContext?: AgaLaunchContext | null;
  },
): ClassroomProgressDisplay | null {
  if (scenes.length === 0) return null;

  const isPending = currentSceneId === PENDING_SCENE_ID;
  const sceneIndex = isPending
    ? scenes.length
    : Math.max(0, scenes.findIndex((s) => s.id === currentSceneId));

  const totalSlides =
    options?.agaContext?.totalSlides ??
    options?.totalSlides ??
    scenes.length;

  const safeTotal = Math.max(1, totalSlides);
  const currentSlide = Math.min(sceneIndex + 1, safeTotal);
  const onLastSlide = !isPending && sceneIndex >= safeTotal - 1;
  const sessionComplete = !!(options?.playbackCompleted && onLastSlide);

  const slidesDone = sessionComplete
    ? safeTotal
    : options?.playbackCompleted
      ? Math.min(currentSlide, safeTotal)
      : Math.max(0, currentSlide - 1);

  const percentDone = sessionComplete
    ? 100
    : Math.min(100, Math.round((currentSlide / safeTotal) * 100));

  const ladderStep = options?.agaContext?.step;
  return {
    currentSlide,
    totalSlides: safeTotal,
    percentDone,
    slidesDone,
    sessionComplete,
    ladderStep,
    ladderStepIndex: ladderStep ? ladderStepIndex(ladderStep) : undefined,
    ladderStepLabel: formatLadderStepLabel(ladderStep),
  };
}
