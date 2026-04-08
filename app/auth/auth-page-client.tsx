'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SupabaseAuthCard } from '@/components/auth/supabase-auth-card';
import { getSessionSafe, getSupabaseClient } from '@/lib/supabase/client';

export function AuthPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = searchParams.get('next') || '/';

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let mounted = true;
    void getSessionSafe(supabase).then((session) => {
      if (!mounted) return;
      if (session) {
        router.replace(nextPath);
      }
    });

    return () => {
      mounted = false;
    };
  }, [nextPath, router]);

  return (
    <div className="min-h-screen bg-[oklch(0.985_0.002_250)] dark:bg-[oklch(0.16_0.02_250)]">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-12">
        <SupabaseAuthCard onAuthenticated={() => router.replace(nextPath)} />
      </div>
    </div>
  );
}
