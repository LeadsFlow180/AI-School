'use client';

import { editSlideItemClass, editSlideOrderBadge } from '@/lib/classroom/edit-canvas-styles';
import { cn } from '@/lib/utils';

export interface EditCanvasSlideButtonProps {
  readonly order: number;
  readonly title: string;
  readonly isActive: boolean;
  readonly layout: 'horizontal' | 'vertical';
  readonly onSelect: () => void;
}

export function EditCanvasSlideButton({
  order,
  title,
  isActive,
  layout,
  onSelect,
}: EditCanvasSlideButtonProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex gap-3 text-left',
        layout === 'horizontal' && 'min-h-[88px] min-w-[180px] max-w-[240px] shrink-0 snap-start',
        layout === 'vertical' && 'w-full shrink-0',
        editSlideItemClass(isActive),
      )}
    >
      <span className={editSlideOrderBadge(isActive)}>{order}</span>
      <span className="min-w-0 flex-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Slide
        </span>
        <span
          className={cn(
            'mt-0.5 block overflow-hidden font-medium text-foreground',
            layout === 'horizontal' ? 'line-clamp-2 text-sm leading-snug' : 'line-clamp-2 text-sm leading-normal',
          )}
        >
          {title}
        </span>
      </span>
    </button>
  );
}
