/**
 * TTS (Text-to-Speech) Provider Implementation
 *
 * Factory pattern for routing TTS requests to appropriate provider implementations.
 * Follows the same architecture as lib/ai/providers.ts for consistency.
 *
 * Currently Supported Providers:
 * - OpenAI TTS: https://platform.openai.com/docs/guides/text-to-speech
 * - Azure TTS: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech
 * - GLM TTS: https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-tts
 * - Qwen TTS: https://bailian.console.aliyun.com/
 * - ElevenLabs TTS: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 * - Browser Native: Web Speech API (client-side only)
 *
 * HOW TO ADD A NEW PROVIDER:
 *
 * 1. Add provider ID to TTSProviderId in lib/audio/types.ts
 *    Example: | 'elevenlabs-tts'
 *
 * 2. Add provider configuration to lib/audio/constants.ts
 *    Example:
 *    'elevenlabs-tts': {
 *      id: 'elevenlabs-tts',
 *      name: 'ElevenLabs',
 *      requiresApiKey: true,
 *      defaultBaseUrl: 'https://api.elevenlabs.io/v1',
 *      icon: '/logos/elevenlabs.svg',
 *      voices: [...],
 *      supportedFormats: ['mp3', 'pcm'],
 *      speedRange: { min: 0.5, max: 2.0, default: 1.0 }
 *    }
 *
 * 3. Implement provider function in this file
 *    Pattern: async function generateXxxTTS(config, text): Promise<TTSGenerationResult>
 *    - Validate config and build API request
 *    - Handle API authentication (apiKey, headers)
 *    - Convert provider-specific parameters (voice, speed, format)
 *    - Return { audio: Uint8Array, format: string }
 *
 *    Example:
 *    async function generateElevenLabsTTS(
 *      config: TTSModelConfig,
 *      text: string
 *    ): Promise<TTSGenerationResult> {
 *      const baseUrl = config.baseUrl || TTS_PROVIDERS['elevenlabs-tts'].defaultBaseUrl;
 *
 *      const response = await fetch(`${baseUrl}/text-to-speech/${config.voice}`, {
 *        method: 'POST',
 *        headers: {
 *          'xi-api-key': config.apiKey!,
 *          'Content-Type': 'application/json',
 *        },
 *        body: JSON.stringify({
 *          text,
 *          model_id: 'eleven_multilingual_v2',
 *          voice_settings: {
 *            stability: 0.5,
 *            similarity_boost: 0.75,
 *          }
 *        }),
 *      });
 *
 *      if (!response.ok) {
 *        throw new Error(`ElevenLabs TTS API error: ${response.statusText}`);
 *      }
 *
 *      const arrayBuffer = await response.arrayBuffer();
 *      return {
 *        audio: new Uint8Array(arrayBuffer),
 *        format: 'mp3',
 *      };
 *    }
 *
 * 4. Add case to generateTTS() switch statement
 *    case 'elevenlabs-tts':
 *      return await generateElevenLabsTTS(config, text);
 *
 * 5. Add i18n translations in lib/i18n.ts
 *    providerElevenLabsTTS: { zh: 'ElevenLabs TTS', en: 'ElevenLabs TTS' }
 *
 * Error Handling Patterns:
 * - Always validate API key if requiresApiKey is true
 * - Throw descriptive errors for API failures
 * - Include response.statusText or error messages from API
 * - For client-only providers (browser-native), throw error directing to client-side usage
 *
 * API Call Patterns:
 * - Direct API: Use fetch with appropriate headers and body format (recommended for better encoding support)
 * - SSML: For Azure-like providers requiring SSML markup
 * - URL-based: For providers returning audio URL (download in second step)
 */

import type { TTSModelConfig } from './types';
import { TTS_PROVIDERS } from './constants';

/**
 * Result of TTS generation
 */
export interface TTSGenerationResult {
  audio: Uint8Array;
  format: string;
  metadata?: Record<string, unknown> | null;
}

export interface ClonedTutorSynthesizeConfig {
  apiUrl: string;
  apiKey?: string;
  referenceUrl: string;
  speed?: number;
  language?: string;
}

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function buildSynthesizeCandidateUrls(apiUrl: string): string[] {
  const trimmed = apiUrl.trim();
  if (!trimmed) return [];

  const normalized = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  const lower = normalized.toLowerCase();
  const isDirectSynthesize = lower.endsWith('/synthesize');

  // Reason: Some deployments return HTTP 200 on root "/" with an index payload.
  // If we try root first, that successful non-audio response prevents reaching the
  // real synth endpoint. Always prioritize /synthesize forms.
  const synthBase = isDirectSynthesize ? normalized : `${normalized}/synthesize`;
  const direct = isDirectSynthesize ? normalized : joinUrl(normalized, '/synthesize');

  return Array.from(
    new Set([
      direct,
      synthBase,
      synthBase.endsWith('/') ? synthBase : `${synthBase}/`,
      // Keep original URL only when caller already provided a synth endpoint.
      ...(isDirectSynthesize ? [normalized, `${normalized}/`] : []),
    ]),
  );
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Synthesize response audioUrl is not a valid base64 data URL.');
  }
  const mimeType = match[1] || 'audio/wav';
  const base64 = match[2] || '';
  const buffer = Buffer.from(base64, 'base64');
  return { mimeType, bytes: new Uint8Array(buffer) };
}

function getFormatFromMime(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'wav';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw Object.assign(new Error(`TTS request timed out after ${timeoutMs}ms`), { status: 524 });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function parseRetryAfterSeconds(headers: Headers, body: unknown): number {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const numeric = Number(retryAfter);
    if (!Number.isNaN(numeric) && numeric > 0) return Math.floor(numeric);
    const dateMs = Date.parse(retryAfter);
    if (!Number.isNaN(dateMs)) {
      const seconds = Math.ceil((dateMs - Date.now()) / 1000);
      if (seconds > 0) return seconds;
    }
  }

  const bodyRetry = Number((body as { retry_after_seconds?: unknown } | null)?.retry_after_seconds || 0);
  return Number.isFinite(bodyRetry) && bodyRetry > 0 ? Math.floor(bodyRetry) : 0;
}

export async function generateClonedTutorTTS(
  config: ClonedTutorSynthesizeConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const language = config.language || process.env.VOICE_CLONE_DEFAULT_LANGUAGE || 'en';
  const speed = Math.min(2, Math.max(0.5, config.speed ?? 1.0));
  const fullPayload = {
    text,
    referenceUrl: config.referenceUrl,
    reference_url: config.referenceUrl,
    referenceAudioUrl: config.referenceUrl,
    reference_audio_url: config.referenceUrl,
    language,
    emotion: process.env.VOICE_CLONE_DEFAULT_EMOTION || 'neutral',
    emotion_intensity: Number(process.env.VOICE_CLONE_DEFAULT_EMOTION_INTENSITY || 5),
    speed,
    pitch: Number(process.env.VOICE_CLONE_DEFAULT_PITCH || 0),
    energy_level: Number(process.env.VOICE_CLONE_DEFAULT_ENERGY_LEVEL || 5),
    expressions_already_added: true,
    personality: {
      dominant_trait: process.env.VOICE_CLONE_PERSONALITY_TRAIT || 'friendly',
      all_traits: [process.env.VOICE_CLONE_PERSONALITY_TRAIT || 'friendly'],
      speaking_style: process.env.VOICE_CLONE_PERSONALITY_STYLE || 'conversational',
      intensity: Number(process.env.VOICE_CLONE_PERSONALITY_INTENSITY || 5),
    },
  };
  const minimalPayload = {
    text,
    referenceUrl: config.referenceUrl,
    reference_url: config.referenceUrl,
    referenceAudioUrl: config.referenceUrl,
    reference_audio_url: config.referenceUrl,
    language,
    speed,
  };
  const altMinimalPayload = {
    text,
    referenceUrl: config.referenceUrl,
    reference_url: config.referenceUrl,
    referenceAudioUrl: config.referenceUrl,
    reference_audio_url: config.referenceUrl,
    language,
    speed,
  };
  const payloadBodies = [
    JSON.stringify(fullPayload),
    JSON.stringify(minimalPayload),
    JSON.stringify(altMinimalPayload),
  ];
  const candidateUrls = buildSynthesizeCandidateUrls(config.apiUrl);

  let response: Response | null = null;
  let textBody = '';
  let jsonBody: Record<string, unknown> = {};
  let attemptedUrl = config.apiUrl;
  const maxRetries = Number(process.env.TTS_503_MAX_RETRIES || 2);
  const maxTimeoutRetries = Number(process.env.TTS_524_MAX_RETRIES || 0);
  const minBackoffMs = Number(process.env.TTS_503_MIN_BACKOFF_MS || 2000);
  const maxBackoffMs = Number(process.env.TTS_503_MAX_BACKOFF_MS || 10000);
  const requestTimeoutMs = Number(process.env.TTS_UPSTREAM_TIMEOUT_MS || 180000);
  for (const payloadBody of payloadBodies) {
    for (const url of candidateUrls) {
      attemptedUrl = url;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let res: Response;
        try {
          res = await fetchWithTimeout(
            url,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
              },
              body: payloadBody,
            },
            requestTimeoutMs,
          );
        } catch (err) {
          const status =
            typeof err === 'object' &&
            err !== null &&
            'status' in err &&
            typeof (err as { status?: unknown }).status === 'number'
              ? Number((err as { status: number }).status)
              : 0;
          if (status === 524 && attempt < maxTimeoutRetries) {
            const backoffBaseMs = Math.min(maxBackoffMs, minBackoffMs * 2 ** attempt);
            const jitter = Math.floor(Math.random() * 300);
            await sleep(backoffBaseMs + jitter);
            continue;
          }
          throw err;
        }
        const body = await res.text().catch(() => '');
        let parsedBody: Record<string, unknown> = {};
        try {
          parsedBody = body ? (JSON.parse(body) as Record<string, unknown>) : {};
        } catch {
          parsedBody = {};
        }
        response = res;
        textBody = body;
        jsonBody = parsedBody;
        if (res.ok) break;

        const retryBudget = res.status === 524 ? maxTimeoutRetries : maxRetries;
        if ((res.status === 503 || res.status === 524) && attempt < retryBudget) {
          const retryAfterSec = Math.max(2, parseRetryAfterSeconds(res.headers, parsedBody));
          const retryFromHeader = retryAfterSec * 1000;
          const backoffBaseMs = Math.min(maxBackoffMs, minBackoffMs * 2 ** attempt);
          const backoffMs = Math.max(retryFromHeader, backoffBaseMs);
          const jitter = Math.floor(Math.random() * 300);
          await sleep(backoffMs + jitter);
          continue;
        }

        if (res.status === 503 || res.status === 524) {
          throw Object.assign(new Error(String(parsedBody.error || body || 'TTS overloaded or timed out')), {
            status: res.status,
          });
        }

        // Retry on common route-shape mismatch statuses.
        if (res.status === 404 || res.status === 405 || res.status === 308 || res.status === 307) {
          break;
        }

        throw Object.assign(
          new Error(
            String(parsedBody.error || body || `Custom voice synthesize request failed: HTTP ${res.status}`),
          ),
          { status: res.status },
        );
      }

      if (response?.ok) break;

      // For route-shape mismatch statuses, continue to next URL/payload candidate.
      if (
        response &&
        response.status !== 404 &&
        response.status !== 405 &&
        response.status !== 308 &&
        response.status !== 307
      ) {
        break;
      }
    }
    if (response?.ok) break;
  }

  if (!response) {
    throw new Error('Custom voice synthesize request failed: no response received.');
  }

  const payload: {
    success?: boolean;
    data?: { audioUrl?: string };
    metadata?: Record<string, unknown>;
    error?: string;
  } = jsonBody as {
    success?: boolean;
    data?: { audioUrl?: string };
    metadata?: Record<string, unknown>;
    error?: string;
  };

  if (!response.ok) {
    throw Object.assign(
      new Error(
        payload.error ||
          textBody ||
          `Custom voice synthesize request failed: HTTP ${response.status} at ${attemptedUrl}`,
      ),
      { status: response.status },
    );
  }

  if (!payload.success || !payload.data?.audioUrl) {
    throw Object.assign(
      new Error(
        payload.error ||
          textBody ||
          `Custom voice synthesize request failed: invalid payload at ${attemptedUrl}`,
      ),
      { status: response.status || 502 },
    );
  }

  const audioUrl = payload.data.audioUrl;
  if (audioUrl.startsWith('data:')) {
    const { mimeType, bytes } = parseDataUrl(audioUrl);
    return {
      audio: bytes,
      format: getFormatFromMime(mimeType),
      metadata: payload.metadata || null,
    };
  }

  const externalResponse = await fetchWithTimeout(audioUrl, {}, requestTimeoutMs);
  if (!externalResponse.ok) {
    throw Object.assign(new Error(`Failed to download synthesized audio: HTTP ${externalResponse.status}`), {
      status: externalResponse.status,
    });
  }
  const arrayBuffer = await externalResponse.arrayBuffer();
  const mimeType = externalResponse.headers.get('content-type') || 'audio/wav';
  return {
    audio: new Uint8Array(arrayBuffer),
    format: getFormatFromMime(mimeType),
    metadata: payload.metadata || null,
  };
}

export function resolveVoiceCloneSynthesizeUrl(): string {
  if (process.env.VOICE_CLONE_SYNTHESIZE_URL) {
    return process.env.VOICE_CLONE_SYNTHESIZE_URL;
  }
  if (process.env.VOICE_CLONE_BASE_URL) {
    return joinUrl(
      process.env.VOICE_CLONE_BASE_URL,
      process.env.VOICE_CLONE_SYNTHESIZE_PATH || '/synthesize',
    );
  }
  return '';
}

/**
 * Generate speech using specified TTS provider
 */
export async function generateTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const provider = TTS_PROVIDERS[config.providerId];
  if (!provider) {
    throw new Error(`Unknown TTS provider: ${config.providerId}`);
  }

  // Validate API key if required
  if (provider.requiresApiKey && !config.apiKey) {
    throw new Error(`API key required for TTS provider: ${config.providerId}`);
  }

  switch (config.providerId) {
    case 'openai-tts':
      return await generateOpenAITTS(config, text);

    case 'azure-tts':
      return await generateAzureTTS(config, text);

    case 'glm-tts':
      return await generateGLMTTS(config, text);

    case 'qwen-tts':
      return await generateQwenTTS(config, text);

    case 'elevenlabs-tts':
      return await generateElevenLabsTTS(config, text);

    case 'browser-native-tts':
      throw new Error(
        'Browser Native TTS must be handled client-side using Web Speech API. This provider cannot be used on the server.',
      );

    default:
      throw new Error(`Unsupported TTS provider: ${config.providerId}`);
  }
}

/**
 * OpenAI TTS implementation (direct API call with explicit UTF-8 encoding)
 */
async function generateOpenAITTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['openai-tts'].defaultBaseUrl;

  // Use gpt-4o-mini-tts for best quality and intelligent realtime applications
  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      input: text,
      voice: config.voice,
      speed: config.speed || 1.0,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`OpenAI TTS API error: ${error.error?.message || response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'mp3',
  };
}

/**
 * Azure TTS implementation (direct API call with SSML)
 */
async function generateAzureTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['azure-tts'].defaultBaseUrl;

  // Build SSML
  const rate = config.speed ? `${((config.speed - 1) * 100).toFixed(0)}%` : '0%';
  const ssml = `
    <speak version='1.0' xml:lang='zh-CN'>
      <voice xml:lang='zh-CN' name='${config.voice}'>
        <prosody rate='${rate}'>${escapeXml(text)}</prosody>
      </voice>
    </speak>
  `.trim();

  const response = await fetch(`${baseUrl}/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.apiKey!,
      'Content-Type': 'application/ssml+xml; charset=utf-8',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
    },
    body: ssml,
  });

  if (!response.ok) {
    throw new Error(`Azure TTS API error: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'mp3',
  };
}

/**
 * GLM TTS implementation (GLM API)
 */
async function generateGLMTTS(config: TTSModelConfig, text: string): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['glm-tts'].defaultBaseUrl;

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: 'glm-tts',
      input: text,
      voice: config.voice,
      speed: config.speed || 1.0,
      volume: 1.0,
      response_format: 'wav',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    let errorMessage = `GLM TTS API error: ${errorText}`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.message) {
        errorMessage = `GLM TTS API error: ${errorJson.error.message} (code: ${errorJson.error.code})`;
      }
    } catch {
      // If not JSON, use the text as is
    }
    throw new Error(errorMessage);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'wav',
  };
}

/**
 * Qwen TTS implementation (DashScope API - Qwen3 TTS Flash)
 */
async function generateQwenTTS(config: TTSModelConfig, text: string): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['qwen-tts'].defaultBaseUrl;

  // Calculate speed: Qwen3 uses rate parameter from -500 to 500
  // speed 1.0 = rate 0, speed 2.0 = rate 500, speed 0.5 = rate -250
  const rate = Math.round(((config.speed || 1.0) - 1.0) * 500);

  const response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: 'qwen3-tts-flash',
      input: {
        text,
        voice: config.voice,
        language_type: 'Chinese', // Default to Chinese, can be made configurable
      },
      parameters: {
        rate, // Speech rate from -500 to 500
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Qwen TTS API error: ${errorText}`);
  }

  const data = await response.json();

  // Check for audio URL in response
  if (!data.output?.audio?.url) {
    throw new Error(`Qwen TTS error: No audio URL in response. Response: ${JSON.stringify(data)}`);
  }

  // Download audio from URL
  const audioUrl = data.output.audio.url;
  const audioResponse = await fetch(audioUrl);

  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio from URL: ${audioResponse.statusText}`);
  }

  const arrayBuffer = await audioResponse.arrayBuffer();

  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'wav', // Qwen3 TTS returns WAV format
  };
}

/**
 * ElevenLabs TTS implementation (direct API call with voice-specific endpoint)
 */
async function generateElevenLabsTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['elevenlabs-tts'].defaultBaseUrl;
  const requestedFormat = config.format || 'mp3';
  const clampedSpeed = Math.min(1.2, Math.max(0.7, config.speed || 1.0));
  const outputFormatMap: Record<string, string> = {
    mp3: 'mp3_44100_128',
    opus: 'opus_48000_96',
    pcm: 'pcm_44100',
    wav: 'wav_44100',
    ulaw: 'ulaw_8000',
    alaw: 'alaw_8000',
  };
  const outputFormat = outputFormatMap[requestedFormat] || outputFormatMap.mp3;

  const response = await fetch(
    `${baseUrl}/text-to-speech/${encodeURIComponent(config.voice)}?output_format=${outputFormat}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': config.apiKey!,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed: clampedSpeed,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`ElevenLabs TTS API error: ${errorText || response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audio: new Uint8Array(arrayBuffer),
    format: requestedFormat,
  };
}

/**
 * Get current TTS configuration from settings store
 * Note: This function should only be called in browser context
 */
export async function getCurrentTTSConfig(): Promise<TTSModelConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentTTSConfig() can only be called in browser context');
  }

  // Lazy import to avoid circular dependency
  const { useSettingsStore } = await import('@/lib/store/settings');
  const { ttsProviderId, ttsVoice, ttsSpeed, ttsProvidersConfig } = useSettingsStore.getState();

  const providerConfig = ttsProvidersConfig?.[ttsProviderId];

  return {
    providerId: ttsProviderId,
    apiKey: providerConfig?.apiKey,
    baseUrl: providerConfig?.baseUrl,
    voice: ttsVoice,
    speed: ttsSpeed,
  };
}

// Re-export from constants for convenience
export { getAllTTSProviders, getTTSProvider, getTTSVoices } from './constants';

/**
 * Escape XML special characters for SSML
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
