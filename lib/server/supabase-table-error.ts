/** True when PostgREST reports the table is absent from the schema cache. */
export function isMissingSupabaseTableError(error: {
  code?: string;
  message?: string;
}): boolean {
  const code = String(error.code || '');
  const message = String(error.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    message.includes('could not find the table') ||
    (message.includes('relation') && message.includes('does not exist'))
  );
}
