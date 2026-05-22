import { createHmac, timingSafeEqual } from 'node:crypto';

export const AGA_SOURCE = 'allen-girls-adventures';
export const AGA_DEFAULT_CLASSROOM_ID = 'l4gHC6hvRo';
export const AGA_DEFAULT_TOTAL_SLIDES = 5;

export type AgaLadderStep = 'start' | 'lesson' | 'chest' | 'practice' | 'review';

const LADDER_STEP_INDEX: Record<AgaLadderStep, number> = {
  start: 0,
  lesson: 1,
  chest: 2,
  practice: 3,
  review: 4,
};

export function ladderStepIndex(step: string | undefined): number {
  if (!step) return 0;
  return LADDER_STEP_INDEX[step as AgaLadderStep] ?? 0;
}

/** Standard base64 (AGA redirect + content sync). */
export function toStandardBase64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

export function fromPayloadEncoded(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

export function signAgaBody(bodyWithoutSig: Record<string, unknown>, secret: string): string {
  const json = JSON.stringify(bodyWithoutSig);
  const b64 = toStandardBase64(json);
  return createHmac('sha256', secret).update(b64).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Verify URL redirect signature. AGA signs the raw base64 `payload` query param (standard or base64url).
 */
export function verifyAgaPayloadSignature(
  payloadEncoded: string,
  sig: string,
  secret: string,
): boolean {
  if (!secret) return true;
  const expected = createHmac('sha256', secret).update(payloadEncoded).digest('hex');
  if (safeEqualHex(expected, sig)) return true;

  // Some routes re-encode JSON without sig — try canonical body sign as fallback.
  try {
    const json = fromPayloadEncoded(payloadEncoded);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const { sig: _ignored, ...rest } = parsed;
    const canonicalSig = signAgaBody({ ...rest, source: (rest.source as string) || AGA_SOURCE }, secret);
    return safeEqualHex(canonicalSig, sig);
  } catch {
    return false;
  }
}

export function isAgaPayloadExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return false;
  return Date.now() > ms;
}
