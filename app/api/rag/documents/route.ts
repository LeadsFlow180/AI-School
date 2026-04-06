/**
 * RAG Documents API
 * GET /api/rag/documents - List all indexed documents
 * DELETE /api/rag/documents/:fileName - Delete a document
 */

import { NextRequest } from 'next/server';
import { getRAGService } from '@/lib/rag/rag-service';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('RAG Documents');

export async function GET() {
  try {
    const ragService = getRAGService();
    const documents = await ragService.getAllDocuments();

    // Get detailed chunk information for debugging
    const vectorStore = await import('@/lib/rag/vector-store').then((m) => m.getVectorStore());
    const allChunks = await vectorStore.getAllChunks();

    return apiSuccess({
      documents: documents.map((fileName) => ({ fileName })),
      totalChunks: allChunks.length,
      chunksByDocument: allChunks.reduce(
        (acc, chunk) => {
          const fileName = chunk.metadata.fileName;
          if (!acc[fileName]) acc[fileName] = [];
          acc[fileName].push({
            id: chunk.id,
            content: chunk.content.substring(0, 200) + '...', // First 200 chars
            pageNumber: chunk.metadata.pageNumber,
          });
          return acc;
        },
        {} as Record<string, any[]>,
      ),
    });
  } catch (error) {
    log.error('Error listing RAG documents:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to list documents',
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const fileName = url.searchParams.get('fileName');

    if (!fileName) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'fileName parameter is required');
    }

    const ragService = getRAGService();
    await ragService.deleteDocument(fileName);

    return apiSuccess({
      message: `Document ${fileName} deleted successfully`,
    });
  } catch (error) {
    log.error('Error deleting RAG document:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to delete document',
    );
  }
}
