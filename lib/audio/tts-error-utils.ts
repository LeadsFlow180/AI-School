/**
 * Turn noisy upstream TTS / voice-clone bodies (e.g. Thunder Compute HTML pages) into short errors.
 */
import { isLikelyWavText, isLikelyBinaryResponseBody } from '@/lib/audio/synth-response';

export function summarizeTtsUpstreamError(body: string, url?: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return 'Voice clone service returned an empty response.';
  }

  const lower = trimmed.toLowerCase();
  const urlHint = url ? ` (${url})` : '';

  if (
    lower.includes('nothing running here') ||
    lower.includes('thundercompute.net') ||
    lower.includes('port forwarding may not be enabled')
  ) {
    return (
      `Voice clone server is not running${urlHint}. ` +
      'Start your synthesize service on Thunder Compute (or local), then verify VOICE_CLONE_SYNTHESIZE_URL / VOICE_CLONE_BASE_URL in .env.local.'
    );
  }

  if (
    trimmed.startsWith('<!') ||
    trimmed.startsWith('<html') ||
    lower.includes('<!doctype html') ||
    lower.includes('<html lang=')
  ) {
    return (
      `Voice clone service returned an HTML page instead of audio${urlHint}. ` +
      'Check that the synthesize URL points to your running TTS API, not a dead port-forward.'
    );
  }

  if (isLikelyWavText(trimmed) || isLikelyBinaryResponseBody(trimmed)) {
    return (
      `Voice clone service returned raw WAV audio with an unexpected response format${urlHint}. ` +
      'The synthesize endpoint should return audio/wav (or JSON with audio_base64). Check upstream Content-Type headers.'
    );
  }

  if (trimmed.length > 320) {
    return `Voice clone service returned an unreadable response (${trimmed.length} bytes)${urlHint}. Check synthesize URL and upstream logs.`;
  }

  return trimmed;
}

export function summarizeTtsErrorMessage(message: string, url?: string): string {
  const trimmed = message.trim();
  if (!trimmed) return 'TTS generation failed.';
  if (
    trimmed.length > 400 ||
    trimmed.includes('<!DOCTYPE') ||
    trimmed.includes('<html') ||
    isLikelyWavText(trimmed) ||
    isLikelyBinaryResponseBody(trimmed)
  ) {
    return summarizeTtsUpstreamError(trimmed, url);
  }
  return trimmed;
}
