/**
 * RAG Documents API
 * GET /api/rag/documents - List all indexed documents
 * DELETE /api/rag/documents/:fileName - Delete a document
 */

import { NextRequest } from 'next/server';
import { getRAGService } from '@/lib/rag/rag-service';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createClient } from '@supabase/supabase-js';

const log = createLogger('RAG Documents');

// Initialize Supabase client for storage
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

export const dynamic = 'force-dynamic';

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

    // First, get document information to check for storage path
    let storagePath: string | null = null;
    if (supabase) {
      try {
        // Try to find the document in vector store to get storage path
        const vectorStore = await import('@/lib/rag/vector-store').then((m) => m.getVectorStore());
        const allChunks = await vectorStore.getAllChunks();

        // Find a chunk from this document to get storage path from metadata
        const documentChunk = allChunks.find((chunk) => chunk.metadata.fileName === fileName);
        if (documentChunk && documentChunk.metadata.storagePath) {
          storagePath = documentChunk.metadata.storagePath;
        }
      } catch (error) {
        log.warn('Could not retrieve storage path for document:', error);
      }
    }

    // Delete from vector store
    const ragService = getRAGService();
    await ragService.deleteDocument(fileName);

    // Delete from Supabase Storage if path exists
    if (storagePath && supabase) {
      try {
        const { error } = await supabase.storage.from('rag-documents').remove([storagePath]);

        if (error) {
          log.warn('Failed to delete file from Supabase Storage:', error);
          console.log(`⚠️  Failed to delete file from Supabase Storage: ${storagePath}`);
        } else {
          console.log(`🗑️  Deleted file from Supabase Storage: ${storagePath}`);
        }
      } catch (error) {
        log.warn('Error deleting file from Supabase Storage:', error);
        console.log(`⚠️  Error deleting file from Supabase Storage: ${error}`);
      }
    }

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
