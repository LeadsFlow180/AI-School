import { describe, expect, it } from 'vitest';
import { buildAgaQuizContentBody } from '@/lib/server/aga-content-sync';

describe('buildAgaQuizContentBody', () => {
  it('sends status quiz with quiz payload and ladder context', () => {
    const body = buildAgaQuizContentBody(
      {
        guestSessionId: '550e8400-e29b-41d4-a716-446655440000',
        step: 'practice',
        sectionId: 1,
        unitIndex: 0,
        classroomId: 'l4gHC6hvRo',
        totalSlides: 5,
      },
      {
        sceneId: 'quiz-scene-1',
        classroomId: 'l4gHC6hvRo',
        score: 4,
        totalPoints: 5,
        percent: 80,
        correctCount: 4,
        incorrectCount: 1,
        questionCount: 5,
        submittedAt: '2026-05-22T00:00:00.000Z',
        results: [
          { questionId: 'q1', correct: true, status: 'correct', earned: 1 },
        ],
      },
      3,
    );

    expect(body.status).toBe('quiz');
    expect(body.quiz?.percent).toBe(80);
    expect(body.details.ladderStep).toBe('practice');
    expect(body.details.sceneIndex).toBe(3);
    expect(body.details.classroomId).toBe('l4gHC6hvRo');
    expect(body.details.userId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('uses learnerId for details.userId when logged in', () => {
    const learnerId = '11111111-1111-4111-8111-111111111111';
    const body = buildAgaQuizContentBody(
      {
        learnerId,
        guestSessionId: '550e8400-e29b-41d4-a716-446655440000',
        step: 'lesson',
        classroomId: 'l4gHC6hvRo',
        totalSlides: 5,
      },
      {
        sceneId: 'quiz-scene-1',
        classroomId: 'l4gHC6hvRo',
        score: 5,
        totalPoints: 5,
        percent: 100,
        correctCount: 5,
        incorrectCount: 0,
        questionCount: 5,
        submittedAt: '2026-05-22T00:00:00.000Z',
        results: [],
      },
      0,
    );
    expect(body.details.userId).toBe(learnerId);
    expect(body.learnerId).toBe(learnerId);
  });
});
