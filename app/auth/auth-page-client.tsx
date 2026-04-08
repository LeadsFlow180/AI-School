'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Sparkles, Database, Presentation } from 'lucide-react';
import { motion } from 'motion/react';
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
    <div className="min-h-screen bg-[linear-gradient(120deg,#f8fafc_0%,#eef2ff_45%,#f8fafc_100%)] dark:bg-[linear-gradient(120deg,#020617_0%,#111827_45%,#020617_100%)]">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 gap-8 px-4 py-10 md:px-8 lg:grid-cols-2 lg:items-stretch lg:gap-10 lg:py-14">
        <div className="relative hidden h-full overflow-hidden rounded-3xl border border-slate-200/70 bg-white/75 p-8 shadow-xl backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-900/70 lg:flex lg:flex-col">
          <div className="pointer-events-none absolute -right-16 -top-12 h-56 w-56 rounded-full bg-violet-400/25 blur-3xl dark:bg-violet-600/30" />
          <div className="pointer-events-none absolute -left-16 bottom-8 h-52 w-52 rounded-full bg-blue-400/20 blur-3xl dark:bg-blue-600/25" />

          <div className="relative z-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-violet-200/70 bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-violet-700 dark:border-violet-700/50 dark:bg-violet-900/30 dark:text-violet-300">
              <ShieldCheck className="size-3.5" />
              Admin Control Center
            </p>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Secure access for classroom administrators
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Sign in to manage AI classroom generation, admin-only workflows, and course data linked
              to your account.
            </p>
          </div>

          <div className="relative z-10 mt-8 grid gap-3">
            <div className="rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/60">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                <Sparkles className="size-4 text-violet-500" />
                Generate interactive classrooms
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/60">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                <Database className="size-4 text-blue-500" />
                Persist and load classrooms from Supabase
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/60">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                <Presentation className="size-4 text-emerald-500" />
                Deliver polished multi-agent learning sessions
              </p>
            </div>
          </div>

        </div>

        <div className="flex h-full items-stretch justify-center">
          <div className="flex w-full max-w-md flex-col gap-4 lg:h-full lg:justify-between">
            <SupabaseAuthCard onAuthenticated={() => router.replace(nextPath)} />

            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-md dark:border-slate-700/60 dark:bg-slate-800/60"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                  Live Classroom Preview
                </p>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <motion.span
                    className="size-1.5 rounded-full bg-emerald-500"
                    animate={{ opacity: [0.35, 1, 0.35] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  Active
                </span>
              </div>

              <motion.svg
                viewBox="0 0 520 220"
                role="img"
                aria-label="AI classroom illustration"
                className="h-auto w-full rounded-xl border border-slate-200/70 bg-slate-50 dark:border-slate-700/60 dark:bg-slate-900/60"
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <defs>
                  <linearGradient id="panelGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#eef2ff" />
                    <stop offset="100%" stopColor="#e2e8f0" />
                  </linearGradient>
                </defs>

                <rect x="18" y="16" width="484" height="188" rx="16" fill="url(#panelGrad)" />
                <g opacity="0.9">
                  <rect x="42" y="38" width="180" height="16" rx="8" fill="#6366f1" />
                  <rect x="42" y="66" width="120" height="10" rx="5" fill="#94a3b8" />
                  <rect x="42" y="84" width="145" height="10" rx="5" fill="#cbd5e1" />
                </g>

                <rect x="254" y="40" width="220" height="124" rx="12" fill="#ffffff" stroke="#cbd5e1" />
                <rect x="270" y="56" width="126" height="12" rx="6" fill="#0f172a" />
                <rect x="270" y="78" width="188" height="8" rx="4" fill="#94a3b8" />
                <rect x="270" y="92" width="166" height="8" rx="4" fill="#cbd5e1" />
                <rect x="270" y="118" width="78" height="28" rx="8" fill="#4f46e5" />
                <rect x="356" y="118" width="102" height="28" rx="8" fill="#e2e8f0" />

                <circle cx="90" cy="152" r="24" fill="#1d4ed8" />
                <circle cx="150" cy="152" r="24" fill="#7c3aed" />
                <circle cx="210" cy="152" r="24" fill="#0f766e" />
              </motion.svg>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
