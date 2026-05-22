'use client';

import {
  AGA_DEFAULT_CLASSROOM_ID,
  AGA_DEFAULT_TOTAL_SLIDES,
  AGA_SOURCE,
  fromPayloadEncoded,
  type AgaLadderStep,
} from '@/lib/aga/redirect-crypto';

/** Launch context from Allen Girls Adventure when opening /classroom/[id]?payload=...&sig=... */
export type AgaLaunchPayload = {
  learnerId?: string | null;
  guestSessionId?: string | null;
  language?: string;
  sectionId?: string | number;
  unitIndex?: number;
  step?: AgaLadderStep | string;
  dbSectionId?: string | number;
  dbUnitId?: string | number | null;
  classroomId?: string;
  resumeSceneIndex?: number | null;
  resumeSceneId?: string | null;
  totalSlides?: number | null;
  issuedAt?: string;
  expiresAt?: string;
  nonce?: string;
  source?: string;
};

export type AgaLaunchBundle = {
  payload: string;
  sig: string;
};

export type AgaLaunchContext = AgaLaunchPayload & {
  classroomId: string;
  totalSlides: number;
};

export type AgaLaunchVerification = {
  ok: boolean;
  error?: string;
  context?: AgaLaunchContext;
};

function storageKey(classroomId: string, suffix: string): string {
  return `aga-launch:${suffix}:${classroomId}`;
}

export function parseAgaLaunchPayloadJson(json: string): AgaLaunchPayload | null {
  try {
    return JSON.parse(json) as AgaLaunchPayload;
  } catch {
    return null;
  }
}

export function parseAgaLaunchPayloadEncoded(payloadEncoded: string): AgaLaunchPayload | null {
  try {
    return parseAgaLaunchPayloadJson(fromPayloadEncoded(payloadEncoded));
  } catch {
    return null;
  }
}

export function buildAgaLaunchContext(
  parsed: AgaLaunchPayload,
  routeClassroomId: string,
): AgaLaunchContext {
  const classroomId = parsed.classroomId?.trim() || routeClassroomId || AGA_DEFAULT_CLASSROOM_ID;
  const totalSlides =
    typeof parsed.totalSlides === 'number' && parsed.totalSlides > 0
      ? parsed.totalSlides
      : AGA_DEFAULT_TOTAL_SLIDES;

  return {
    ...parsed,
    classroomId,
    totalSlides,
    source: parsed.source || AGA_SOURCE,
  };
}

function persistContext(classroomId: string, context: AgaLaunchContext): void {
  sessionStorage.setItem(storageKey(classroomId, 'context'), JSON.stringify(context));
}

export function getAgaLaunchContext(classroomId: string): AgaLaunchContext | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(storageKey(classroomId, 'context'));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AgaLaunchContext;
  } catch {
    return null;
  }
}

export function setAgaLaunchContext(classroomId: string, context: AgaLaunchContext): void {
  if (typeof window === 'undefined') return;
  persistContext(classroomId, context);
}

/** Persist signed launch bundle from the classroom URL (survives refresh on same tab). */
export function captureAgaLaunchFromUrl(
  classroomId: string,
  searchParams: URLSearchParams | null | undefined,
): boolean {
  if (!searchParams || typeof window === 'undefined') return false;

  const payload = searchParams.get('payload')?.trim();
  const sig = searchParams.get('sig')?.trim();
  if (!payload || !sig) return false;

  const bundle: AgaLaunchBundle = { payload, sig };
  sessionStorage.setItem(storageKey(classroomId, 'bundle'), JSON.stringify(bundle));
  return true;
}

export function getAgaLaunchBundle(classroomId: string): AgaLaunchBundle | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(storageKey(classroomId, 'bundle'));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AgaLaunchBundle;
    if (parsed?.payload && parsed?.sig) return parsed;
  } catch {
    // ignore
  }
  return null;
}

export function hasAgaLaunchContext(classroomId: string): boolean {
  return getAgaLaunchBundle(classroomId) != null || getAgaLaunchContext(classroomId) != null;
}

export function clearAgaLaunchBundle(classroomId: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(storageKey(classroomId, 'bundle'));
  sessionStorage.removeItem(storageKey(classroomId, 'context'));
  sessionStorage.removeItem(storageKey(classroomId, 'complete-sent'));
}

export function markAgaCompleteSent(classroomId: string, step: string | undefined): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(storageKey(classroomId, 'complete-sent'), step || 'unknown');
}

export function hasAgaCompleteBeenSent(classroomId: string, step: string | undefined): boolean {
  if (typeof window === 'undefined') return false;
  const sent = sessionStorage.getItem(storageKey(classroomId, 'complete-sent'));
  return sent === (step || 'unknown');
}
