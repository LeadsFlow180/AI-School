import { describe, expect, it } from 'vitest';
import {
  fromPayloadEncoded,
  ladderStepIndex,
  signAgaBody,
  toStandardBase64,
  verifyAgaPayloadSignature,
} from '@/lib/aga/redirect-crypto';
import { buildAgaContentBody } from '@/lib/server/aga-content-sync';

describe('aga redirect-crypto', () => {
  const secret = 'test-secret-for-aga';

  it('signs body with standard base64 JSON (hex digest)', () => {
    const body = {
      learnerId: null,
      guestSessionId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'progress' as const,
      source: 'allen-girls-adventures',
      details: {
        classroomId: 'l4gHC6hvRo',
        ladderStep: 'start',
        ladderStepIndex: 0,
        sceneIndex: 1,
        playbackCompleted: false,
      },
    };
    const sig = signAgaBody(body, secret);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    const json = JSON.stringify(body);
    const b64 = toStandardBase64(json);
    expect(verifyAgaPayloadSignature(b64, sig, secret)).toBe(true);
  });

  it('decodes standard base64 payload param', () => {
    const payload = {
      guestSessionId: '550e8400-e29b-41d4-a716-446655440000',
      step: 'lesson',
      classroomId: 'l4gHC6hvRo',
      resumeSceneIndex: 2,
      source: 'allen-girls-adventures',
    };
    const encoded = toStandardBase64(JSON.stringify(payload));
    const decoded = JSON.parse(fromPayloadEncoded(encoded));
    expect(decoded.step).toBe('lesson');
    expect(decoded.resumeSceneIndex).toBe(2);
  });

  it('maps ladder steps to indices', () => {
    expect(ladderStepIndex('start')).toBe(0);
    expect(ladderStepIndex('lesson')).toBe(1);
    expect(ladderStepIndex('chest')).toBe(2);
    expect(ladderStepIndex('practice')).toBe(3);
    expect(ladderStepIndex('review')).toBe(4);
  });

  it('buildAgaContentBody uses progress/complete status and classroom id', () => {
    const progress = buildAgaContentBody(
      {
        learnerId: '11111111-1111-4111-8111-111111111111',
        guestSessionId: '550e8400-e29b-41d4-a716-446655440000',
        step: 'practice',
        sectionId: 1,
        unitIndex: 0,
        classroomId: 'l4gHC6hvRo',
        totalSlides: 5,
      },
      {
        status: 'progress',
        sceneIndex: 3,
        currentSceneId: 'scene-4',
        actionIndex: 1,
        consumedDiscussions: [],
        playbackCompleted: false,
        classroomId: 'l4gHC6hvRo',
      },
    );
    expect(progress.status).toBe('progress');
    expect(progress.details.ladderStep).toBe('practice');
    expect(progress.details.ladderStepIndex).toBe(3);
    expect(progress.details.classroomId).toBe('l4gHC6hvRo');
    expect(progress.details.playbackCompleted).toBe(false);
    expect(progress.details.userId).toBe('11111111-1111-4111-8111-111111111111');

    const complete = buildAgaContentBody(
      {
        learnerId: '11111111-1111-4111-8111-111111111111',
        step: 'practice',
        classroomId: 'l4gHC6hvRo',
        totalSlides: 5,
      },
      {
        status: 'complete',
        sceneIndex: 4,
        currentSceneId: 'scene-5',
        actionIndex: 0,
        consumedDiscussions: [],
        playbackCompleted: true,
        classroomId: 'l4gHC6hvRo',
      },
    );
    expect(complete.status).toBe('complete');
    expect(complete.details.playbackCompleted).toBe(true);
  });
});
