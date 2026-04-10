import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toBase64Url(text: string) {
  return Buffer.from(text, 'utf8').toString('base64url');
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const body = asObject(json);
  if (!body) {
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  }
  const payload = typeof body.payload === 'string' ? body.payload : null;
  const sig = typeof body.sig === 'string' ? body.sig : null;
  const lessonContentId =
    typeof body.lessonContentId === 'string' || typeof body.lessonContentId === 'number'
      ? body.lessonContentId
      : undefined;
  const status = typeof body.status === 'string' ? body.status : undefined;
  const details = asObject(body.details ?? null) ?? undefined;
  const quiz = asObject(body.quiz ?? null) ?? undefined;

  if (!payload || !sig) {
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  }
  const secret = process.env.AI_SCHOOL_REDIRECT_SECRET?.trim() || '';

  if (secret) {
    const computedSig = createHmac('sha256', secret).update(payload).digest('hex');
    if (computedSig !== sig) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
    }
  }

  let payloadJson: string;
  try {
    payloadJson = fromBase64Url(payload);
  } catch {
    return NextResponse.json({ error: 'invalid_payload_encoding' }, { status: 400 });
  }

  let decodedPayload: unknown;
  try {
    decodedPayload = JSON.parse(payloadJson);
  } catch {
    return NextResponse.json({ error: 'invalid_payload_json' }, { status: 400 });
  }

  const basePayload = asObject(decodedPayload);
  if (!basePayload || typeof basePayload.source !== 'string') {
    return NextResponse.json({ error: 'invalid_payload_data' }, { status: 400 });
  }

  const resolvedLessonContentId =
    lessonContentId ??
    ((typeof basePayload.lessonContentId === 'string' || typeof basePayload.lessonContentId === 'number'
      ? basePayload.lessonContentId
      : undefined) ??
      (typeof basePayload.dbUnitId === 'string' || typeof basePayload.dbUnitId === 'number'
        ? basePayload.dbUnitId
        : undefined));
  const bodyToSend = {
    ...basePayload,
    ...(resolvedLessonContentId !== undefined ? { lessonContentId: resolvedLessonContentId } : {}),
    ...(status ? { status } : {}),
    ...(details ? { details } : {}),
    ...(quiz ? { quiz } : {}),
  };

  const mainSchoolUrl = process.env.Main_SCHOOL_SITE_URL?.trim() || '';
  if (mainSchoolUrl) {
    const bodyJson = JSON.stringify(bodyToSend);
    const signedBody = {
      ...bodyToSend,
      sig: createHmac('sha256', secret).update(toBase64Url(bodyJson)).digest('hex'),
    };
    try {
      const response = await fetch(mainSchoolUrl + '/api/learn/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signedBody),
      });
      if (!response.ok) {
        const responseText = await response.text();
        return NextResponse.json(
          { error: 'external_sync_failed', status: response.status, body: responseText || '(empty)' },
          { status: 502 },
        );
      }
    } catch (error) {
      return NextResponse.json(
        { error: 'external_sync_error', message: error instanceof Error ? error.message : String(error) },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
