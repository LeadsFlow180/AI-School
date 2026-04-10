import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const payloadSchema = z.object({
  learnerId: z.string().uuid().nullable().optional(),
  guestSessionId: z.string().uuid().nullable().optional(),
  language: z.string().optional(),
  sectionId: z.union([z.string(), z.number()]).optional(),
  unitIndex: z.number().optional(),
  step: z.string().optional(),
  dbSectionId: z.union([z.string(), z.number()]).optional(),
  dbUnitId: z.union([z.string(), z.number()]).optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  nonce: z.string().optional(),
  lessonContentId: z.union([z.string(), z.number()]).optional(),
  status: z.string().optional(),
  details: z.record(z.any()).optional(),
  quiz: z.record(z.any()).optional(),
  source: z.string(),
});

const bodySchema = z.object({
  payload: z.string(),
  sig: z.string(),
});

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

  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  }

  const payloadEncoded = parsedBody.data.payload;
  const sig = parsedBody.data.sig;

  const secret = process.env.AI_SCHOOL_REDIRECT_SECRET?.trim() || '';
  if (secret) {
    const computedSig = createHmac('sha256', secret).update(payloadEncoded).digest('hex');
    if (computedSig !== sig) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
    }
  }

  // Decode payload
  let payloadJson: string;
  try {
    payloadJson = fromBase64Url(payloadEncoded);
  } catch {
    return NextResponse.json({ error: 'invalid_payload_encoding' }, { status: 400 });
  }

  let decodedPayload: unknown;
  try {
    decodedPayload = JSON.parse(payloadJson);
  } catch {
    return NextResponse.json({ error: 'invalid_payload_json' }, { status: 400 });
  }

  const parsedPayload = payloadSchema.safeParse(decodedPayload);
  if (!parsedPayload.success) {
    return NextResponse.json({ error: 'invalid_payload_data' }, { status: 400 });
  }

  const data = parsedPayload.data;

  // Send data to external API
  const mainSchoolUrl = process.env.Main_SCHOOL_SITE_URL?.trim() || '';
  if (mainSchoolUrl) {
    const dataWithoutSig = data;
    const bodyJson = JSON.stringify(dataWithoutSig);
    const newSig = createHmac('sha256', secret).update(toBase64Url(bodyJson)).digest('hex');
    const bodyToSend = { ...data, sig: newSig };
    console.log('Sending payload to external API:', bodyToSend);
    try {
      const response = await fetch(mainSchoolUrl + '/api/learn/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyToSend),
      });
      const responseText = await response.text();
      if (response.ok) {
        console.log('[api/learn/redirect] external_sync_success', {
          status: response.status,
          body: responseText || '(empty)',
        });
      } else {
        console.error('[api/learn/redirect] external_sync_failed', {
          status: response.status,
          body: responseText || '(empty)',
        });
      }
    } catch (e) {
      console.error('Failed to send to external API:', e);
    }
  }

  return NextResponse.json({ ok: true, message: 'Redirect payload processed successfully.' });
}
