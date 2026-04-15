/**
 * Gamma public API client (server-only).
 */
const GAMMA_API_BASE = 'https://public-api.gamma.app/v1.0';

export function getGammaApiKey(): string | undefined {
  const key = process.env.GAMMA_API_KEY?.trim();
  return key || undefined;
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export interface GammaCreateResponse {
  generationId: string;
  warnings?: string;
}

export interface GammaStatusResponse {
  generationId: string;
  status: string;
  gammaUrl?: string;
  exportUrl?: string;
  credits?: { deducted?: number; remaining?: number };
  [key: string]: unknown;
}

export async function gammaCreateGeneration(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<GammaCreateResponse> {
  const response = await fetch(`${GAMMA_API_BASE}/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const json = parseJsonSafe(text) as Record<string, unknown> | null;

  if (!response.ok) {
    const message =
      json && typeof json.message === 'string'
        ? json.message
        : text.slice(0, 500) || response.statusText;
    throw new Error(`Gamma API ${response.status}: ${message}`);
  }

  const generationId = json?.generationId;
  if (typeof generationId !== 'string' || !generationId) {
    throw new Error('Gamma API returned no generationId');
  }

  return {
    generationId,
    warnings: typeof json.warnings === 'string' ? json.warnings : undefined,
  };
}

export async function gammaGetGeneration(
  apiKey: string,
  generationId: string,
): Promise<GammaStatusResponse> {
  const response = await fetch(`${GAMMA_API_BASE}/generations/${encodeURIComponent(generationId)}`, {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  const json = parseJsonSafe(text) as GammaStatusResponse | null;

  if (!response.ok) {
    const message =
      json && typeof (json as { message?: string }).message === 'string'
        ? (json as { message: string }).message
        : text.slice(0, 500) || response.statusText;
    throw new Error(`Gamma API ${response.status}: ${message}`);
  }

  if (!json || typeof json.status !== 'string') {
    throw new Error('Gamma API returned invalid status payload');
  }

  return json;
}
