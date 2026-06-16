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
  return `Title/Topic: ${topic}\n\nReference material (base all slide content on these sources):\n${trimmedContext}`;
}

function summarizeGammaPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const summarized = { ...payload };
  if (typeof summarized.inputText === 'string' && summarized.inputText.length > 800) {
    summarized.inputText = `${summarized.inputText.slice(0, 800)}... [${summarized.inputText.length} chars total]`;
  }
  if (
    typeof summarized.additionalInstructions === 'string' &&
    summarized.additionalInstructions.length > 500
  ) {
    summarized.additionalInstructions = `${summarized.additionalInstructions.slice(0, 500)}... [${summarized.additionalInstructions.length} chars total]`;
  }
  return summarized;
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
    let ragSourceCount = 0;
    if (body.enableRAG) {
      log.info('RAG enabled for Gamma generation; querying indexed documents');
      try {
        const ragApiKey = resolveApiKey('openai');
        if (ragApiKey) {
          const ragService = getRAGService();
          const ragResult = await ragService.query(prompt, ragApiKey);
          if (ragResult.isPDFRelated && ragResult.context) {
            ragContext = ragResult.context;
            ragSourceCount = ragResult.retrievedChunks.length;
            log.info(
              `Added RAG context to Gamma prompt: ${ragSourceCount} chunks from ${ragResult.sources.length} sources`,
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

    log.info('Gamma generation request body', {
      enableRAG: body.enableRAG ?? false,
      ragUsed: hasRagContext,
      ragSourceCount,
      title: payload.title,
      textMode: payload.textMode,
      numCards: payload.numCards,
      format: payload.format,
      exportAs: payload.exportAs ?? null,
      payload: summarizeGammaPayload(payload),
    });

    const created = await gammaCreateGeneration(gammaKey, payload);
    log.info('Gamma generation started', {
      generationId: created.generationId,
      warnings: created.warnings ?? null,
      ragUsed: hasRagContext,
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
