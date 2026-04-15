import { type NextRequest } from 'next/server';
import { gammaCreateGeneration, getGammaApiKey } from '@/lib/gamma/client';

export async function POST(req: NextRequest) {
  try {
    const gammaKey = getGammaApiKey();
    if (!gammaKey) {
      return Response.json(
        { success: false, error: 'Set GAMMA_API_KEY in .env.local' },
        { status: 401 },
      );
    }

    const body = (await req.json()) as {
      prompt?: string;
      numCards?: number;
      exportAs?: 'pptx' | 'pdf' | 'png';
      textMode?: 'generate' | 'condense' | 'preserve';
      format?: 'presentation' | 'document' | 'social' | 'webpage';
      additionalInstructions?: string;
    };

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return Response.json({ success: false, error: 'prompt is required' }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      inputText: prompt,
      textMode: body.textMode ?? 'generate',
      format: body.format ?? 'presentation',
      numCards: Math.min(75, Math.max(1, body.numCards ?? 10)),
      cardSplit: 'auto',
    };

    if (body.additionalInstructions?.trim()) {
      payload.additionalInstructions = body.additionalInstructions.trim();
    }
    if (body.exportAs) {
      payload.exportAs = body.exportAs;
    }

    const created = await gammaCreateGeneration(gammaKey, payload);
    console.log('[api/gamma/generate] gamma_create_response', {
      generationId: created.generationId,
      warnings: created.warnings ?? null,
      request: payload,
    });
    return Response.json({
      success: true,
      generationId: created.generationId,
      warnings: created.warnings,
      provider: 'gamma',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, error: 'Gamma API request failed', details: message },
      { status: 502 },
    );
  }
}
