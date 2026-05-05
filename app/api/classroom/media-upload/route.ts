import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';

const DEFAULT_BUCKET = process.env.SUPABASE_CLASSROOM_MEDIA_BUCKET || 'classroom-media';

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function extFromMime(mime: string) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'audio/mpeg') return 'mp3';
  if (mime === 'audio/wav' || mime === 'audio/x-wav') return 'wav';
  if (mime === 'audio/mp4' || mime === 'audio/x-m4a') return 'm4a';
  if (mime === 'audio/ogg') return 'ogg';
  if (mime === 'audio/webm') return 'webm';
  return 'bin';
}

export async function POST(request: NextRequest) {
  try {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { success: false, error: 'Supabase admin is not configured on server.' },
        { status: 500 },
      );
    }

    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!token) {
      return NextResponse.json({ success: false, error: 'Missing bearer token.' }, { status: 401 });
    }

    const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json({ success: false, error: 'Invalid auth token.' }, { status: 401 });
    }

    const { data: adminRow, error: adminErr } = await adminClient
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (adminErr) {
      const normalized = String(adminErr.message || '').toLowerCase();
      const missingAdminTable =
        adminErr.code === 'PGRST205' ||
        normalized.includes('could not find the table') ||
        normalized.includes('relation') ||
        normalized.includes('does not exist');
      if (!missingAdminTable) {
        return NextResponse.json(
          { success: false, error: 'Failed to verify admin status.' },
          { status: 500 },
        );
      }
      // Reason: some deployments intentionally skip admin_users table.
      // In that case, accept any valid authenticated user token.
    }
    if (!adminRow && !adminErr) {
      return NextResponse.json({ success: false, error: 'Admin access required.' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const classroomId = String(formData.get('classroomId') || '').trim();
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Missing media file.' }, { status: 400 });
    }

    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');
    if (!isImage && !isAudio) {
      return NextResponse.json(
        { success: false, error: 'Only image/audio files are allowed.' },
        { status: 400 },
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const ext = extFromMime(file.type);
    const safeUserId = sanitizeSegment(userData.user.id);
    const safeClassroomId = sanitizeSegment(classroomId || 'unknown-classroom');
    const mediaTypeSegment = isAudio ? 'audio' : 'image';
    const objectPath = `${safeUserId}/${safeClassroomId}/${mediaTypeSegment}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await adminClient.storage.from(DEFAULT_BUCKET).upload(objectPath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadErr) {
      return NextResponse.json(
        {
          success: false,
          error: `Storage upload failed: ${uploadErr.message}`,
          bucket: DEFAULT_BUCKET,
        },
        { status: 500 },
      );
    }

    const { data: publicData } = adminClient.storage.from(DEFAULT_BUCKET).getPublicUrl(objectPath);
    return NextResponse.json({
      success: true,
      src: publicData.publicUrl,
      bucket: DEFAULT_BUCKET,
      objectPath,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

