'use client';

import { type ReactNode } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from 'lucide-react';
import emitter, { EmitterEvents, type RichTextAction } from '@/lib/utils/emitter';
import { cn } from '@/lib/utils';

/** Preset text colors — ProseMirror `forecolor` via `color` command */
export const TEXT_COLOR_SWATCHES = [
  '#0f172a',
  '#64748b',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ffffff',
] as const;

/** Highlight presets — `backcolor` mark */
export const HIGHLIGHT_SWATCHES = ['#fef9c3', '#e9d5ff', '#bae6fd'] as const;

export function hexForColorInput(raw: string | undefined): string {
  const s = (raw || '#111827').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1]!,
      g = s[2]!,
      b = s[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return '#111827';
}

export function emitSlideTextColor(elementId: string, hex: string) {
  emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, {
    target: elementId,
    action: { command: 'color', value: hex },
  });
}

export function emitSlideRichText(elementId: string, action: RichTextAction) {
  emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { target: elementId, action });
}

const iconSm = 'h-3.5 w-3.5';

function RichToolBtn({
  title,
  onPress,
  children,
}: {
  title: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded px-1 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      }}
    >
      {children}
    </button>
  );
}

export interface SlideTextRichToolbarProps {
  readonly elementId: string;
  readonly defaultColor?: string;
  /** Sidebar / panel: no absolute overlay; full width for narrow column. */
  readonly embedded?: boolean;
  readonly className?: string;
}

/**
 * Rich text controls for slide canvas text (and shape text). Uses the same
 * `RICH_TEXT_COMMAND` emitter path as `ProsemirrorEditor`.
 */
export function SlideTextRichToolbar({
  elementId,
  defaultColor,
  embedded = false,
  className,
}: SlideTextRichToolbarProps) {
  const wrap = cn(
    'flex flex-col gap-1 rounded-md border border-slate-300/80 bg-white/95 px-1.5 py-1 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/90',
    embedded
      ? 'relative z-10 w-full max-w-none'
      : 'absolute top-1 left-1/2 z-[120] max-w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2',
    className,
  );

  return (
    <div className={wrap} onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-center gap-0.5">
        <RichToolBtn title="Bold" onPress={() => emitSlideRichText(elementId, { command: 'bold' })}>
          <Bold className={iconSm} strokeWidth={2.5} />
        </RichToolBtn>
        <RichToolBtn title="Italic" onPress={() => emitSlideRichText(elementId, { command: 'em' })}>
          <Italic className={iconSm} strokeWidth={2.25} />
        </RichToolBtn>
        <RichToolBtn
          title="Underline"
          onPress={() => emitSlideRichText(elementId, { command: 'underline' })}
        >
          <Underline className={iconSm} strokeWidth={2.25} />
        </RichToolBtn>
        <RichToolBtn
          title="Strikethrough"
          onPress={() => emitSlideRichText(elementId, { command: 'strikethrough' })}
        >
          <Strikethrough className={iconSm} strokeWidth={2.25} />
        </RichToolBtn>
        <div
          className="mx-0.5 hidden h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-600 sm:block"
          aria-hidden
        />
        <RichToolBtn
          title="Align left"
          onPress={() => emitSlideRichText(elementId, { command: 'align', value: 'left' })}
        >
          <AlignLeft className={iconSm} />
        </RichToolBtn>
        <RichToolBtn
          title="Align center"
          onPress={() => emitSlideRichText(elementId, { command: 'align', value: 'center' })}
        >
          <AlignCenter className={iconSm} />
        </RichToolBtn>
        <RichToolBtn
          title="Align right"
          onPress={() => emitSlideRichText(elementId, { command: 'align', value: 'right' })}
        >
          <AlignRight className={iconSm} />
        </RichToolBtn>
        <div
          className="mx-0.5 hidden h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-600 sm:block"
          aria-hidden
        />
        <RichToolBtn
          title="Bullet list"
          onPress={() => emitSlideRichText(elementId, { command: 'bulletList', value: '' })}
        >
          <List className={iconSm} />
        </RichToolBtn>
        <RichToolBtn
          title="Numbered list"
          onPress={() => emitSlideRichText(elementId, { command: 'orderedList', value: '' })}
        >
          <ListOrdered className={iconSm} />
        </RichToolBtn>
        <RichToolBtn
          title="Increase indent"
          onPress={() => emitSlideRichText(elementId, { command: 'indent', value: '1' })}
        >
          <IndentIncrease className={iconSm} />
        </RichToolBtn>
        <RichToolBtn
          title="Decrease indent"
          onPress={() => emitSlideRichText(elementId, { command: 'indent', value: '-1' })}
        >
          <IndentDecrease className={iconSm} />
        </RichToolBtn>
        <div
          className="mx-0.5 hidden h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-600 sm:block"
          aria-hidden
        />
        <RichToolBtn
          title="Superscript"
          onPress={() => emitSlideRichText(elementId, { command: 'superscript' })}
        >
          <Superscript className={iconSm} />
        </RichToolBtn>
        <RichToolBtn
          title="Subscript"
          onPress={() => emitSlideRichText(elementId, { command: 'subscript' })}
        >
          <Subscript className={iconSm} />
        </RichToolBtn>
        {HIGHLIGHT_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            className="h-5 w-5 shrink-0 rounded border border-black/10 shadow-sm transition-transform hover:scale-110 active:scale-95 dark:border-white/15"
            style={{ backgroundColor: hex }}
            title={`Highlight ${hex}`}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              emitSlideRichText(elementId, { command: 'backcolor', value: hex });
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1 border-t border-slate-200/70 pt-1 dark:border-slate-600/60">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="h-6 min-w-6 rounded px-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              emitSlideRichText(elementId, { command: 'fontsize-reduce', value: '2' });
            }}
            title="Shrink text"
          >
            A-
          </button>
          <button
            type="button"
            className="h-6 min-w-6 rounded px-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              emitSlideRichText(elementId, { command: 'fontsize-add', value: '2' });
            }}
            title="Expand text"
          >
            A+
          </button>
        </div>
        <div className="h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-600" aria-hidden />
        <div className="flex flex-wrap items-center justify-center gap-0.5">
          {TEXT_COLOR_SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              className={cn(
                'h-4 w-4 shrink-0 rounded-full border border-black/10 shadow-sm transition-transform hover:scale-110 active:scale-95 dark:border-white/15',
                hex.toLowerCase() === '#ffffff' &&
                  'ring-1 ring-inset ring-slate-300 dark:ring-slate-500',
              )}
              style={{ backgroundColor: hex }}
              title={`Text color ${hex}`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                emitSlideTextColor(elementId, hex);
              }}
            />
          ))}
          <label
            className="relative flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-slate-400 bg-slate-50 hover:bg-slate-100 dark:border-slate-500 dark:bg-slate-800 dark:hover:bg-slate-700"
            title="Custom text color"
          >
            <input
              key={elementId}
              type="color"
              defaultValue={hexForColorInput(defaultColor)}
              className="absolute inset-0 h-[200%] w-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer opacity-0"
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => emitSlideTextColor(elementId, e.target.value)}
            />
            <span className="pointer-events-none text-[9px] font-bold leading-none text-slate-500 dark:text-slate-400">
              +
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
