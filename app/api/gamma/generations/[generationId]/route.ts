import { type NextRequest } from 'next/server';
import { gammaGetGeneration, getGammaApiKey } from '@/lib/gamma/client';
import { getDocumentProxy } from 'unpdf';

const gammaPageCountCache = new Map<string, number>();

async function resolvePageCount(exportUrl: string): Promise<number | undefined> {
  const cached = gammaPageCountCache.get(exportUrl);
  if (typeof cached === 'number' && cached > 0) return cached;

  const response = await fetch(exportUrl, { method: 'GET' });
  if (!response.ok) return undefined;

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer.byteLength) return undefined;

  const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
  const pageCount = Number(pdf.numPages);
  if (Number.isFinite(pageCount) && pageCount > 0) {
    gammaPageCountCache.set(exportUrl, pageCount);
    return pageCount;
  }
  return undefined;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ generationId: string }> },
) {
  try {
    const gammaKey = getGammaApiKey();
    if (!gammaKey) {
      return Response.json(
        { success: false, error: 'GAMMA_API_KEY is not configured' },
        { status: 401 },
      );
    }

    const { generationId } = await ctx.params;
    if (!generationId?.trim()) {
      return Response.json({ success: false, error: 'generationId is required' }, { status: 400 });
    }

    const status = await gammaGetGeneration(gammaKey, generationId.trim());
    console.log('[api/gamma/generations] gamma_status_response', {
      generationId: status.generationId,
      status: status.status,
      gammaUrl: status.gammaUrl ?? null,
      exportUrl: status.exportUrl ?? null,
      credits: status.credits ?? null,
    });
    const pageCount =
      status.status === 'completed' && typeof status.exportUrl === 'string' && status.exportUrl.trim()
        ? await resolvePageCount(status.exportUrl.trim())
        : undefined;

    return Response.json({
      success: true,
      generationId: status.generationId,
      status: status.status,
      gammaUrl: status.gammaUrl,
      exportUrl: status.exportUrl,
      pageCount,
      credits: status.credits,
      provider: 'gamma',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, error: 'Gamma API poll failed', details: message },
      { status: 502 },
    );
  }
}
