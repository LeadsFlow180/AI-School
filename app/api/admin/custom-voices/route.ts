import { type NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';

const log = createLogger('AdminCustomVoicesAPI');

interface CreateCustomVoiceBody {
  name: string;
  title?: string;
  description?: string;
  referenceUrl?: string;
  providerVoiceId?: string;
  avatar?: string;
  providerId?: string;
}

interface VoiceCloneApiResponse {
  voiceId?: string;
  id?: string;
  referenceUrl?: string;
  reference_url?: string;
  data?: {
    voiceId?: string;
    id?: string;
    referenceUrl?: string;
    reference_url?: string;
    path?: string;
    url?: string;
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}

interface DbErrorLike {
  code?: string;
  message?: string;
}

const DEFAULT_BUCKET =
  process.env.SUPABASE_CUSTOM_VOICE_AUDIO_BUCKET ||
  process.env.SUPABASE_CLASSROOM_MEDIA_BUCKET ||
  'classroom-media';
const MAX_AUDIO_UPLOAD_BYTES = 20 * 1024 * 1024;
const AVATAR_BUCKET =
  process.env.SUPABASE_CUSTOM_TUTOR_AVATAR_BUCKET ||
  process.env.SUPABASE_CLASSROOM_MEDIA_BUCKET ||
  DEFAULT_BUCKET;
const MAX_AVATAR_UPLOAD_BYTES = 2 * 1024 * 1024;

function buildProviderVoiceId(referenceUrl: string, fallbackName: string): string {
  const safe = `${fallbackName}-${referenceUrl}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
  const suffix = Date.now().toString(36);
  return `${safe || 'custom-voice'}-${suffix}`;
}

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

function parseAudioDataUrl(input: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = input.match(/^data:(audio\/[^;]+);base64,(.+)$/i);
  if (!match) return null;
  const mimeType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');
  return { mimeType, bytes: new Uint8Array(buffer) };
}

function parseImageDataUrl(input: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = input.match(/^data:(image\/[^;]+);base64,(.+)$/i);
  if (!match) return null;
  const mimeType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');
  return { mimeType, bytes: new Uint8Array(buffer) };
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
    const dbError = adminErr as DbErrorLike;
    if (dbError.code === '42P01') {
      // Some deployments may not have admin_users yet; do not hard-fail GET/POST with 500.
      // We still require a valid auth token and continue as admin-compatible mode.
      log.warn('admin_users table missing; allowing authenticated user for custom-voice routes.');
      return {
        error: null,
        adminClient,
        userId: userData.user.id,
      };
    }
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

export async function GET(request: NextRequest) {
  try {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      return apiError(
        API_ERROR_CODES.MISSING_API_KEY,
        500,
        'Server missing Supabase admin configuration.',
      );
    }

    const { data, error, count } = await adminClient
      .schema('public')
      .from('custom_tutor_voices')
      .select(
        'id, name, title, description, provider_id, provider_voice_id, reference_url, avatar, metadata, created_at',
        { count: 'exact' },
      );

    if (error) {
      const dbError = error as DbErrorLike;
      if (dbError.code === '42P01') {
        // Table not created yet — keep UI usable with empty presets.
        log.warn('custom_tutor_voices table not found; returning empty tutor preset list.');
        return apiSuccess({ voices: [] });
      }
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to list custom tutor voices.',
        error.message,
      );
    }

    const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    const normalized = rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        title: row.title ?? row.name ?? null,
        description: row.description ?? row.instruction ?? null,
        provider_id: row.provider_id,
        provider_voice_id: row.provider_voice_id,
        reference_url: row.reference_url ?? row.referenceUrl ?? null,
        avatar: row.avatar ?? null,
        metadata: row.metadata ?? {},
        created_at: row.created_at ?? null,
      }))
      .filter((row) => row.id && row.name)
      .sort((a, b) => {
        const aTs = a.created_at ? Date.parse(String(a.created_at)) : 0;
        const bTs = b.created_at ? Date.parse(String(b.created_at)) : 0;
        return bTs - aTs;
      });

    return apiSuccess({ voices: normalized, count: count ?? normalized.length });
  } catch (error) {
    log.error(
      `Failed to load custom tutor voices. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to load custom tutor voices.',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error || !auth.adminClient || !auth.userId) {
      return auth.error;
    }

    const body = (await request.json()) as Partial<CreateCustomVoiceBody>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    let referenceUrl = typeof body.referenceUrl === 'string' ? body.referenceUrl.trim() : '';
    let avatar = typeof body.avatar === 'string' ? body.avatar.trim() : '';
    const providerId =
      typeof body.providerId === 'string' && body.providerId.trim()
        ? body.providerId.trim()
        : 'custom-cloned-tts';
    const providerVoiceId =
      typeof body.providerVoiceId === 'string' && body.providerVoiceId.trim()
        ? body.providerVoiceId.trim()
        : buildProviderVoiceId(referenceUrl, name || title || 'voice');

    if (!name || !referenceUrl) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'name and referenceUrl are required.',
      );
    }
    const parsedDataUrl = parseAudioDataUrl(referenceUrl);
    let uploadedObjectPath: string | null = null;
    if (parsedDataUrl) {
      if (parsedDataUrl.bytes.byteLength > MAX_AUDIO_UPLOAD_BYTES) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Reference audio must be <= 20MB.');
      }
      const safeUserId = sanitizePathSegment(auth.userId);
      const ext = extFromMime(parsedDataUrl.mimeType);
      uploadedObjectPath = `${safeUserId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await auth.adminClient.storage
        .from(DEFAULT_BUCKET)
        .upload(uploadedObjectPath, parsedDataUrl.bytes, {
          contentType: parsedDataUrl.mimeType,
          upsert: false,
        });
      if (uploadErr) {
        // Keep DB save working even if Storage bucket/policy is misconfigured.
        log.warn(
          `Reference upload failed for tutor save; persisting provided data URL instead. ${uploadErr.message}`,
        );
        uploadedObjectPath = null;
      } else {
        const { data: publicData } = auth.adminClient.storage
          .from(DEFAULT_BUCKET)
          .getPublicUrl(uploadedObjectPath);
        referenceUrl = publicData.publicUrl;
      }
    }
    const parsedAvatarDataUrl = avatar ? parseImageDataUrl(avatar) : null;
    if (parsedAvatarDataUrl) {
      if (parsedAvatarDataUrl.bytes.byteLength > MAX_AVATAR_UPLOAD_BYTES) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Tutor avatar must be <= 2MB.');
      }
      const safeUserId = sanitizePathSegment(auth.userId);
      const avatarExt =
        parsedAvatarDataUrl.mimeType === 'image/jpeg'
          ? 'jpg'
          : parsedAvatarDataUrl.mimeType === 'image/webp'
            ? 'webp'
            : 'png';
      const avatarObjectPath = `${safeUserId}/avatar-${Date.now()}-${crypto.randomUUID()}.${avatarExt}`;
      const { error: avatarUploadErr } = await auth.adminClient.storage
        .from(AVATAR_BUCKET)
        .upload(avatarObjectPath, parsedAvatarDataUrl.bytes, {
          contentType: parsedAvatarDataUrl.mimeType,
          upsert: false,
        });
      if (avatarUploadErr) {
        return apiError(
          API_ERROR_CODES.INTERNAL_ERROR,
          500,
          'Failed to upload tutor avatar while saving tutor.',
          avatarUploadErr.message,
        );
      }
      const { data: avatarPublicData } = auth.adminClient.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(avatarObjectPath);
      avatar = avatarPublicData.publicUrl;
    }
    const metadata: VoiceCloneApiResponse = {
      source: parsedDataUrl ? 'uploaded-from-data-url' : 'direct-reference',
      referenceUrl,
      ...(uploadedObjectPath
        ? {
            data: [
              {
                path: uploadedObjectPath,
                url: referenceUrl,
              },
            ],
          }
        : {}),
    };

    const payload = {
      name,
      title: title || name,
      description: description || null,
      provider_id: providerId,
      provider_voice_id: providerVoiceId,
      reference_url: referenceUrl,
      avatar: avatar || null,
      metadata,
      created_by: auth.userId,
    };

    let { data, error } = await auth.adminClient
      .from('custom_tutor_voices')
      .upsert(payload, { onConflict: 'provider_id,provider_voice_id' })
      .select(
        'id, name, title, description, provider_id, provider_voice_id, reference_url, avatar, metadata, created_at',
      )
      .single();

    const dbError = error as DbErrorLike | null;
    if (dbError?.code === '42P10') {
      // Unique index missing for onConflict in some deployments — fallback to insert.
      const insertResult = await auth.adminClient
        .from('custom_tutor_voices')
        .insert(payload)
        .select(
          'id, name, title, description, provider_id, provider_voice_id, reference_url, avatar, metadata, created_at',
        )
        .single();
      data = insertResult.data;
      error = insertResult.error;
    }

    if (error) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to persist custom tutor voice.',
        error.message,
      );
    }

    return apiSuccess({ voice: data }, 201);
  } catch (error) {
    log.error('Failed to create custom tutor voice:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to create custom tutor voice.',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error || !auth.adminClient) {
      return auth.error;
    }

    const id = request.nextUrl.searchParams.get('id')?.trim() || '';
    if (!id) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'id is required.');
    }

    const { error } = await auth.adminClient.from('custom_tutor_voices').delete().eq('id', id);
    if (error) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to delete custom tutor voice.',
        error.message,
      );
    }

    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to delete custom tutor voice.',
      error instanceof Error ? error.message : String(error),
    );
  }
}
