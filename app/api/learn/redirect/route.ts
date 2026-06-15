import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAgaContentBody, postAgaContent } from '@/lib/server/aga-content-sync';
import { decodeAndVerifyAgaLaunch } from '@/lib/server/aga-learn-sync';

const bodySchema = z.object({
  payload: z.string(),
  sig: z.string(),
});

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

  const { payload: payloadEncoded, sig } = parsedBody.data;
  const verified = decodeAndVerifyAgaLaunch(payloadEncoded, sig);
  if (!verified.ok) {
    const status = verified.error === 'invalid_signature' ? 401 : 400;
    return NextResponse.json({ error: verified.error }, { status });
  }

  const launch = verified.launch;
  const classroomId = launch.classroomId?.trim() || 'l4gHC6hvRo';

  // Initial redirect handshake: report progress at slide 0 (not a ladder mission complete).
  const contentBody = buildAgaContentBody(launch, {
    status: 'progress',
    sceneIndex:
      typeof launch.resumeSceneIndex === 'number' ? launch.resumeSceneIndex : 0,
    currentSceneId: launch.resumeSceneId ?? null,
    actionIndex: 0,
    consumedDiscussions: [],
    playbackCompleted: false,
    classroomId,
  });

  const syncResult = await postAgaContent(contentBody);
  if (!syncResult.ok && syncResult.error !== 'aga_site_not_configured') {
    console.error('[api/learn/redirect] external_sync_failed', syncResult);
  } else if (syncResult.ok) {
    console.log('[api/learn/redirect] external_sync_success', {
      status: syncResult.status,
      classroomId,
    });
  }

  return NextResponse.json({ ok: true, message: 'Redirect payload processed successfully.' });
}
