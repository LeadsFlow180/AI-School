export interface RecoveredSynthAudio {
  audio: Uint8Array;
  format: string;
  metadata?: Record<string, unknown> | null;
}

function indexOfAscii(bytes: Uint8Array, needle: string, start: number, end: number): number {
  const endIdx = Math.min(end, bytes.length);
  const needleLen = needle.length;
  if (needleLen === 0 || endIdx - start < needleLen) return -1;
  for (let i = start; i <= endIdx - needleLen; i++) {
    let match = true;
    for (let j = 0; j < needleLen; j++) {
      if (bytes[i + j] !== needle.charCodeAt(j)) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

export function isLikelyWavText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('RIFF') || trimmed.includes('WAVEfmt') || trimmed.includes('WAVE');
}

export function isLikelyAudioContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return (
    lower.includes('audio/') ||
    lower.includes('application/octet-stream') ||
    lower.includes('binary/octet-stream')
  );
}

export function isLikelyAudioBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;

  const isRiff =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  if (isRiff && indexOfAscii(bytes, 'WAVE', 4, Math.min(bytes.length, 512)) >= 0) {
    return true;
  }

  const isRf64 =
    bytes[0] === 0x52 && bytes[1] === 0x46 && bytes[2] === 0x36 && bytes[3] === 0x34;
  if (isRf64) return true;

  const isMp3 =
    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (isMp3) return true;

  return (
    bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53
  );
}

function getFormatFromMime(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'wav';
}

export function getFormatFromBytes(bytes: Uint8Array, contentType: string): string {
  if (indexOfAscii(bytes, 'WAVE', 0, Math.min(bytes.length, 512)) >= 0) return 'wav';
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  ) {
    return 'mp3';
  }
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'ogg';
  }
  return getFormatFromMime(contentType);
}

function latin1BytesFromText(text: string): Uint8Array {
  const buffer = Buffer.from(text, 'latin1');
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function decodeBase64Audio(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const bytes = new Uint8Array(Buffer.from(trimmed, 'base64'));
    return isLikelyAudioBytes(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

function readBase64Field(body: Record<string, unknown>): { bytes: Uint8Array; mimeType: string } | null {
  const candidates = [
    body.audio_base64,
    body.audioBase64,
    body.audio,
    body.data,
    (body.data as Record<string, unknown> | undefined)?.audio_base64,
    (body.data as Record<string, unknown> | undefined)?.audioBase64,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const bytes = decodeBase64Audio(candidate);
    if (!bytes) continue;
    const mimeType =
      (typeof body.mime_type === 'string' && body.mime_type) ||
      (typeof body.mimeType === 'string' && body.mimeType) ||
      'audio/wav';
    return { bytes, mimeType };
  }
  return null;
}

export function audioResultFromBytes(
  bytes: Uint8Array,
  contentType: string,
  httpStatus?: number,
): RecoveredSynthAudio | null {
  if (!isLikelyAudioContentType(contentType) && !isLikelyAudioBytes(bytes)) {
    return null;
  }
  return {
    audio: bytes,
    format: getFormatFromBytes(bytes, contentType),
    metadata: httpStatus != null ? { httpStatus } : null,
  };
}

export function recoverSynthAudioFromResponse(
  bytes: Uint8Array,
  textBody: string,
  contentType: string,
  parsedBody: unknown,
  httpStatus?: number,
): RecoveredSynthAudio | null {
  const fromBytes = audioResultFromBytes(bytes, contentType, httpStatus);
  if (fromBytes) return fromBytes;

  if (typeof parsedBody === 'string') {
    const parsedTextBytes = latin1BytesFromText(parsedBody);
    const fromParsedText = audioResultFromBytes(parsedTextBytes, contentType, httpStatus);
    if (fromParsedText) return fromParsedText;
    const fromParsedBase64 = decodeBase64Audio(parsedBody);
    if (fromParsedBase64) {
      return {
        audio: fromParsedBase64,
        format: getFormatFromBytes(fromParsedBase64, contentType),
        metadata: httpStatus != null ? { httpStatus } : null,
      };
    }
  }

  if (parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)) {
    const base64Audio = readBase64Field(parsedBody as Record<string, unknown>);
    if (base64Audio) {
      return {
        audio: base64Audio.bytes,
        format: getFormatFromMime(base64Audio.mimeType),
        metadata: httpStatus != null ? { httpStatus } : null,
      };
    }
  }

  if (isLikelyWavText(textBody)) {
    const recoveredBytes =
      bytes.length > 0 && isLikelyAudioBytes(bytes) ? bytes : latin1BytesFromText(textBody);
    const fromText = audioResultFromBytes(recoveredBytes, contentType, httpStatus);
    if (fromText) return fromText;
  }

  return null;
}

export function isMaterializableSynthJson(jsonBody: Record<string, unknown>): boolean {
  if (readBase64Field(jsonBody)) return true;
  const legacy = jsonBody as { success?: boolean; data?: { audioUrl?: string } };
  return !!(
    legacy.success &&
    typeof legacy.data?.audioUrl === 'string' &&
    legacy.data.audioUrl.trim().length > 0
  );
}
