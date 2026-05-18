import { cn } from '@/lib/utils';

/** Brand-aligned accents (matches --primary ~262° violet). */
export const editAccentGradient = 'bg-gradient-to-r from-violet-600 via-primary to-violet-500';
export const editAccentGradientText = 'bg-gradient-to-r from-violet-700 to-primary bg-clip-text text-transparent';

export const editStudioBackdrop = cn(
  'relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3',
  'lg:flex-row lg:gap-4 lg:p-4',
);

export const editPanel = cn(
  'flex min-h-0 flex-col overflow-hidden rounded-2xl',
  'border border-border/80 bg-card/95',
  'shadow-[0_8px_30px_rgba(0,0,0,0.06)]',
  'ring-1 ring-black/[0.03] dark:ring-white/[0.04]',
  'dark:bg-card/90 dark:shadow-[0_8px_40px_rgba(0,0,0,0.35)]',
);

export const editPanelHeader = cn(
  'flex shrink-0 items-start justify-between gap-2',
  'border-b border-border/60 bg-muted/30 px-4 py-3',
  'dark:bg-muted/15',
);

export const editHeaderShell = cn(
  'relative z-20 shrink-0 border-b border-border/60',
  'bg-card/90 backdrop-blur-xl',
  'dark:bg-card/85',
);

export const editCanvasFrame = cn(
  'relative flex min-h-0 flex-1 flex-col overflow-hidden',
  'bg-[linear-gradient(180deg,hsl(var(--muted)/0.35)_0%,hsl(var(--background))_100%)]',
);

export const editCanvasChromeBar = cn(
  'flex shrink-0 items-center justify-between gap-3',
  'border-b border-border/60 px-4 py-2.5',
  'bg-card/80',
);

export const editToolsScroll = cn(
  'flex min-h-0 flex-1 flex-col overflow-y-auto',
  'p-3 [scrollbar-width:thin]',
);

export const editPanelBody = cn('flex min-h-0 flex-1 flex-col overflow-hidden');

export const editToolRow = cn(
  'flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 text-left',
  'transition-colors hover:border-primary/30 hover:bg-muted/40',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
  'disabled:pointer-events-none disabled:opacity-45',
);

export const editToolRowIcon = cn(
  'flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary',
);

export const editTabsList = cn(
  'grid h-auto w-full grid-cols-4 gap-0.5 rounded-xl border border-border/60 bg-muted/40 p-1',
);

export const editToolbarHistory = cn(
  'grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-muted/30 p-1.5',
);

export const editToolbarSave = cn(
  'h-10 w-full gap-2 rounded-lg font-semibold shadow-sm',
  'bg-primary text-primary-foreground hover:bg-primary/90',
  'focus-visible:ring-primary/30',
  'disabled:opacity-50',
);

export const editGlassPanel = editPanel;

export function editSlideItemClass(isActive: boolean) {
  return cn(
    'group relative w-full overflow-hidden rounded-xl border text-left transition-all duration-200',
    'px-3 py-3',
    isActive
      ? [
          'border-primary/45 bg-primary/[0.06] shadow-md shadow-primary/10',
          'ring-1 ring-primary/20',
          'before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-primary',
        ]
      : [
          'border-border/70 bg-background/60 hover:border-primary/25 hover:bg-background hover:shadow-sm',
        ],
  );
}

export function editSlideOrderBadge(isActive: boolean) {
  return cn(
    'flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums',
    isActive
      ? 'bg-primary text-primary-foreground shadow-sm'
      : 'bg-muted text-muted-foreground group-hover:bg-muted/80',
  );
}
