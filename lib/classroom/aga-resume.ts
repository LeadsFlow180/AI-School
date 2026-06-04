/**
 * Resolve which slide to open when launching a classroom from AGA.
 *
 * - `resumeSceneIndex` is the last known 0-based slide index from AGA.
 * - When that slide was fully played (`resumePlaybackCompleted`), open the next slide.
 * - With no resume fields, start at slide 1 (index 0).
 */
export function resolveAgaResumeTargetIndex(
  input: {
    resumeSceneIndex?: number | null;
    resumeSceneId?: string | null;
    resumePlaybackCompleted?: boolean | null;
  },
  sceneCount: number,
): number {
  if (sceneCount <= 0) return 0;

  const hasResumeIndex = typeof input.resumeSceneIndex === 'number' && input.resumeSceneIndex >= 0;
  const hasResumeId = !!input.resumeSceneId?.trim();

  if (!hasResumeIndex && !hasResumeId) {
    return 0;
  }

  let index = hasResumeIndex ? input.resumeSceneIndex! : 0;
  if (input.resumePlaybackCompleted === true) {
    index += 1;
  }

  return Math.min(Math.max(0, index), sceneCount - 1);
}
