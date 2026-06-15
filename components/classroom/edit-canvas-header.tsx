'use client';

import { ArrowLeft, Keyboard, Shield, Sparkles } from 'lucide-react';
import { editHeaderShell } from '@/lib/classroom/edit-canvas-styles';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface EditCanvasHeaderProps {
  readonly classroomName: string;
  readonly slideCount: number;
  readonly currentSlideOrder: number | null;
  readonly adminRequired: boolean;
  readonly onBack: () => void;
}

export function EditCanvasHeader({
  classroomName,
  slideCount,
  currentSlideOrder,
  adminRequired,
  onBack,
}: EditCanvasHeaderProps) {
  return (
    <header className={cn('px-4 py-3 sm:px-6', editHeaderShell)}>
      <div className="mx-auto flex max-w-[1920px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Button>
          <div className="min-w-0 border-l border-border pl-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-primary" aria-hidden />
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Slide studio</span>
            </div>
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {classroomName || 'Untitled classroom'}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {slideCount > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs">
              <span className="font-semibold text-foreground">
                {currentSlideOrder != null ? `Slide ${currentSlideOrder}` : 'No selection'}
              </span>
              <span className="text-muted-foreground">of {slideCount}</span>
            </div>
          )}
          <div className="hidden items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-[10px] text-muted-foreground sm:inline-flex">
            <Keyboard className="size-3" aria-hidden />
            Ctrl+Z undo · Ctrl+Y redo
          </div>
          {adminRequired && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-200">
              <Shield className="size-3.5" aria-hidden />
              Admin only
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
