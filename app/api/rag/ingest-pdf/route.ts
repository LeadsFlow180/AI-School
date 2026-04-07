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
import { createClient } from '@supabase/supabase-js';

const log = createLogger('RAG Ingest PDF');

// Initialize Supabase client for storage
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  supabaseUrl && supabaseServiceKey && supabaseServiceKey !== 'your_service_role_key_here'
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

console.log('🔧 Supabase Storage Config:');
console.log('  - URL:', supabaseUrl ? '✅ set' : '❌ not set');
console.log(
  '  - Service Key:',
  supabaseServiceKey && supabaseServiceKey !== 'your_service_role_key_here'
    ? '✅ set'
    : '❌ not set or placeholder',
);
console.log('  - Client initialized:', supabase ? '✅ yes' : '❌ no');

// Test Supabase connection
if (supabase) {
  supabase.storage
    .listBuckets()
    .then(({ data, error }) => {
      if (error) {
        console.log('❌ Supabase Storage connection test failed:', error.message);
      } else {
        console.log(
          '✅ Supabase Storage connection test passed, buckets:',
          data?.map((b) => b.name).join(', ') || 'none',
        );
      }
    })
    .catch((err) => {
      console.log('❌ Supabase Storage connection test error:', err.message);
    });
}

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

    // Upload PDF to Supabase Storage
    let storagePath: string | null = null;
    if (supabase) {
      try {
        const bucketName = 'rag-documents';
        const fileName = `${Date.now()}-${pdfFile.name}`;
        const fileBuffer = Buffer.from(await pdfFile.arrayBuffer());

        // First, ensure the bucket exists
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some((bucket) => bucket.name === bucketName);

        if (!bucketExists) {
          console.log(`📦 Creating Supabase Storage bucket: ${bucketName}`);
          const { error: createError } = await supabase.storage.createBucket(bucketName, {
            public: true, // Make bucket public for easier access
          });
          if (createError) {
            console.log(`⚠️  Failed to create bucket: ${createError.message}`);
          } else {
            console.log(`✅ Created bucket: ${bucketName}`);
          }
        }

        console.log(`📤 Uploading PDF to Supabase Storage: ${fileName}`);
        const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(fileName, fileBuffer, {
            contentType: pdfFile.type,
            upsert: false,
          });

        if (error) {
          console.log(`❌ Upload error: ${error.message}`);
          throw error;
        } else {
          storagePath = data.path;
          console.log(`✅ PDF uploaded to Supabase Storage: ${storagePath}`);
        }
      } catch (error) {
        log.warn('Failed to upload PDF to Supabase Storage:', error);
        console.log('⚠️  PDF upload to Supabase Storage failed, continuing with processing only');
      }
    } else {
      console.log('⚠️  Supabase not configured, skipping PDF upload to storage');
    }

    const ragService = getRAGService();
    const document = await ragService.ingestPDF(pdfFile, effectiveApiKey, storagePath);

    // Add storage path to document metadata if upload succeeded
    if (storagePath) {
      document.storagePath = storagePath;
      console.log(`🔗 Added storage path to document: ${storagePath}`);
    }

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
