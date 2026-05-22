import { describe, expect, it } from 'vitest';
import { computeClassroomProgressDisplay } from '@/lib/classroom/classroom-progress-display';

describe('computeClassroomProgressDisplay', () => {
  const scenes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];

  it('reports slide position and percent from AGA totalSlides', () => {
    const display = computeClassroomProgressDisplay(scenes, 'c', {
      agaContext: {
        classroomId: 'l4gHC6hvRo',
        totalSlides: 5,
        step: 'lesson',
      },
    });
    expect(display?.currentSlide).toBe(3);
    expect(display?.totalSlides).toBe(5);
    expect(display?.percentDone).toBe(60);
    expect(display?.ladderStepLabel).toBe('Lesson');
  });

  it('reaches 100% when session completes on last slide', () => {
    const display = computeClassroomProgressDisplay(scenes, 'e', {
      playbackCompleted: true,
      agaContext: { classroomId: 'l4gHC6hvRo', totalSlides: 5, step: 'review' },
    });
    expect(display?.sessionComplete).toBe(true);
    expect(display?.percentDone).toBe(100);
    expect(display?.slidesDone).toBe(5);
  });
});
