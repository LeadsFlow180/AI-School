/**
 * RAG Query API
 * POST /api/rag/query
 * Query the RAG system for relevant information
 */

import { NextRequest } from 'next/server';
import { getRAGService } from '@/lib/rag/rag-service';
import { resolveApiKey } from '@/lib/server/provider-config';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('RAG Query');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, apiKey: clientApiKey } = body as {
      query?: string;
      apiKey?: string;
    };

    if (!query || !query.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'query is required');
    }

    const apiKey = clientApiKey || resolveApiKey('openai');

    if (!apiKey) {
      return apiError(
        'MISSING_API_KEY',
        401,
        'OpenAI API key is required for embeddings. Set it in Settings or provide in request.',
      );
    }

    log.info(`Processing RAG query: ${query.substring(0, 100)}...`);

    console.log(`🔎 RAG Query API: "${query.trim()}"`);

    const ragService = getRAGService();
    const result = await ragService.query(query.trim(), apiKey);

    console.log(
      `✅ RAG Query completed: ${result.retrievedChunks.length} chunks, isPDFRelated: ${result.isPDFRelated}`,
    );

    return apiSuccess({
      query: result.query,
      isPDFRelated: result.isPDFRelated,
      context: result.context,
      sources: result.sources,
      retrievedChunksCount: result.retrievedChunks.length,
    });
  } catch (error) {
    log.error('Error processing RAG query:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to process query',
    );
  }
}
