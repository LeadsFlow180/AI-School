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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, audioId, ttsProviderId, ttsVoice, ttsSpeed, ttsApiKey, ttsBaseUrl } = body as {
      text: string;
      audioId: string;
      ttsProviderId: TTSProviderId;
      ttsVoice: string;
      ttsSpeed?: number;
      ttsApiKey?: string;
      ttsBaseUrl?: string;
    };

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
      referenceUrl = customVoice?.reference_url || metadataRef || null;
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
      log.info(
        `Generated custom tutor cloned TTS: provider=${ttsProviderId}, voice=${ttsVoice}, audioId=${audioId}, textLen=${text.length}, metadata=${JSON.stringify(
          generated.metadata || {},
        )}`,
      );
    } else {
      // Build provider config
      const config = {
        providerId: ttsProviderId,
        voice: ttsVoice,
        speed: ttsSpeed ?? 1.0,
        apiKey,
        baseUrl,
      };

      log.info(
        `Generating TTS: provider=${ttsProviderId}, voice=${ttsVoice}, audioId=${audioId}, textLen=${text.length}`,
      );

      // Generate audio
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

    // Convert to base64
    const base64 = Buffer.from(audio).toString('base64');

    return apiSuccess({ audioId, base64, format, ttsDebug });
  } catch (error) {
    log.error('TTS generation error:', error);
    return apiError(
      'GENERATION_FAILED',
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
