'use client';

import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';

interface ElementDeleteButtonProps {
  readonly elementId: string;
  readonly left: number;
  readonly top: number;
  readonly prominent?: boolean;
}

export function ElementDeleteButton({
  elementId,
  left,
  top,
  prominent = false,
}: ElementDeleteButtonProps) {
  const { deleteElement } = useCanvasOperations();

  return (
    <button
      type="button"
      className={cn(
        'absolute z-[110] flex size-7 items-center justify-center rounded-full border shadow-md transition-all',
        'border-destructive/40 bg-destructive text-white hover:scale-105 hover:bg-destructive/90',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50',
        prominent ? 'opacity-100' : 'opacity-80 hover:opacity-100',
      )}
      style={{ left, top }}
      title="Delete element"
      aria-label="Delete element"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        deleteElement(elementId);
      }}
    >
      <Trash2 className="size-3.5" strokeWidth={2.25} aria-hidden />
    </button>
  );
}
