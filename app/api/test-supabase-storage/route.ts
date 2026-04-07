/**
 * Test Supabase Storage Connection
 * GET /api/test-supabase-storage
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apiError, apiSuccess } from '@/lib/server/api-response';

// Initialize Supabase client for storage
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  supabaseUrl && supabaseServiceKey && supabaseServiceKey !== 'your_service_role_key_here'
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

export async function GET(req: NextRequest) {
  try {
    const results: any = {
      config: {
        url: supabaseUrl ? 'set' : 'not set',
        serviceKey:
          supabaseServiceKey && supabaseServiceKey !== 'your_service_role_key_here'
            ? 'set'
            : 'not set or placeholder',
        client: supabase ? 'initialized' : 'not initialized',
      },
    };

    if (!supabase) {
      return apiSuccess({
        ...results,
        status: 'FAILED',
        message: 'Supabase client not initialized. Check your SUPABASE_SERVICE_ROLE_KEY.',
      });
    }

    // Test basic connection
    try {
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      results.buckets = {
        success: !bucketsError,
        count: buckets?.length || 0,
        names: buckets?.map((b) => b.name) || [],
        error: bucketsError?.message,
      };
    } catch (error: any) {
      results.buckets = {
        success: false,
        error: error.message,
      };
    }

    // Test rag-documents bucket specifically
    try {
      const bucketName = 'rag-documents';
      const { data: files, error: filesError } = await supabase.storage.from(bucketName).list();
      results.ragDocumentsBucket = {
        success: !filesError,
        fileCount: files?.length || 0,
        files: files?.map((f) => f.name) || [],
        error: filesError?.message,
      };
    } catch (error: any) {
      results.ragDocumentsBucket = {
        success: false,
        error: error.message,
      };
    }

    const hasErrors = Object.values(results).some((test: any) => test && test.error);

    return apiSuccess({
      ...results,
      status: hasErrors ? 'PARTIAL_SUCCESS' : 'SUCCESS',
      message: hasErrors ? 'Some tests failed' : 'All tests passed',
    });
  } catch (error: any) {
    return apiError('TEST_FAILED', 500, error.message);
  }
}
