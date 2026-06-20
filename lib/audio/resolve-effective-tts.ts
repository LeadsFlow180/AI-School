import { useSettingsStore } from '@/lib/store/settings';
import type { TTSProviderId } from '@/lib/audio/types';

export type TutorVoicePresetRef = {
  providerId?: string;
  voiceId?: string;
};

export type EffectiveTTSRequest = {
  providerId: TTSProviderId;
  voiceId: string;
  speed: number;
  apiKey?: string;
  baseUrl?: string;
};

/**
 * Resolve the TTS provider/voice that should be used for a classroom.
 * `tutorVoicePreset` (from stage.tutorConfig) takes priority over global settings.
 */
export function resolveEffectiveTTSRequest(
  tutorVoicePreset?: TutorVoicePresetRef | null,
): EffectiveTTSRequest | null {
  const settings = useSettingsStore.getState();
  if (!settings.ttsEnabled) return null;

  const fallbackProviderConfig = settings.ttsProvidersConfig?.[settings.ttsProviderId];
  const providerId = (tutorVoicePreset?.providerId || settings.ttsProviderId) as TTSProviderId;
  const voiceId = tutorVoicePreset?.voiceId || settings.ttsVoice;
  if (!providerId || !voiceId || providerId === 'browser-native-tts') return null;

  const providerConfig = settings.ttsProvidersConfig?.[providerId];
  return {
    providerId,
    voiceId,
    speed: settings.ttsSpeed,
    apiKey: providerConfig?.apiKey || fallbackProviderConfig?.apiKey || undefined,
    baseUrl:
      providerConfig?.serverBaseUrl ||
      providerConfig?.baseUrl ||
      fallbackProviderConfig?.serverBaseUrl ||
      fallbackProviderConfig?.baseUrl ||
      undefined,
  };
}

export function isServerCapableTTSProvider(providerId: string | undefined): boolean {
  return !!providerId && providerId !== 'browser-native-tts';
}
