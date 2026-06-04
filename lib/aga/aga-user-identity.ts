/** Resolved AGA embed user — learner takes priority over guest. */
export type AgaUserIdentity = {
  learnerId: string | null;
  guestSessionId: string | null;
  /** Primary storage key: learnerId if present, else guestSessionId */
  userId: string;
};

/**
 * Normalize launch/sync user ids. Returns null when both are missing or blank.
 * Logged-in learners must keep learnerId so AGA stores under learner_id, not guest-only rows.
 */
export function normalizeAgaLaunchUserIds(launch: {
  learnerId?: string | null;
  guestSessionId?: string | null;
}): AgaUserIdentity | null {
  const learnerId =
    typeof launch.learnerId === 'string' && launch.learnerId.trim()
      ? launch.learnerId.trim()
      : null;
  const guestSessionId =
    typeof launch.guestSessionId === 'string' && launch.guestSessionId.trim()
      ? launch.guestSessionId.trim()
      : null;

  if (learnerId) {
    return { learnerId, guestSessionId, userId: learnerId };
  }
  if (guestSessionId) {
    return { learnerId: null, guestSessionId, userId: guestSessionId };
  }
  return null;
}

export function hasAgaUserIdentity(launch: {
  learnerId?: string | null;
  guestSessionId?: string | null;
}): boolean {
  return normalizeAgaLaunchUserIds(launch) != null;
}
