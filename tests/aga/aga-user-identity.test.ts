import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildAgaContentBody } from '@/lib/server/aga-content-sync';
import { decodeAndVerifyAgaLaunch } from '@/lib/server/aga-learn-sync';
import { normalizeAgaLaunchUserIds } from '@/lib/aga/aga-user-identity';
import { toStandardBase64 } from '@/lib/aga/redirect-crypto';

const LEARNER = '11111111-1111-4111-8111-111111111111';
const GUEST = '550e8400-e29b-41d4-a716-446655440000';

describe('normalizeAgaLaunchUserIds', () => {
  it('prefers learnerId when both are present', () => {
    const id = normalizeAgaLaunchUserIds({ learnerId: LEARNER, guestSessionId: GUEST });
    expect(id?.userId).toBe(LEARNER);
    expect(id?.learnerId).toBe(LEARNER);
    expect(id?.guestSessionId).toBe(GUEST);
  });

  it('uses guestSessionId when learner is absent', () => {
    const id = normalizeAgaLaunchUserIds({ guestSessionId: GUEST });
    expect(id?.userId).toBe(GUEST);
    expect(id?.learnerId).toBeNull();
  });

  it('returns null when both are blank', () => {
    expect(normalizeAgaLaunchUserIds({ learnerId: '', guestSessionId: null })).toBeNull();
  });
});

describe('buildAgaContentBody userId in details', () => {
  it('includes details.userId from learnerId', () => {
    const body = buildAgaContentBody(
      {
        learnerId: LEARNER,
        guestSessionId: GUEST,
        step: 'lesson',
        classroomId: 'l4gHC6hvRo',
        totalSlides: 5,
      },
      {
        status: 'progress',
        sceneIndex: 2,
        currentSceneId: 'scene-3',
        actionIndex: 0,
        consumedDiscussions: [],
        playbackCompleted: true,
        classroomId: 'l4gHC6hvRo',
      },
    );
    expect(body.learnerId).toBe(LEARNER);
    expect(body.details.userId).toBe(LEARNER);
  });
});

describe('decodeAndVerifyAgaLaunch', () => {
  const secret = 'test-secret-for-aga-user';

  it('rejects launch when both user ids are missing', () => {
    const payload = toStandardBase64(
      JSON.stringify({
        classroomId: 'l4gHC6hvRo',
        step: 'lesson',
        source: 'allen-girls-adventures',
      }),
    );
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    process.env.AI_SCHOOL_REDIRECT_SECRET = secret;
    const result = decodeAndVerifyAgaLaunch(payload, sig);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('missing_user_identity');
  });
});
