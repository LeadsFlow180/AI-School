import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { agaQuizPayloadSchema, forwardQuizResultToAga } from '@/lib/server/aga-content-sync';
import { decodeAndVerifyAgaLaunch } from '@/lib/server/aga-learn-sync';
import { createLogger } from '@/lib/logger';

const log = createLogger('LearnQuiz');

const bodySchema = z.object({
  payload: z.string(),
  sig: z.string(),
  sceneIndex: z.number().int().nonnegative().optional(),
  quiz: agaQuizPayloadSchema,
});

/**
 * Receives graded quiz results from the classroom player and forwards to AGA `/api/learn/content`.
 */
export async function POST(request: NextRequest) {
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body.');
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Invalid quiz payload.');
    }

    const verified = decodeAndVerifyAgaLaunch(parsed.data.payload, parsed.data.sig);
    if (!verified.ok) {
      if (verified.error === 'invalid_signature') {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Invalid launch signature.');
      }
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid launch payload.');
    }

    const result = await forwardQuizResultToAga({
      launch: verified.launch,
      quiz: parsed.data.quiz,
      sceneIndex: parsed.data.sceneIndex ?? 0,
    });

    if (!result.ok) {
      if (result.error === 'aga_site_not_configured') {
        return apiError(
          API_ERROR_CODES.MISSING_API_KEY,
          503,
          'AGA site URL is not configured (AGA_BASE_URL, AGA_SITE_URL, or Main_SCHOOL_SITE_URL).',
        );
      }
      log.warn('quiz sync to AGA failed', result);
      return apiError(
        API_ERROR_CODES.UPSTREAM_ERROR,
        502,
        'Failed to sync quiz result to Allen Girls Adventure.',
        result.error,
      );
    }

    return apiSuccess({ synced: true });
  } catch (error) {
    log.error('learn quiz POST exception', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to save quiz result.',
      error instanceof Error ? error.message : String(error),
    );
  }
}
