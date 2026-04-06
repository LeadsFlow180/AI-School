/**
 * RAG PDF Ingestion API
 * POST /api/rag/ingest-pdf
 * Upload and process a PDF for RAG
 */

import { NextRequest } from 'next/server';
import { getRAGService } from '@/lib/rag/rag-service';
import { resolveApiKey } from '@/lib/server/provider-config';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('RAG Ingest PDF');

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      log.error('Invalid Content-Type for PDF upload:', contentType);
      return apiError(
        'INVALID_REQUEST',
        400,
        `Invalid Content-Type: expected multipart/form-data, got "${contentType}"`,
      );
    }

    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File | null;
    const apiKey = formData.get('apiKey') as string | null;

    if (!pdfFile) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'No PDF file provided');
    }

    // Validate file type
    if (!pdfFile.type.includes('pdf')) {
      return apiError('INVALID_REQUEST', 400, 'File must be a PDF');
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (pdfFile.size > maxSize) {
      return apiError('INVALID_REQUEST', 400, 'PDF file must be less than 50MB');
    }

    const effectiveApiKey = apiKey || resolveApiKey('openai');

    if (!effectiveApiKey) {
      return apiError(
        'MISSING_API_KEY',
        401,
        'OpenAI API key is required for embeddings. Set it in Settings or provide in request.',
      );
    }

    log.info(`Processing PDF for RAG: ${pdfFile.name} (${pdfFile.size} bytes)`);

    console.log(
      `📄 RAG PDF Ingestion: Starting processing of "${pdfFile.name}" (${pdfFile.size} bytes)`,
    );

    const ragService = getRAGService();
    const document = await ragService.ingestPDF(pdfFile, effectiveApiKey);

    console.log(
      `✅ RAG PDF Ingestion: Completed processing of "${pdfFile.name}" - ${document.chunks.length} chunks created`,
    );

    return apiSuccess({
      document: {
        id: document.id,
        fileName: document.fileName,
        fileSize: document.fileSize,
        pageCount: document.pageCount,
        chunksProcessed: document.chunks.length,
        createdAt: document.createdAt,
      },
    });
  } catch (error) {
    log.error('Error ingesting PDF for RAG:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to process PDF',
    );
  }
}
