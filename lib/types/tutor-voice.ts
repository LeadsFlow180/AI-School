export interface TutorVoicePreset {
  id: string;
  name: string;
  title?: string;
  description?: string | null;
  providerId: string;
  providerVoiceId: string;
  referenceUrl?: string | null;
  avatar?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}

export interface TutorGenerationConfig {
  name?: string;
  avatar?: string;
  description?: string;
  voicePreset?: {
    id: string;
    name: string;
    providerId: string;
    voiceId: string;
  };
}
