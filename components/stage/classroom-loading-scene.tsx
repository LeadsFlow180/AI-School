'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

const CAST = [
  {
    src: '/images/characters/doll-happy-book.svg',
    className: 'w-[min(28vw,140px)] md:w-40',
    enterX: -460,
    enterY: -300,
    y: [0, -4, -7, -3, 0],
    x: [0, 1.2, -1.1, 0.6, 0],
    rotate: [0, -1.2, -2, -0.6, 0],
    scale: [1, 1.01, 1.015, 1.008, 1],
    duration: 5.6,
    delay: 0,
  },
  {
    src: '/images/characters/bunny-excited-rocket.svg',
    className: 'w-[min(32vw,168px)] md:w-48 -mb-1 scale-105',
    enterX: 470,
    enterY: -320,
    y: [0, -6, -10, -5, 0],
    x: [0, -1.1, 1.4, -0.7, 0],
    rotate: [0, 1.5, 2.6, 1, 0],
    scale: [1.03, 1.035, 1.045, 1.038, 1.03],
    duration: 5.2,
    delay: 0.12,
  },
  {
    src: '/images/characters/hero-thinking-globe.svg',
    className: 'w-[min(30vw,150px)] md:w-44',
    enterX: 460,
    enterY: 290,
    y: [0, -5, -8, -4, 0],
    x: [0, 0.8, -1.1, 0.6, 0],
    rotate: [0, 1.1, 1.9, 0.7, 0],
    scale: [1, 1.01, 1.018, 1.01, 1],
    duration: 6,
    delay: 0.22,
  },
];

const LEARNING_SPARKS = [
  {
    text: 'a² + b² = c²',
    kind: 'math' as const,
    className: 'left-[12%] top-[18%]',
    driftX: [0, 6, -4, 2, 0],
    driftY: [0, -10, -18, -8, 0],
    rotate: [0, -2, 1.5, 0],
    duration: 7.6,
    delay: 1.5,
  },
  {
    text: 'E = mc²',
    kind: 'physics' as const,
    className: 'left-[21%] top-[34%]',
    driftX: [0, -5, 4, -2, 0],
    driftY: [0, -8, -14, -6, 0],
    rotate: [0, 2.2, -1.4, 0],
    duration: 8,
    delay: 1.8,
  },
  {
    text: 'H₂O',
    kind: 'physics' as const,
    className: 'left-[14%] bottom-[23%]',
    driftX: [0, 5, -3, 1, 0],
    driftY: [0, -7, -12, -6, 0],
    rotate: [0, -1.5, 1.2, 0],
    duration: 7.2,
    delay: 2.05,
  },
  {
    text: 'Hola',
    kind: 'language' as const,
    className: 'right-[11%] top-[20%]',
    driftX: [0, -6, 5, -2, 0],
    driftY: [0, -9, -16, -7, 0],
    rotate: [0, 1.6, -1.1, 0],
    duration: 7.9,
    delay: 1.65,
  },
  {
    text: 'Bonjour',
    kind: 'language' as const,
    className: 'right-[16%] top-[37%]',
    driftX: [0, 4, -5, 3, 0],
    driftY: [0, -8, -13, -6, 0],
    rotate: [0, -1.8, 1.1, 0],
    duration: 8.2,
    delay: 2.15,
  },
  {
    text: 'A B C',
    kind: 'alphabet' as const,
    className: 'right-[8%] bottom-[25%]',
    driftX: [0, -4, 4, -1, 0],
    driftY: [0, -8, -12, -5, 0],
    rotate: [0, 2, -1.3, 0],
    duration: 7.4,
    delay: 1.9,
  },
  {
    text: 'x + y = 12',
    kind: 'math' as const,
    className: 'left-[30%] top-[14%]',
    driftX: [0, 4, -3, 2, 0],
    driftY: [0, -7, -12, -5, 0],
    rotate: [0, -1.5, 1.1, 0],
    duration: 7.1,
    delay: 2.3,
  },
  {
    text: 'π ≈ 3.1416',
    kind: 'math' as const,
    className: 'left-[39%] top-[30%]',
    driftX: [0, -3, 4, -2, 0],
    driftY: [0, -6, -11, -4, 0],
    rotate: [0, 1.2, -1, 0],
    duration: 7.8,
    delay: 2.6,
  },
  {
    text: 'F = ma',
    kind: 'physics' as const,
    className: 'left-[42%] bottom-[30%]',
    driftX: [0, 3, -4, 2, 0],
    driftY: [0, -7, -13, -5, 0],
    rotate: [0, -1.6, 1.2, 0],
    duration: 8.1,
    delay: 2.45,
  },
  {
    text: 'CO₂',
    kind: 'physics' as const,
    className: 'left-[56%] top-[16%]',
    driftX: [0, -4, 3, -1, 0],
    driftY: [0, -7, -12, -5, 0],
    rotate: [0, 1.4, -1.1, 0],
    duration: 7.3,
    delay: 2.75,
  },
  {
    text: 'Hola • Hello',
    kind: 'language' as const,
    className: 'right-[28%] top-[16%]',
    driftX: [0, 5, -4, 2, 0],
    driftY: [0, -8, -14, -6, 0],
    rotate: [0, -1.3, 1, 0],
    duration: 7.7,
    delay: 2.35,
  },
  {
    text: 'Gracias',
    kind: 'language' as const,
    className: 'right-[33%] bottom-[26%]',
    driftX: [0, -4, 4, -2, 0],
    driftY: [0, -7, -12, -5, 0],
    rotate: [0, 1.5, -1.2, 0],
    duration: 7.9,
    delay: 2.85,
  },
  {
    text: 'A á B β C',
    kind: 'alphabet' as const,
    className: 'left-[34%] bottom-[18%]',
    driftX: [0, 4, -3, 2, 0],
    driftY: [0, -6, -11, -4, 0],
    rotate: [0, -1.2, 1.1, 0],
    duration: 8.2,
    delay: 2.55,
  },
  {
    text: 'Noun • Verbo',
    kind: 'language' as const,
    className: 'right-[42%] top-[32%]',
    driftX: [0, -3, 4, -2, 0],
    driftY: [0, -7, -12, -5, 0],
    rotate: [0, 1.4, -0.9, 0],
    duration: 8.3,
    delay: 2.95,
  },
  {
    text: 'Map • Globe',
    kind: 'language' as const,
    className: 'left-[8%] top-[48%]',
    driftX: [0, 4, -3, 1, 0],
    driftY: [0, -7, -13, -5, 0],
    rotate: [0, -1.2, 1.1, 0],
    duration: 7.8,
    delay: 3.05,
  },
  {
    text: '1/2 + 1/3',
    kind: 'math' as const,
    className: 'left-[24%] bottom-[15%]',
    driftX: [0, -4, 3, -1, 0],
    driftY: [0, -7, -12, -5, 0],
    rotate: [0, 1.4, -1, 0],
    duration: 8.1,
    delay: 3.15,
  },
  {
    text: 'ΔT = T₂ - T₁',
    kind: 'physics' as const,
    className: 'left-[50%] top-[34%]',
    driftX: [0, 5, -4, 2, 0],
    driftY: [0, -8, -14, -6, 0],
    rotate: [0, -1.5, 1.1, 0],
    duration: 8.4,
    delay: 3.25,
  },
  {
    text: 'DNA',
    kind: 'physics' as const,
    className: 'left-[61%] bottom-[20%]',
    driftX: [0, -3, 4, -2, 0],
    driftY: [0, -8, -13, -5, 0],
    rotate: [0, 1.3, -1, 0],
    duration: 7.6,
    delay: 3.35,
  },
  {
    text: 'Arte • Music',
    kind: 'language' as const,
    className: 'right-[19%] bottom-[17%]',
    driftX: [0, 4, -5, 3, 0],
    driftY: [0, -8, -12, -5, 0],
    rotate: [0, -1.4, 1.2, 0],
    duration: 8.2,
    delay: 3.45,
  },
  {
    text: 'if (x) { }',
    kind: 'alphabet' as const,
    className: 'right-[50%] top-[18%]',
    driftX: [0, -4, 4, -2, 0],
    driftY: [0, -7, -11, -5, 0],
    rotate: [0, 1.5, -1.2, 0],
    duration: 7.9,
    delay: 3.55,
  },
  {
    text: '1492',
    kind: 'alphabet' as const,
    className: 'right-[56%] bottom-[22%]',
    driftX: [0, 3, -4, 2, 0],
    driftY: [0, -7, -12, -6, 0],
    rotate: [0, -1.1, 0.9, 0],
    duration: 7.5,
    delay: 3.65,
  },
  {
    text: 'Earth • Mars',
    kind: 'physics' as const,
    className: 'left-[70%] top-[42%]',
    driftX: [0, -5, 4, -2, 0],
    driftY: [0, -8, -14, -6, 0],
    rotate: [0, 1.6, -1.1, 0],
    duration: 8.5,
    delay: 3.75,
  },
] as const;

const MINI_SPARKS = [
  { text: '∑', className: 'left-[7%] top-[10%]', delay: 2.6, duration: 6.8 },
  { text: '∞', className: 'left-[18%] top-[14%]', delay: 2.9, duration: 7.1 },
  { text: 'Ω', className: 'left-[26%] top-[44%]', delay: 3.1, duration: 7.4 },
  { text: 'β', className: 'left-[12%] bottom-[18%]', delay: 3.3, duration: 6.9 },
  { text: 'π', className: 'left-[38%] top-[8%]', delay: 3.5, duration: 7.2 },
  { text: '⚛', className: 'left-[46%] top-[20%]', delay: 3.7, duration: 7.8 },
  { text: 'H₂', className: 'left-[54%] top-[46%]', delay: 3.9, duration: 7.3 },
  { text: 'Na', className: 'left-[62%] bottom-[14%]', delay: 4.1, duration: 7.5 },
  { text: '♪', className: 'right-[30%] top-[10%]', delay: 2.8, duration: 6.7 },
  { text: '♫', className: 'right-[23%] top-[46%]', delay: 3.2, duration: 7.2 },
  { text: '¿', className: 'right-[12%] top-[30%]', delay: 3.4, duration: 6.9 },
  { text: 'ñ', className: 'right-[8%] bottom-[20%]', delay: 3.6, duration: 7.1 },
  { text: 'λ', className: 'right-[41%] bottom-[14%]', delay: 3.8, duration: 7.7 },
  { text: 'Δ', className: 'right-[49%] top-[40%]', delay: 4, duration: 7.4 },
  { text: 'AI', className: 'right-[58%] top-[24%]', delay: 4.2, duration: 7.6 },
  { text: 'Geo', className: 'right-[66%] bottom-[18%]', delay: 4.4, duration: 7.8 },
] as const;

function pickRandomSubset<T>(items: readonly T[], size: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(size, copy.length));
}

const KIND_STYLES = {
  math: 'border-amber-200/75 bg-amber-50/86 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/14 dark:text-amber-200',
  physics:
    'border-sky-200/75 bg-sky-50/86 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/14 dark:text-sky-200',
  alphabet:
    'border-fuchsia-200/75 bg-fuchsia-50/86 text-fuchsia-700 dark:border-fuchsia-400/30 dark:bg-fuchsia-500/14 dark:text-fuchsia-200',
  language:
    'border-emerald-200/75 bg-emerald-50/86 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/14 dark:text-emerald-200',
} as const;

/**
 * Full-viewport “filming” load: soft-focus pastel set, sharp mascots, letterbox + vignette.
 * # Reason: Kids get a playful cue that the app is working; blur reads as depth-of-field, not an error.
 */
export function ClassroomLoadingScene() {
  const { t } = useI18n();
  // # Reason: Keep scene fresh by varying chips per load, while preserving
  // a dense but readable composition every time.
  const activeLearningSparks = useMemo(() => pickRandomSubset(LEARNING_SPARKS, 16), []);
  const activeMiniSparks = useMemo(() => pickRandomSubset(MINI_SPARKS, 12), []);

  return (
    <div
      className={cn(
        'relative flex h-full min-h-[100dvh] w-full flex-col overflow-hidden',
        'bg-transparent text-zinc-900 dark:text-zinc-50',
      )}
    >
      {/* Transparent cinematic haze so parent background still shows through */}
      <motion.div
        className="pointer-events-none absolute -inset-[15%] opacity-45 dark:opacity-40"
        style={{
          background:
            'radial-gradient(circle at 22% 26%, rgba(244, 114, 182, 0.24) 0%, transparent 44%), radial-gradient(circle at 82% 24%, rgba(96, 165, 250, 0.22) 0%, transparent 42%), radial-gradient(circle at 50% 82%, rgba(167, 139, 250, 0.2) 0%, transparent 48%)',
          filter: 'blur(72px)',
        }}
        animate={{ x: ['-1.5%', '1.5%', '-1.5%'], y: ['0%', '0.8%', '0%'] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />

      {/* Light focus veil */}
      <div
        className="pointer-events-none absolute inset-0 backdrop-blur-[1.5px] bg-white/8 dark:bg-black/18"
        aria-hidden
      />

      {/* Subtle corner fade only; avoid heavy bars */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] shadow-[inset_0_0_70px_rgba(71,85,105,0.1)] dark:shadow-[inset_0_0_90px_rgba(0,0,0,0.36)]"
        aria-hidden
      />

      {/* Stage floor glow */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 h-[42%] w-[min(120%,900px)] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center_bottom,rgba(165,180,252,0.2)_0%,transparent_68%)] dark:bg-[radial-gradient(ellipse_at_center_bottom,rgba(139,92,246,0.24)_0%,transparent_70%)]"
        aria-hidden
      />

      {/* # Reason: Educational chips appear only after mascot entrance settles,
          adding an engagement beat without disturbing the existing arrival motion. */}
      <div className="pointer-events-none absolute inset-0 z-[9]" aria-hidden>
        {activeLearningSparks.map((spark) => (
          <motion.div
            key={`${spark.kind}-${spark.text}-${spark.className}`}
            className={cn(
              'absolute rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide shadow-[0_8px_26px_-16px_rgba(30,41,59,0.42)] backdrop-blur-sm md:text-sm',
              spark.className,
              KIND_STYLES[spark.kind],
            )}
            initial={{ opacity: 0, scale: 0.68, y: 8 }}
            animate={{
              opacity: [0.2, 0.88, 0.62, 0.94, 0.5],
              scale: [0.88, 1, 0.96, 1.02, 0.95],
              x: spark.driftX,
              y: spark.driftY,
              rotate: spark.rotate,
            }}
            transition={{
              duration: spark.duration,
              delay: spark.delay,
              repeat: Infinity,
              ease: 'easeInOut',
              times: [0, 0.22, 0.5, 0.78, 1],
            }}
          >
            {spark.text}
          </motion.div>
        ))}

        {activeMiniSparks.map((spark) => (
          <motion.span
            key={`${spark.text}-${spark.className}`}
            className={cn(
              'absolute rounded-full border border-white/60 bg-white/58 px-2 py-0.5 text-[11px] font-bold tracking-wide text-violet-700 shadow-[0_8px_22px_-16px_rgba(30,41,59,0.6)] backdrop-blur-sm dark:border-white/20 dark:bg-zinc-900/55 dark:text-violet-200',
              spark.className,
            )}
            initial={{ opacity: 0, y: 8, scale: 0.85 }}
            animate={{
              opacity: [0.12, 0.66, 0.28, 0.74, 0.18],
              y: [0, -6, -12, -7, 0],
              x: [0, 2, -3, 2, 0],
              scale: [0.9, 1, 0.95, 1.02, 0.92],
            }}
            transition={{
              duration: spark.duration,
              delay: spark.delay,
              repeat: Infinity,
              ease: 'easeInOut',
              times: [0, 0.24, 0.5, 0.76, 1],
            }}
          >
            {spark.text}
          </motion.span>
        ))}
      </div>

      {/* Characters — sharp foreground “actors” */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-end pb-[10vh] pt-16 md:pb-[14vh]">
        <div
          className="flex w-full max-w-4xl items-end justify-center gap-2 px-4 sm:gap-4 md:gap-8"
          aria-hidden
        >
          {CAST.map((c) => (
            <motion.div
              key={c.src}
              className="relative flex shrink-0 flex-col items-center origin-bottom will-change-transform drop-shadow-[0_10px_22px_rgba(51,65,85,0.18)] dark:drop-shadow-[0_14px_34px_rgba(0,0,0,0.42)]"
              initial={{ opacity: 0, x: c.enterX, y: c.enterY, scale: 0.78, rotate: -8 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
              transition={{
                duration: 1.1,
                delay: c.delay,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <motion.div
                className="origin-bottom will-change-transform"
                animate={{ y: c.y, x: c.x, rotate: c.rotate, scale: c.scale }}
                transition={{
                  duration: c.duration,
                  repeat: Infinity,
                  ease: [0.44, 0.06, 0.56, 0.94],
                  delay: c.delay + 0.9,
                  times: [0, 0.28, 0.52, 0.76, 1],
                }}
              >
                <Image
                  src={c.src}
                  alt=""
                  width={200}
                  height={240}
                  className={cn('h-auto w-auto select-none', c.className)}
                  priority
                />
              </motion.div>
            </motion.div>
          ))}
        </div>

        {/* Caption card — frosted like a clapper subtitle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.45, ease: 'easeOut' }}
          className="relative z-10 mx-4 mt-10 flex max-w-md flex-col items-center gap-2 rounded-2xl border border-white/75 bg-white/72 px-6 py-4 text-center shadow-[0_14px_36px_-18px_rgba(71,85,105,0.26)] backdrop-blur-xl dark:border-white/12 dark:bg-zinc-900/60 dark:shadow-[0_20px_60px_-24px_rgba(0,0,0,0.6)]"
        >
          <Loader2 className="size-7 shrink-0 animate-spin text-violet-600 dark:text-violet-400" aria-hidden />
          <p className="text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
            {t('stage.classroomLoadingTitle')}
          </p>
          <p className="text-sm leading-snug text-zinc-600 dark:text-zinc-400">
            {t('stage.classroomLoadingSubtitle')}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
