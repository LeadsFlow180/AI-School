import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import {
  fromPayloadEncoded,
  isAgaPayloadExpired,
  verifyAgaPayloadSignature,
} from '@/lib/aga/redirect-crypto';
import {
  buildAgaContentBody,
  postAgaContent,
  type AgaLaunchFields,
} from '@/lib/server/aga-content-sync';

const log = createLogger('AgaLearnSync');

const launchPayloadSchema = z.object({
  learnerId: z.string().uuid().nullable().optional(),
  guestSessionId: z.string().uuid().nullable().optional(),
  language: z.string().optional(),
  sectionId: z.union([z.string(), z.number()]).optional(),
  unitIndex: z.number().optional(),
  step: z.string().optional(),
  dbSectionId: z.union([z.string(), z.number()]).optional(),
  dbUnitId: z.union([z.string(), z.number(), z.null()]).optional(),
  classroomId: z.string().optional(),
  resumeSceneIndex: z.number().int().nonnegative().nullable().optional(),
  resumeSceneId: z.string().nullable().optional(),
  totalSlides: z.number().int().positive().nullable().optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  nonce: z.string().optional(),
  source: z.string().optional(),
});

export type VerifiedAgaLaunch = z.infer<typeof launchPayloadSchema>;

export const agaProgressBodySchema = z.object({
  payload: z.string(),
  sig: z.string(),
  classroomId: z.string().min(1),
  currentSceneId: z.string().nullable().optional(),
  sceneIndex: z.number().int().nonnegative().optional(),
  actionIndex: z.number().int().nonnegative().optional(),
  consumedDiscussions: z.array(z.string()).optional(),
  playbackCompleted: z.boolean().optional(),
});

export type AgaProgressBody = z.infer<typeof agaProgressBodySchema>;

export function decodeAndVerifyAgaLaunch(
  payloadEncoded: string,
  sig: string,
): { ok: true; launch: VerifiedAgaLaunch } | { ok: false; error: string } {
  const secret = process.env.AI_SCHOOL_REDIRECT_SECRET?.trim() || '';
  if (secret && !verifyAgaPayloadSignature(payloadEncoded, sig, secret)) {
    return { ok: false, error: 'invalid_signature' };
  }

  let payloadJson: string;
  try {
    payloadJson = fromPayloadEncoded(payloadEncoded);
  } catch {
    return { ok: false, error: 'invalid_payload_encoding' };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(payloadJson);
  } catch {
    return { ok: false, error: 'invalid_payload_json' };
  }

  const parsed = launchPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    log.warn('invalid AGA launch payload', { issues: parsed.error.issues });
    return { ok: false, error: 'invalid_payload' };
  }

  if (isAgaPayloadExpired(parsed.data.expiresAt)) {
    return { ok: false, error: 'expired' };
  }

  return { ok: true, launch: parsed.data };
}

/**
 * Forward playback progress to Allen Girls Adventure `/api/learn/content`.
 */
export async function forwardPlaybackProgressToAga(body: AgaProgressBody): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
}> {
  const verified = decodeAndVerifyAgaLaunch(body.payload, body.sig);
  if (!verified.ok) {
    return { ok: false, error: verified.error };
  }

  const launch = verified.launch as AgaLaunchFields;
  const playbackCompleted = !!body.playbackCompleted;
  const status = playbackCompleted ? 'complete' : 'progress';

  const contentBody = buildAgaContentBody(launch, {
    status,
    sceneIndex: body.sceneIndex ?? 0,
    currentSceneId: body.currentSceneId ?? null,
    actionIndex: body.actionIndex ?? 0,
    consumedDiscussions: body.consumedDiscussions ?? [],
    playbackCompleted,
    classroomId: body.classroomId,
  });

  return postAgaContent(contentBody);
}
