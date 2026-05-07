/**
 * Single TTS Generation API
 *
 * Generates TTS audio for a single text string and returns base64-encoded audio.
 * Called by the client in parallel for each speech action after a scene is generated.
 *
 * POST /api/generate/tts
 */

import { NextRequest } from 'next/server';
import {
  generateTTS,
  generateClonedTutorTTS,
  resolveVoiceCloneSynthesizeUrl,
} from '@/lib/audio/tts-providers';
import { resolveTTSApiKey, resolveTTSBaseUrl } from '@/lib/server/provider-config';
import type { TTSProviderId } from '@/lib/audio/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';

const log = createLogger('TTS API');

export const maxDuration = 30;

const DEFAULT_TUTOR_AUDIO_BUCKET =
  process.env.SUPABASE_CUSTOM_VOICE_AUDIO_BUCKET ||
  process.env.SUPABASE_CLASSROOM_MEDIA_BUCKET ||
  'classroom-media';

function parseAudioDataUrl(input: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = input.match(/^data:(audio\/[^;]+);base64,(.+)$/i);
  if (!match) return null;
  return {
    mimeType: match[1],
    bytes: new Uint8Array(Buffer.from(match[2], 'base64')),
  };
}

type TTSRequestBody = {
  text: string;
  audioId: string;
  ttsProviderId: TTSProviderId;
  ttsVoice: string;
  ttsSpeed?: number;
  ttsApiKey?: string;
  ttsBaseUrl?: string;
  asyncJob?: boolean;
};

type TTSJobStatus = 'pending' | 'succeeded' | 'failed';
type TTSJobRecord = {
  id: string;
  status: TTSJobStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  result?: {
    audioId: string;
    base64: string;
    format: string;
    ttsDebug: Record<string, unknown>;
  };
  error?: {
    errorCode: string;
    details: string;
    status: number;
  };
};

const TTS_JOB_TTL_MS = 10 * 60 * 1000;
const ttsJobs = new Map<string, TTSJobRecord>();

function cleanupExpiredJobs() {
  const now = Date.now();
  for (const [jobId, job] of ttsJobs.entries()) {
    if (job.expiresAt <= now) ttsJobs.delete(jobId);
  }
}

function setJob(job: TTSJobRecord) {
  ttsJobs.set(job.id, job);
}

async function generateTTSPayload(body: TTSRequestBody) {
  const { text, audioId, ttsProviderId, ttsVoice, ttsSpeed, ttsApiKey, ttsBaseUrl } = body;

  // Validate required fields
  if (!text || !audioId || !ttsProviderId || !ttsVoice) {
    return apiError(
      'MISSING_REQUIRED_FIELD',
      400,
      'Missing required fields: text, audioId, ttsProviderId, ttsVoice',
    );
  }

  // Reject browser-native TTS — must be handled client-side
  if (ttsProviderId === 'browser-native-tts') {
    return apiError('INVALID_REQUEST', 400, 'browser-native-tts must be handled client-side');
  }

  const clientBaseUrl = ttsBaseUrl || undefined;
  if (clientBaseUrl && process.env.NODE_ENV === 'production') {
    const ssrfError = validateUrlForSSRF(clientBaseUrl);
    if (ssrfError) {
      return apiError('INVALID_URL', 403, ssrfError);
    }
  }

  const apiKey = clientBaseUrl
    ? ttsApiKey || ''
    : resolveTTSApiKey(ttsProviderId, ttsApiKey || undefined);
  const baseUrl = clientBaseUrl
    ? clientBaseUrl
    : resolveTTSBaseUrl(ttsProviderId, ttsBaseUrl || undefined);

  let audio: Uint8Array;
  let format: string;
  let ttsDebug: Record<string, unknown> = {
    requestedProviderId: ttsProviderId,
    requestedVoiceId: ttsVoice,
    audioId,
  };

  const adminClient = getSupabaseAdminClient();
  let referenceUrl: string | null = null;
  let metadataPath: string | null = null;
  if (adminClient) {
    const { data: customVoice } = await adminClient
      .from('custom_tutor_voices')
      .select('reference_url, metadata')
      .eq('provider_id', ttsProviderId)
      .eq('provider_voice_id', ttsVoice)
      .maybeSingle();
    const metadataObj =
      customVoice?.metadata && typeof customVoice.metadata === 'object'
        ? (customVoice.metadata as Record<string, unknown>)
        : null;
    const metadataData = Array.isArray(metadataObj?.data)
      ? (metadataObj?.data as Array<Record<string, unknown>>)
      : null;
    const metadataRef =
      (metadataObj?.referenceUrl as string) ||
      (metadataObj?.reference_url as string) ||
      ((metadataObj?.data as Record<string, unknown> | undefined)?.referenceUrl as string) ||
      ((metadataObj?.data as Record<string, unknown> | undefined)?.reference_url as string) ||
      ((metadataData?.[0]?.referenceUrl as string) ||
        (metadataData?.[0]?.reference_url as string) ||
        (metadataData?.[0]?.url as string) ||
        null);
    metadataPath =
      ((metadataObj?.data as Record<string, unknown> | undefined)?.path as string) ||
      (metadataData?.[0]?.path as string) ||
      null;
    const rawReferenceUrl = customVoice?.reference_url || metadataRef || null;
    referenceUrl = typeof rawReferenceUrl === 'string' ? rawReferenceUrl.trim() : null;
    if (!referenceUrl) {
      referenceUrl = null;
    }
  }

  if (referenceUrl) {
    if (adminClient) {
      const parsed = parseAudioDataUrl(referenceUrl);
      if (parsed) {
        const objectPath = `tts-runtime/${Date.now()}-${crypto.randomUUID()}.wav`;
        const { error: uploadErr } = await adminClient.storage
          .from(DEFAULT_TUTOR_AUDIO_BUCKET)
          .upload(objectPath, parsed.bytes, {
            contentType: parsed.mimeType,
            upsert: false,
          });
        if (!uploadErr) {
          const { data: publicData } = adminClient.storage
            .from(DEFAULT_TUTOR_AUDIO_BUCKET)
            .getPublicUrl(objectPath);
          referenceUrl = publicData.publicUrl;
        }
      }
    }

    const synthUrl = resolveVoiceCloneSynthesizeUrl();
    if (!synthUrl) {
      return apiError(
        'MISSING_API_KEY',
        500,
        'Missing VOICE_CLONE_SYNTHESIZE_URL (or VOICE_CLONE_BASE_URL + VOICE_CLONE_SYNTHESIZE_PATH).',
      );
    }

    const candidateReferenceUrls = Array.from(
      new Set(
        [
          referenceUrl,
          metadataPath && adminClient
            ? adminClient.storage.from(DEFAULT_TUTOR_AUDIO_BUCKET).getPublicUrl(metadataPath).data
                .publicUrl
            : null,
        ].filter((u): u is string => !!u),
      ),
    );
    let generated: Awaited<ReturnType<typeof generateClonedTutorTTS>> | null = null;
    let lastCloneError: Error | null = null;
    for (const refUrl of candidateReferenceUrls) {
      try {
        // eslint-disable-next-line no-await-in-loop
        generated = await generateClonedTutorTTS(
          {
            apiUrl: synthUrl,
            apiKey: process.env.VOICE_CLONE_API_KEY || undefined,
            referenceUrl: refUrl,
            speed: ttsSpeed ?? 1.0,
          },
          text,
        );
        referenceUrl = refUrl;
        break;
      } catch (err) {
        lastCloneError = err instanceof Error ? err : new Error(String(err));
      }
    }
    if (!generated) {
      throw lastCloneError || new Error('Failed to synthesize cloned tutor voice.');
    }
    audio = generated.audio;
    format = generated.format;
    ttsDebug = {
      ...ttsDebug,
      path: 'cloned-realtime',
      apiUrl: synthUrl,
      referenceUrl,
      responseMetadata: generated.metadata || null,
    };
  } else {
    const config = {
      providerId: ttsProviderId,
      voice: ttsVoice,
      speed: ttsSpeed ?? 1.0,
      apiKey,
      baseUrl,
    };
    const generated = await generateTTS(config, text);
    audio = generated.audio;
    format = generated.format;
    ttsDebug = {
      ...ttsDebug,
      path: 'provider-direct',
      providerBaseUrl: baseUrl || null,
      responseMetadata: generated.metadata || null,
    };
  }

  return {
    audioId,
    base64: Buffer.from(audio).toString('base64'),
    format,
    ttsDebug,
  };
}

function normalizeTtsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const statusFromError =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
      ? Number((error as { status: number }).status)
      : 0;
  const normalized = message.toLowerCase();
  const isConfigError =
    normalized.includes('api key required') ||
    normalized.includes('missing voice_clone_synthesize_url') ||
    normalized.includes('unknown tts provider') ||
    normalized.includes('unsupported tts provider') ||
    normalized.includes('reference url required');
  const isUpstreamSynthesisFailure =
    normalized.includes('synthesis failed') ||
    normalized.includes('cuda error') ||
    normalized.includes('device-side assert') ||
    normalized.includes('too many concurrent') ||
    normalized.includes('retry shortly') ||
    normalized.includes('rate limit') ||
    normalized.includes('input/output error') ||
    normalized.includes('errno 5');

  if (isConfigError) {
    return { status: 400, code: 'INVALID_REQUEST', message };
  }
  if (statusFromError === 500 && isUpstreamSynthesisFailure) {
    return { status: 502, code: 'UPSTREAM_ERROR', message };
  }
  if (statusFromError > 0) {
    return { status: statusFromError, code: 'UPSTREAM_ERROR', message };
  }
  if (isUpstreamSynthesisFailure) {
    return { status: 502, code: 'UPSTREAM_ERROR', message };
  }
  return { status: 500, code: 'GENERATION_FAILED', message };
}

export async function GET(req: NextRequest) {
  cleanupExpiredJobs();
  const jobId = req.nextUrl.searchParams.get('jobId')?.trim();
  if (!jobId) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required query param: jobId');
  }
  const job = ttsJobs.get(jobId);
  if (!job) {
    return apiError('INVALID_REQUEST', 404, `TTS job "${jobId}" was not found or expired.`);
  }
  if (job.status === 'pending') {
    return apiSuccess({
      jobId: job.id,
      status: 'pending',
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  }
  if (job.status === 'failed') {
    return apiError(
      (job.error?.errorCode as 'INVALID_REQUEST' | 'UPSTREAM_ERROR' | 'GENERATION_FAILED') ||
        'GENERATION_FAILED',
      job.error?.status || 500,
      job.error?.details || 'TTS generation failed.',
      job.id,
    );
  }
  return apiSuccess({
    jobId: job.id,
    status: 'succeeded',
    ...(job.result || {}),
  });
}

export async function POST(req: NextRequest) {
  try {
    cleanupExpiredJobs();
    const body = (await req.json()) as TTSRequestBody;
    const wantsAsyncJob = !!body.asyncJob;

    if (wantsAsyncJob) {
      const jobId = `ttsjob_${crypto.randomUUID()}`;
      const now = Date.now();
      setJob({
        id: jobId,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        expiresAt: now + TTS_JOB_TTL_MS,
      });
      void (async () => {
        try {
          const result = await generateTTSPayload(body);
          if ('status' in result) {
            // apiError() path normalized into failed job
            setJob({
              id: jobId,
              status: 'failed',
              createdAt: now,
              updatedAt: Date.now(),
              expiresAt: Date.now() + TTS_JOB_TTL_MS,
              error: {
                errorCode: 'errorCode' in result ? String(result.errorCode) : 'GENERATION_FAILED',
                details: 'error' in result ? String(result.error) : 'TTS generation failed.',
                status: result.status || 500,
              },
            });
            return;
          }
          setJob({
            id: jobId,
            status: 'succeeded',
            createdAt: now,
            updatedAt: Date.now(),
            expiresAt: Date.now() + TTS_JOB_TTL_MS,
            result,
          });
        } catch (error) {
          const normalized = normalizeTtsError(error);
          setJob({
            id: jobId,
            status: 'failed',
            createdAt: now,
            updatedAt: Date.now(),
            expiresAt: Date.now() + TTS_JOB_TTL_MS,
            error: {
              errorCode: normalized.code,
              details: normalized.message,
              status: normalized.status,
            },
          });
        }
      })();
      return apiSuccess({ jobId, status: 'pending' }, 202);
    }

    const result = await generateTTSPayload(body);
    if ('status' in result) {
      return result;
    }
    return apiSuccess(result);
  } catch (error) {
    const normalized = normalizeTtsError(error);
    if (normalized.status >= 500) log.error('TTS generation error:', error);
    else log.warn('TTS generation error:', normalized.message);
    return apiError(
      normalized.code as 'INVALID_REQUEST' | 'UPSTREAM_ERROR' | 'GENERATION_FAILED',
      normalized.status,
      normalized.message,
    );
  }
}
