import { describe, expect, it } from 'vitest';
import {
  effectiveAgaTotalSlides,
  isAgaMissionComplete,
} from '@/lib/classroom/aga-mission-complete';

describe('isAgaMissionComplete', () => {
  it('is false after slide 2 of a 5-slide classroom', () => {
    expect(
      isAgaMissionComplete({ sceneIndex: 1, slideCompleted: true, sceneCount: 5 }),
    ).toBe(false);
  });

  it('is true only after the last slide of the classroom', () => {
    expect(
      isAgaMissionComplete({ sceneIndex: 4, slideCompleted: true, sceneCount: 5 }),
    ).toBe(true);
  });

  it('is false when the slide was not completed', () => {
    expect(
      isAgaMissionComplete({ sceneIndex: 4, slideCompleted: false, sceneCount: 5 }),
    ).toBe(false);
  });
});

describe('effectiveAgaTotalSlides', () => {
  it('prefers live classroom scene count over launch totalSlides', () => {
    expect(effectiveAgaTotalSlides(5, 2)).toBe(5);
  });
});
