'use client';

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useClassroomProgressDisplay } from '@/lib/hooks/use-classroom-progress-display';

type Variant = 'sidebar' | 'header' | 'toolbar';

function fillTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, value),
    template,
  );
}

export function ClassroomProgressIndicator({
  playbackCompleted,
  variant = 'sidebar',
  className,
}: {
  playbackCompleted: boolean;
  variant?: Variant;
  className?: string;
}) {
  const { t } = useI18n();
  const display = useClassroomProgressDisplay(playbackCompleted);

  if (!display) return null;

  const { currentSlide, totalSlides, percentDone, slidesDone, sessionComplete, ladderStepLabel } =
    display;

  if (variant === 'toolbar') {
    return (
      <div className={cn('flex flex-col gap-0.5 min-w-[3.5rem]', className)}>
        <span className="text-[10px] font-semibold tabular-nums text-violet-700 dark:text-violet-300">
          {percentDone}%
        </span>
        <Progress
          value={percentDone}
          className="h-1 w-14 bg-violet-100 dark:bg-violet-950 [&_[data-slot=progress-indicator]]:bg-violet-500"
        />
      </div>
    );
  }

  if (variant === 'header') {
    return (
      <div
        className={cn(
          'hidden md:flex flex-col gap-1 min-w-[140px] max-w-[200px] shrink-0',
          className,
        )}
        data-testid="classroom-progress-header"
      >
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
          <span className="tabular-nums">
            {fillTemplate(t('stage.classroomProgressSlides'), {
              current: String(currentSlide),
              total: String(totalSlides),
            })}
          </span>
          <span className="tabular-nums text-violet-600 dark:text-violet-400">
            {sessionComplete
              ? t('stage.classroomProgressComplete')
              : fillTemplate(t('stage.classroomProgressPercent'), {
                  percent: String(percentDone),
                })}
          </span>
        </div>
        <Progress
          value={percentDone}
          className="h-1.5 bg-violet-100 dark:bg-violet-950/80 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-violet-500 [&_[data-slot=progress-indicator]]:to-indigo-500"
        />
        {ladderStepLabel ? (
          <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
            {fillTemplate(t('stage.classroomProgressLadder'), { step: ladderStepLabel })}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'mx-2 mb-2 rounded-xl border border-violet-200/80 bg-white/90 px-3 py-2.5 shadow-sm',
        'dark:border-violet-900/50 dark:bg-slate-900/80',
        className,
      )}
      data-testid="classroom-progress-sidebar"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
          {t('stage.classroomProgressTitle')}
        </span>
        <span className="text-xs font-bold tabular-nums text-violet-600 dark:text-violet-400">
          {sessionComplete
            ? t('stage.classroomProgressComplete')
            : fillTemplate(t('stage.classroomProgressPercent'), {
                percent: String(percentDone),
              })}
        </span>
      </div>
      <Progress
        value={percentDone}
        className="h-2 mb-2 bg-violet-100/90 dark:bg-violet-950/60 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-violet-500 [&_[data-slot=progress-indicator]]:to-sky-500"
      />
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
        {fillTemplate(t('stage.classroomProgressSlides'), {
          current: String(currentSlide),
          total: String(totalSlides),
        })}
        {!sessionComplete && slidesDone > 0 ? (
          <span className="font-normal text-slate-500 dark:text-slate-400">
            {' '}
            ·{' '}
            {fillTemplate(t('stage.classroomProgressDoneCount'), {
              done: String(slidesDone),
            })}
          </span>
        ) : null}
      </p>
      {ladderStepLabel ? (
        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
          {fillTemplate(t('stage.classroomProgressLadder'), { step: ladderStepLabel })}
        </p>
      ) : null}
    </div>
  );
}
