/**
 * Test RAG Supabase-Only Mode
 * GET /api/test-rag-supabase
 */

import { NextRequest } from 'next/server';
import { getRAGService } from '@/lib/rag/rag-service';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export async function GET(req: NextRequest) {
  try {
    const results: any = {
      config: {
        vectorDB: process.env.VECTOR_DB,
        supabaseUrl: process.env.SUPABASE_URL ? 'configured' : 'missing',
        serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configured' : 'missing',
      },
      status: 'unknown',
    };

    // Test RAG service initialization
    try {
      const ragService = getRAGService();
      results.ragService = 'initialized successfully';
    } catch (error: any) {
      results.ragService = `failed: ${error.message}`;
      results.status = 'FAILED';
      return apiSuccess(results);
    }

    // Test document listing
    try {
      const ragService = getRAGService();
      const documents = await ragService.getAllDocuments();
      results.documents = {
        count: documents.length,
        names: documents,
      };
    } catch (error: any) {
      results.documents = `failed: ${error.message}`;
    }

    // Test query (if documents exist)
    if (results.documents?.count > 0) {
      try {
        const ragService = getRAGService();
        const queryResult = await ragService.query('test query');
        results.queryTest = {
          chunksRetrieved: queryResult.retrievedChunks.length,
          isPDFRelated: queryResult.isPDFRelated,
          contextLength: queryResult.context.length,
        };
      } catch (error: any) {
        results.queryTest = `failed: ${error.message}`;
      }
    }

    const hasErrors = Object.values(results).some(
      (test: any) => typeof test === 'string' && test.includes('failed'),
    );

    results.status = hasErrors ? 'PARTIAL_SUCCESS' : 'SUCCESS';
    results.message = hasErrors ? 'Some tests failed' : 'RAG Supabase-only mode working correctly';

    return apiSuccess(results);
  } catch (error: any) {
    return apiError('TEST_FAILED', 500, error.message);
  }
}
