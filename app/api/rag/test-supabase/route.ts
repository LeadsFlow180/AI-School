/**
 * Test Supabase Service Role Key
 * GET /api/rag/test-supabase
 * Test the Supabase service role key configuration
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('🔧 Testing Supabase Service Role Key:');
    console.log('  - URL:', supabaseUrl ? '✅ set' : '❌ not set');
    console.log(
      '  - Service Key:',
      supabaseServiceKey && supabaseServiceKey !== 'your_service_role_key_here'
        ? '✅ set'
        : '❌ not set or placeholder',
    );

    if (
      !supabaseUrl ||
      !supabaseServiceKey ||
      supabaseServiceKey === 'your_service_role_key_here'
    ) {
      return apiError('CONFIG_ERROR', 500, 'Supabase URL or service role key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Test 1: Auth session (should work with service role key)
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.log('❌ Auth session test failed:', sessionError.message);
        return apiError('AUTH_ERROR', 500, `Auth session test failed: ${sessionError.message}`);
      }
      console.log('✅ Auth session test passed');
    } catch (err) {
      console.log('❌ Auth session test error:', err);
      return apiError('AUTH_ERROR', 500, `Auth session test error: ${err}`);
    }

    // Test 2: Storage access
    try {
      const { data: buckets, error: storageError } = await supabase.storage.listBuckets();
      if (storageError) {
        console.log('❌ Storage test failed:', storageError.message);
        return apiError('STORAGE_ERROR', 500, `Storage test failed: ${storageError.message}`);
      }
      console.log(
        '✅ Storage test passed, buckets:',
        buckets?.map((b) => b.name).join(', ') || 'none',
      );
    } catch (err) {
      console.log('❌ Storage test error:', err);
      return apiError('STORAGE_ERROR', 500, `Storage test error: ${err}`);
    }

    // Test 3: Database access (if you have a test table)
    try {
      const { data: dbData, error: dbError } = await supabase
        .from('documents')
        .select('count', { count: 'exact', head: true });

      if (dbError) {
        console.log(
          '⚠️ Database test failed (this is expected if no documents table):',
          dbError.message,
        );
      } else {
        console.log('✅ Database test passed, document count:', dbData);
      }
    } catch (err) {
      console.log('⚠️ Database test error:', err);
    }

    return apiSuccess({
      message: 'Supabase service role key tests completed',
      config: {
        url: !!supabaseUrl,
        serviceKey: !!(supabaseServiceKey && supabaseServiceKey !== 'your_service_role_key_here'),
      },
      tests: {
        auth: 'passed',
        storage: 'passed',
        database: 'checked',
      },
    });
  } catch (error) {
    console.error('❌ Test endpoint error:', error);
    return apiError('TEST_ERROR', 500, `Test failed: ${error}`);
  }
}
