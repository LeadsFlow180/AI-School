'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RAGManager } from '@/components/rag/rag-manager';

export default function RAGPage() {
  const router = useRouter();

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4 md:p-8">
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Button variant="ghost" onClick={() => router.push('/')}>
          <ArrowLeft className="size-4 mr-1" />
          Back to Home
        </Button>
        <RAGManager />
      </div>
    </div>
  );
}
