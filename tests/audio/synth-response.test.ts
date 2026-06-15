import { describe, expect, it } from 'vitest';
import {
  findEmbeddedAudioOffset,
  isLikelyAudioBytes,
  isLikelyWavText,
  recoverSynthAudioFromResponse,
} from '@/lib/audio/synth-response';
import { summarizeTtsUpstreamError } from '@/lib/audio/tts-error-utils';

function makeMinimalWavBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00], 0);
  bytes.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8);
  return bytes;
}

describe('synth-response', () => {
  it('detects standard WAV bytes even when Content-Type is missing', () => {
    const bytes = makeMinimalWavBytes();
    expect(isLikelyAudioBytes(bytes)).toBe(true);
    const recovered = recoverSynthAudioFromResponse(bytes, '', '', {}, 500);
    expect(recovered?.format).toBe('wav');
    expect(recovered?.audio.length).toBe(bytes.length);
  });

  it('recovers WAV from latin1 text bodies', () => {
    const bytes = makeMinimalWavBytes();
    const text = Buffer.from(bytes).toString('latin1');
    expect(isLikelyWavText(text)).toBe(true);
    const recovered = recoverSynthAudioFromResponse(new Uint8Array(0), text, '', {}, 200);
    expect(recovered?.format).toBe('wav');
    expect(recovered?.audio[0]).toBe(0x52);
  });

  it('accepts JSON payloads with audio_base64 and no status field', () => {
    const bytes = makeMinimalWavBytes();
    const audioBase64 = Buffer.from(bytes).toString('base64');
    const recovered = recoverSynthAudioFromResponse(
      new Uint8Array(0),
      JSON.stringify({ mime_type: 'audio/wav', audio_base64: audioBase64 }),
      'application/json',
      { mime_type: 'audio/wav', audio_base64: audioBase64 },
      200,
    );
    expect(recovered?.format).toBe('wav');
    expect(recovered?.audio.length).toBe(bytes.length);
  });

  it('recovers WAV embedded after a short JSON error prefix', () => {
    const bytes = makeMinimalWavBytes();
    const prefix = Buffer.from('{"error":"busy"}\n', 'utf8');
    const combined = new Uint8Array(prefix.length + bytes.length);
    combined.set(prefix, 0);
    combined.set(bytes, prefix.length);
    expect(findEmbeddedAudioOffset(combined)).toBe(prefix.length);
    const recovered = recoverSynthAudioFromResponse(
      combined,
      Buffer.from(combined).toString('latin1'),
      'application/json',
      {},
      500,
    );
    expect(recovered?.format).toBe('wav');
    expect(recovered?.audio.length).toBe(bytes.length);
  });

  it('does not leak raw WAV bytes into summarized upstream errors', () => {
    const bytes = makeMinimalWavBytes();
    const text = Buffer.from(bytes).toString('latin1');
    const summary = summarizeTtsUpstreamError(text, 'https://example.com/synthesize');
    expect(summary).toContain('raw WAV audio');
    expect(summary).not.toContain('WAVEfmt');
  });
});
