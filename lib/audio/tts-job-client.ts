type TTSRequestPayload = {
  text: string;
  audioId: string;
  ttsProviderId: string;
  ttsVoice: string;
  ttsSpeed?: number;
  ttsApiKey?: string;
  ttsBaseUrl?: string;
};

type TTSSuccessPayload = {
  success: true;
  audioId: string;
  base64: string;
  format: string;
  ttsDebug?: Record<string, unknown>;
};

type TTSJobCreatePayload = {
  success: true;
  jobId: string;
  status: 'pending';
};

type TTSJobPendingPayload = {
  success: true;
  jobId: string;
  status: 'pending';
};

type TTSErrorPayload = {
  success: false;
  error?: string;
  details?: string;
};

export async function requestTTSWithJobPolling(
  payload: TTSRequestPayload,
  options?: { maxWaitMs?: number; intervalMs?: number },
): Promise<TTSSuccessPayload> {
  const maxWaitMs = options?.maxWaitMs ?? 120_000;
  const intervalMs = options?.intervalMs ?? 1500;
  const startedAt = Date.now();

  const createResp = await fetch('/api/generate/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, asyncJob: true }),
  });
  const createJson = (await createResp.json().catch(() => ({}))) as TTSJobCreatePayload | TTSErrorPayload;
  if (!createResp.ok || !createJson.success || !createJson.jobId) {
    const errPayload = createJson as TTSErrorPayload;
    const errMsg =
      errPayload.details ||
      errPayload.error ||
      `Failed to create TTS job: HTTP ${createResp.status}`;
    throw new Error(errMsg);
  }

  while (Date.now() - startedAt < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const statusResp = await fetch(
      `/api/generate/tts?jobId=${encodeURIComponent(createJson.jobId)}`,
      { cache: 'no-store' },
    );
    const statusJson = (await statusResp.json().catch(() => ({}))) as
      | TTSSuccessPayload
      | TTSJobPendingPayload
      | TTSErrorPayload;

    if (!statusResp.ok) {
      const errMsg =
        (statusJson as TTSErrorPayload)?.details ||
        (statusJson as TTSErrorPayload)?.error ||
        `TTS job failed: HTTP ${statusResp.status}`;
      throw new Error(errMsg);
    }
    if ((statusJson as TTSJobPendingPayload).status === 'pending') {
      continue;
    }
    if ((statusJson as TTSSuccessPayload).success && (statusJson as TTSSuccessPayload).base64) {
      return statusJson as TTSSuccessPayload;
    }
  }

  throw new Error('TTS job polling timed out.');
}
