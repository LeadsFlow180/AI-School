import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  agaProgressBodySchema,
  forwardPlaybackProgressToAga,
} from '@/lib/server/aga-learn-sync';
import { createLogger } from '@/lib/logger';

const log = createLogger('LearnProgress');

/**
 * Receives classroom playback progress from the embedded player and forwards it
 * to the Allen Girls Adventure site (AGA Supabase), not AI-School Supabase.
 */
export async function POST(request: NextRequest) {
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body.');
    }

    const parsed = agaProgressBodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Invalid progress payload.');
    }

    const result = await forwardPlaybackProgressToAga(parsed.data);
    if (!result.ok) {
      if (result.error === 'invalid_signature') {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Invalid launch signature.');
      }
      if (result.error === 'invalid_payload') {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid launch payload.');
      }
      if (result.error === 'missing_user_identity') {
        return apiError(
          API_ERROR_CODES.INVALID_REQUEST,
          400,
          'Cannot sync progress without learner or guest identity in the launch payload.',
        );
      }
      if (result.error === 'aga_site_not_configured') {
        return apiError(
          API_ERROR_CODES.MISSING_API_KEY,
          503,
          'AGA site URL is not configured (AGA_BASE_URL, AGA_SITE_URL, or Main_SCHOOL_SITE_URL).',
        );
      }
      return apiError(
        API_ERROR_CODES.UPSTREAM_ERROR,
        502,
        'Failed to sync progress to Allen Girls Adventure.',
        result.error,
      );
    }

    return apiSuccess({ synced: true });
  } catch (error) {
    log.error('learn progress POST exception', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to save progress.',
      error instanceof Error ? error.message : String(error),
    );
  }
}
