import { describe, expect, it } from 'vitest';
import { resolveAgaResumeTargetIndex } from '@/lib/classroom/aga-resume';

describe('resolveAgaResumeTargetIndex', () => {
  const sceneCount = 5;

  it('opens slide 1 when AGA sends no resume progress', () => {
    expect(resolveAgaResumeTargetIndex({}, sceneCount)).toBe(0);
  });

  it('opens slide 4 when three slides were completed (index 2 + completed)', () => {
    expect(
      resolveAgaResumeTargetIndex(
        { resumeSceneIndex: 2, resumePlaybackCompleted: true },
        sceneCount,
      ),
    ).toBe(3);
  });

  it('stays on slide 3 when slide 3 was opened but not completed', () => {
    expect(
      resolveAgaResumeTargetIndex(
        { resumeSceneIndex: 2, resumePlaybackCompleted: false },
        sceneCount,
      ),
    ).toBe(2);
  });

  it('opens slide 4 when AGA already points at next slide index', () => {
    expect(resolveAgaResumeTargetIndex({ resumeSceneIndex: 3 }, sceneCount)).toBe(3);
  });
});
