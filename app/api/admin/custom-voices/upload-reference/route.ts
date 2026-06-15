import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';

const DEFAULT_BUCKET =
  process.env.SUPABASE_CUSTOM_VOICE_AUDIO_BUCKET ||
  process.env.SUPABASE_CLASSROOM_MEDIA_BUCKET ||
  'classroom-media';
const MAX_AUDIO_UPLOAD_BYTES = 20 * 1024 * 1024;

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function extFromMime(mime: string) {
  if (mime === 'audio/mpeg') return 'mp3';
  if (mime === 'audio/wav' || mime === 'audio/x-wav') return 'wav';
  if (mime === 'audio/mp4' || mime === 'audio/x-m4a') return 'm4a';
  if (mime === 'audio/ogg') return 'ogg';
  if (mime === 'audio/webm') return 'webm';
  return 'bin';
}

async function requireAdmin(request: NextRequest) {
  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return {
      error: apiError(
        API_ERROR_CODES.MISSING_API_KEY,
        500,
        'Server missing Supabase admin configuration.',
      ),
      adminClient: null,
      userId: null,
    };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!token) {
    return {
      error: apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Missing bearer token.'),
      adminClient: null,
      userId: null,
    };
  }

  const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return {
      error: apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Invalid auth token.'),
      adminClient: null,
      userId: null,
    };
  }

  const { data: adminRow, error: adminErr } = await adminClient
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (adminErr) {
    return {
      error: apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to verify admin status.',
        adminErr.message,
      ),
      adminClient: null,
      userId: null,
    };
  }

  if (!adminRow) {
    return {
      error: apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Admin access required.'),
      adminClient: null,
      userId: null,
    };
  }

  return {
    error: null,
    adminClient,
    userId: userData.user.id,
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error || !auth.adminClient || !auth.userId) return auth.error;

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing file upload.');
    }

    if (!file.type.startsWith('audio/')) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Only audio files are supported.');
    }
    if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Reference audio must be <= 20MB.');
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const safeUserId = sanitizePathSegment(auth.userId);
    const ext = extFromMime(file.type);
    const objectPath = `${safeUserId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await auth.adminClient.storage
      .from(DEFAULT_BUCKET)
      .upload(objectPath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadErr) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to upload reference audio.',
        uploadErr.message,
      );
    }

    const { data: publicData } = auth.adminClient.storage.from(DEFAULT_BUCKET).getPublicUrl(objectPath);
    return apiSuccess({
      referenceUrl: publicData.publicUrl,
      bucket: DEFAULT_BUCKET,
      objectPath,
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to upload reference audio.',
      error instanceof Error ? error.message : String(error),
    );
  }
}

