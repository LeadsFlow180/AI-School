import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { AGA_DEFAULT_TOTAL_SLIDES } from '@/lib/aga/redirect-crypto';
import { decodeAndVerifyAgaLaunch } from '@/lib/server/aga-learn-sync';
import { z } from 'zod';

const bodySchema = z.object({
  payload: z.string(),
  sig: z.string(),
  classroomId: z.string().min(1).optional(),
});

/**
 * Verify AGA signed redirect payload before classroom playback starts.
 */
export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body.');
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'payload and sig are required.');
  }

  const verified = decodeAndVerifyAgaLaunch(parsed.data.payload, parsed.data.sig);
  if (!verified.ok) {
    if (verified.error === 'invalid_signature') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Invalid launch signature.');
    }
    if (verified.error === 'expired') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Launch link has expired.');
    }
    if (verified.error === 'missing_user_identity') {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        'Launch link is missing learner or guest identity. Sign in on Allen Girls Adventures and try again.',
      );
    }
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid launch payload.');
  }

  const launch = verified.launch;
  const routeClassroomId = parsed.data.classroomId?.trim() || launch.classroomId?.trim() || '';
  const classroomId = routeClassroomId || launch.classroomId || '';
  const totalSlides =
    typeof launch.totalSlides === 'number' && launch.totalSlides > 0
      ? launch.totalSlides
      : AGA_DEFAULT_TOTAL_SLIDES;

  return apiSuccess({
    verified: true,
    context: {
      ...launch,
      classroomId,
      totalSlides,
    },
  });
}
