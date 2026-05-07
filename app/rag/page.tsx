'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RAGManager } from '@/components/rag/rag-manager';

export default function RAGPage() {
  const router = useRouter();

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.14),transparent_35%),radial-gradient(circle_at_90%_15%,rgba(56,189,248,0.12),transparent_30%),linear-gradient(to_bottom,#f8fafc,#eef2ff_45%,#f8fafc)] dark:bg-[radial-gradient(circle_at_top,rgba(129,140,248,0.24),transparent_35%),radial-gradient(circle_at_90%_15%,rgba(34,211,238,0.18),transparent_30%),linear-gradient(to_bottom,#020617,#0f172a_45%,#020617)] p-4 md:p-8">
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Button
          variant="ghost"
          onClick={() => router.push('/')}
          className="rounded-full px-3 text-zinc-600 bg-white/55 border border-white/70 hover:bg-white/80 dark:text-zinc-300 dark:bg-slate-900/55 dark:border-slate-700/70 dark:hover:bg-slate-800/80"
        >
          <ArrowLeft className="size-4 mr-1" />
          Back to Home
        </Button>
        <div className="rounded-2xl border border-white/85 dark:border-slate-700/70 bg-white/80 dark:bg-slate-900/72 p-4 sm:p-6 backdrop-blur-xl shadow-[0_24px_60px_-34px_rgba(15,23,42,0.6)] ring-1 ring-white/60 dark:ring-white/10">
          <RAGManager />
        </div>
      </div>
    </div>
  );
}
