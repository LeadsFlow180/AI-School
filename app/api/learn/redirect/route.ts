import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const payloadSchema = z.object({
  learnerId: z.string().uuid().optional(),
  guestSessionId: z.string().uuid().optional(),
  lessonContentId: z.union([z.string(), z.number()]),
  status: z.string(),
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
    const secret = process.env.AI_SCHOOL_REDIRECT_SECRET?.trim() || '';
    const dataWithoutSig = data;
    const bodyJson = JSON.stringify(dataWithoutSig);
    const newSig = createHmac('sha256', secret).update(toBase64Url(bodyJson)).digest('hex');
    const bodyToSend = { ...data, sig: newSig };
    console.log('Sending payload to external API:', bodyToSend);
    fetch(mainSchoolUrl + '/api/learn/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyToSend),
    })
      .then((response) => {
        console.log('Fetch response status:', response.status);
      })
      .catch((e) => {
        console.error('Failed to send to external API:', e);
      });
  }

  return NextResponse.json({ ok: true });
}
