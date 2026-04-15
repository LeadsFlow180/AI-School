import { type NextRequest } from 'next/server';
import { gammaGetGeneration, getGammaApiKey } from '@/lib/gamma/client';
import sharp from 'sharp';

export const runtime = 'nodejs';

const gammaExportUrlCache = new Map<string, string>();
const gammaPageImageCache = new Map<string, Buffer>();

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ generationId: string; page: string }> },
) {
  try {
    const gammaKey = getGammaApiKey();
    if (!gammaKey) {
      return Response.json(
        { success: false, error: 'GAMMA_API_KEY is not configured' },
        { status: 401 },
      );
    }

    const { generationId, page } = await ctx.params;
    const generationIdValue = generationId?.trim();
    const pageNumber = Number.parseInt(page, 10);
    if (!generationIdValue) {
      return Response.json({ success: false, error: 'generationId is required' }, { status: 400 });
    }
    if (!Number.isFinite(pageNumber) || pageNumber < 1) {
      return Response.json({ success: false, error: 'Invalid page number' }, { status: 400 });
    }

    let exportUrl = gammaExportUrlCache.get(generationIdValue);
    if (!exportUrl) {
      const status = await gammaGetGeneration(gammaKey, generationIdValue);
      if (status.status !== 'completed' || !status.exportUrl) {
        return Response.json(
          { success: false, error: 'Gamma export is not ready yet', status: status.status },
          { status: 409 },
        );
      }
      exportUrl = status.exportUrl;
      gammaExportUrlCache.set(generationIdValue, exportUrl);
    }

    const cacheKey = `${generationIdValue}:${pageNumber}`;
    const cachedImage = gammaPageImageCache.get(cacheKey);
    if (cachedImage) {
      return new Response(cachedImage, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'private, max-age=300',
        },
      });
    }

    const exportResponse = await fetch(exportUrl, { method: 'GET' });
    if (!exportResponse.ok) {
      return Response.json(
        { success: false, error: 'Failed to fetch Gamma export', status: exportResponse.status },
        { status: 502 },
      );
    }

    const pdfBuffer = Buffer.from(await exportResponse.arrayBuffer());
    let pngBuffer: Buffer | null = null;
    try {
      pngBuffer = await sharp(pdfBuffer, { density: 180, page: pageNumber - 1 }).png().toBuffer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json(
        { success: false, error: 'Could not render Gamma page image', details: message },
        { status: 502 },
      );
    }

    if (!pngBuffer || pngBuffer.length === 0) {
      return Response.json({ success: false, error: 'Could not render Gamma page image' }, { status: 502 });
    }
    gammaPageImageCache.set(cacheKey, pngBuffer);

    return new Response(pngBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, error: 'Gamma page render failed', details: message },
      { status: 502 },
    );
  }
}
