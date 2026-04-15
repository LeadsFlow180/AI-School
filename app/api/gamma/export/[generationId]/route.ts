import { type NextRequest } from 'next/server';
import { gammaGetGeneration, getGammaApiKey } from '@/lib/gamma/client';

const gammaExportUrlCache = new Map<string, string>();

async function fetchExportPdf(exportUrl: string): Promise<Response> {
  const exportResponse = await fetch(exportUrl, { method: 'GET' });
  if (!exportResponse.ok) {
    throw new Error(`Failed to fetch Gamma export: ${exportResponse.status}`);
  }
  return exportResponse;
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

    const generationIdValue = generationId.trim();
    let exportUrl = gammaExportUrlCache.get(generationIdValue);

    if (!exportUrl) {
      const status = await gammaGetGeneration(gammaKey, generationIdValue);
      console.log('[api/gamma/export] gamma_export_status', {
        generationId: status.generationId,
        status: status.status,
        exportUrl: status.exportUrl ?? null,
      });
      if (status.status !== 'completed' || !status.exportUrl) {
        return Response.json(
          { success: false, error: 'Gamma export is not ready yet', status: status.status },
          { status: 409 },
        );
      }
      exportUrl = status.exportUrl;
      gammaExportUrlCache.set(generationIdValue, exportUrl);
    }

    let exportResponse: Response;
    try {
      exportResponse = await fetchExportPdf(exportUrl);
    } catch {
      // URL may be expired; refresh from Gamma API and retry once.
      const status = await gammaGetGeneration(gammaKey, generationIdValue);
      if (status.status !== 'completed' || !status.exportUrl) {
        return Response.json(
          { success: false, error: 'Gamma export is not ready yet', status: status.status },
          { status: 409 },
        );
      }
      exportUrl = status.exportUrl;
      gammaExportUrlCache.set(generationIdValue, exportUrl);
      try {
        exportResponse = await fetchExportPdf(exportUrl);
      } catch (retryError) {
        const message = retryError instanceof Error ? retryError.message : String(retryError);
        return Response.json(
          { success: false, error: 'Failed to fetch Gamma export', details: message },
          { status: 502 },
        );
      }
    }

    const contentType = exportResponse.headers.get('content-type') || 'application/pdf';
    const arrayBuffer = await exportResponse.arrayBuffer();

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="gamma-${generationIdValue}.pdf"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, error: 'Gamma export proxy failed', details: message },
      { status: 502 },
    );
  }
}
