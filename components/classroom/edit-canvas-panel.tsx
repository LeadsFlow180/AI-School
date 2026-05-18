'use client';

import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { editPanel, editPanelHeader } from '@/lib/classroom/edit-canvas-styles';

export interface EditCanvasPanelProps {
  readonly title: string;
  readonly description?: string;
  readonly icon?: ComponentType<{ className?: string }>;
  readonly headerAction?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}

export function EditCanvasPanel({
  title,
  description,
  icon: Icon,
  headerAction,
  className,
  children,
}: EditCanvasPanelProps) {
  return (
    <section className={cn(editPanel, className)}>
      <header className={editPanelHeader}>
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0 pt-0.5">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {headerAction}
      </header>
      {children}
    </section>
  );
}
