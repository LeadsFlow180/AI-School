import { type NextRequest } from 'next/server';
import { MAX_PDF_CONTENT_CHARS } from '@/lib/constants/generation';
import { createLogger } from '@/lib/logger';
import { gammaCreateGeneration, getGammaApiKey } from '@/lib/gamma/client';
import { getRAGService } from '@/lib/rag/rag-service';
import { resolveApiKey } from '@/lib/server/provider-config';

const log = createLogger('GammaGenerate');

const RAG_SLIDE_INSTRUCTIONS =
  'Create slides that teach the topic using the reference material. Stay accurate to the source facts, terminology, and examples.';

function buildGammaInputText(topic: string, ragContext: string): string {
  if (!ragContext.trim()) return topic;
  const trimmedContext = ragContext.slice(0, MAX_PDF_CONTENT_CHARS);
  return `Topic: ${topic}\n\nReference material (base all slide content on this source):\n${trimmedContext}`;
}

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
      enableRAG?: boolean;
    };

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return Response.json({ success: false, error: 'prompt is required' }, { status: 400 });
    }

    let ragContext = '';
    if (body.enableRAG) {
      try {
        const ragApiKey = resolveApiKey('openai');
        if (ragApiKey) {
          const ragService = getRAGService();
          const ragResult = await ragService.query(prompt, ragApiKey);
          if (ragResult.isPDFRelated && ragResult.context) {
            ragContext = ragResult.context;
            log.info(
              `Added RAG context to Gamma prompt: ${ragResult.retrievedChunks.length} chunks`,
            );
          } else {
            log.info('RAG enabled for Gamma but no relevant chunks were found');
          }
        } else {
          log.warn('RAG enabled for Gamma but OPENAI_API_KEY is not configured; skipping RAG context');
        }
      } catch (error) {
        log.warn('Failed to load RAG context for Gamma; continuing without it:', error);
      }
    }

    const hasRagContext = ragContext.trim().length > 0;
    const inputText = buildGammaInputText(prompt, ragContext);
    const textMode = hasRagContext ? 'condense' : (body.textMode ?? 'generate');

    let additionalInstructions = body.additionalInstructions?.trim() || '';
    if (hasRagContext) {
      additionalInstructions = additionalInstructions
        ? `${additionalInstructions}\n\n${RAG_SLIDE_INSTRUCTIONS}`
        : RAG_SLIDE_INSTRUCTIONS;
    }

    const payload: Record<string, unknown> = {
      inputText,
      title: prompt.slice(0, 200),
      textMode,
      format: body.format ?? 'presentation',
      numCards: Math.min(75, Math.max(1, body.numCards ?? 10)),
      cardSplit: 'auto',
    };

    if (additionalInstructions) {
      payload.additionalInstructions = additionalInstructions.slice(0, 5000);
    }
    if (body.exportAs) {
      payload.exportAs = body.exportAs;
    }

    const created = await gammaCreateGeneration(gammaKey, payload);
    console.log('[api/gamma/generate] gamma_create_response', {
      generationId: created.generationId,
      warnings: created.warnings ?? null,
      ragUsed: hasRagContext,
      request: payload,
    });
    return Response.json({
      success: true,
      generationId: created.generationId,
      warnings: created.warnings,
      provider: 'gamma',
      ragUsed: hasRagContext,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, error: 'Gamma API request failed', details: message },
      { status: 502 },
    );
  }
}
