'use client';

import { type ChangeEvent, type ComponentType, type ReactNode, type RefObject, useState } from 'react';
import {
  AlertCircle,
  AlignCenter,
  AlignLeft,
  AlignStartVertical,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpToLine,
  BadgeAlert,
  Bold,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Highlighter,
  ImagePlus,
  Italic,
  Layers,
  Link2,
  Loader2,
  MessageSquare,
  Minus,
  Plus,
  RefreshCw,
  ScanText,
  Redo2,
  Save,
  Space,
  Sparkles,
  Undo2,
  StickyNote,
  Subtitles,
  Trash2,
  Heading,
  Type,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EditCanvasGuide } from '@/components/classroom/edit-canvas-guide';
import {
  editAccentGradientText,
  editToolbarHistory,
  editToolbarSave,
  editToolsScroll,
} from '@/lib/classroom/edit-canvas-styles';

export interface EditCanvasActionPanelProps {
  readonly onSaveAll: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly canUndoHistory: boolean;
  readonly canRedoHistory: boolean;
  readonly isSavingAll: boolean;
  readonly manualSaveNotice: string | null;
  readonly onDismissManualSaveNotice: () => void;
  readonly onAddTextBox: () => void;
  readonly onGenerateFromNarration: () => void;
  readonly onRebuildScript: () => void;
  readonly rebuildDisabled: boolean;
  readonly onConvertOcr: () => void;
  readonly isConvertingOcr: boolean;
  readonly onFinalizeReplace: () => void | Promise<void>;
  readonly isFinalizing: boolean;
  readonly finalizeSaveNotice: string | null;
  readonly onDismissFinalizeNotice: () => void;
  readonly imageUrlInput: string;
  readonly onImageUrlChange: (value: string) => void;
  readonly onReplaceFromUrl: () => void;
  readonly isReplacingImage: boolean;
  readonly imageUploadInputRef: RefObject<HTMLInputElement | null>;
  readonly onImageFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  readonly onUploadImageClick: () => void;
  readonly onDuplicateSelection: () => void;
  readonly onDeleteSelection: () => void;
  readonly onCenterSelection: () => void;
  readonly onAlignLeft: () => void;
  readonly onAlignTop: () => void;
  readonly onBringToFront: () => void;
  readonly onSendToBack: () => void;
  readonly onDistributeHorizontally: () => void;
  readonly onAddStickyNote: () => void;
  readonly onAddCallout: () => void;
  readonly onAddHighlightBar: () => void;
  readonly onAddTitleBanner: () => void;
  readonly onAddCaption: () => void;
  readonly onAddArrow: () => void;
  readonly onAddImportantBadge: () => void;
  readonly onBoldText: () => void;
  readonly onItalicText: () => void;
  readonly onWidenText: () => void;
  readonly onFlipHorizontal: () => void;
  readonly onFlipVertical: () => void;
  readonly onIncreaseOpacity: () => void;
  readonly onDecreaseOpacity: () => void;
  readonly onClearOverlayTexts: () => void;
  readonly selectionToolsDisabled?: boolean;
}

function ToolSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 px-0.5">
        <span className="h-3 w-0.5 rounded-full bg-gradient-to-b from-indigo-500 to-teal-500" aria-hidden />
        <span className="bg-gradient-to-r from-indigo-700 to-teal-700 bg-clip-text text-[10px] font-bold uppercase tracking-widest text-transparent dark:from-indigo-300 dark:to-teal-300">
          {title}
        </span>
      </h3>
      {children}
    </section>
  );
}

function ToolTile({
  icon: Icon,
  label,
  onClick,
  disabled,
  pending,
  variant = 'default',
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  variant?: 'default' | 'primary' | 'accent';
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40',
        'disabled:pointer-events-none disabled:opacity-45',
        'hover:-translate-y-0.5 hover:shadow-md active:translate-y-0',
        variant === 'primary' &&
          'border-indigo-400/35 bg-gradient-to-b from-indigo-500/12 to-indigo-500/5 hover:from-indigo-500/18 dark:border-indigo-500/40 dark:from-indigo-500/20',
        variant === 'accent' &&
          'border-violet-400/30 bg-gradient-to-b from-violet-500/10 to-violet-500/5 hover:from-violet-500/15 dark:border-violet-500/35',
        variant === 'default' &&
          'border-white/80 bg-white/70 shadow-sm hover:border-indigo-200/70 hover:bg-white dark:border-slate-600/50 dark:bg-slate-800/35',
      )}
    >
      <span
        className={cn(
          'flex size-7 items-center justify-center rounded-md',
          variant === 'primary' && 'bg-primary/15 text-primary',
          variant === 'accent' && 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
          variant === 'default' && 'bg-muted/55 text-muted-foreground',
        )}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Icon className="size-3.5" aria-hidden />
        )}
      </span>
      <span className="text-[10px] font-medium leading-tight text-foreground">{label}</span>
    </button>
  );
}

export function EditCanvasActionPanel({
  onSaveAll,
  onUndo,
  onRedo,
  canUndoHistory,
  canRedoHistory,
  isSavingAll,
  manualSaveNotice,
  onDismissManualSaveNotice,
  onAddTextBox,
  onGenerateFromNarration,
  onRebuildScript,
  rebuildDisabled,
  onConvertOcr,
  isConvertingOcr,
  onFinalizeReplace,
  isFinalizing,
  finalizeSaveNotice,
  onDismissFinalizeNotice,
  imageUrlInput,
  onImageUrlChange,
  onReplaceFromUrl,
  isReplacingImage,
  imageUploadInputRef,
  onImageFileChange,
  onUploadImageClick,
  onDuplicateSelection,
  onDeleteSelection,
  onCenterSelection,
  onAlignLeft,
  onAlignTop,
  onBringToFront,
  onSendToBack,
  onDistributeHorizontally,
  onAddStickyNote,
  onAddCallout,
  onAddHighlightBar,
  onAddTitleBanner,
  onAddCaption,
  onAddArrow,
  onAddImportantBadge,
  onBoldText,
  onItalicText,
  onWidenText,
  onFlipHorizontal,
  onFlipVertical,
  onIncreaseOpacity,
  onDecreaseOpacity,
  onClearOverlayTexts,
  selectionToolsDisabled = false,
}: EditCanvasActionPanelProps) {
  const blockAll = isFinalizing || isConvertingOcr || isReplacingImage || isSavingAll;
  const blockSelection = blockAll || selectionToolsDisabled;
  const [imageSectionOpen, setImageSectionOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative shrink-0 space-y-3 overflow-hidden border-b border-white/50 bg-gradient-to-br from-indigo-600/[0.08] via-white/50 to-teal-600/[0.08] px-3 py-3.5 dark:border-slate-700/50 dark:from-indigo-600/15 dark:via-slate-900/40 dark:to-teal-600/10 sm:px-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className={cn('text-sm font-semibold tracking-tight', editAccentGradientText)}>Slide tools</h2>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
              Overlays from sidebar · <span className="whitespace-nowrap">Ctrl+Z undo</span>
            </p>
          </div>
          <EditCanvasGuide />
        </div>

        <div className="flex flex-col gap-2">
          <div className={editToolbarHistory}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 bg-background/80 text-xs font-medium"
              disabled={blockAll || !canUndoHistory}
              onClick={onUndo}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="size-3.5 shrink-0" aria-hidden />
              Undo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 bg-background/80 text-xs font-medium"
              disabled={blockAll || !canRedoHistory}
              onClick={onRedo}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="size-3.5 shrink-0" aria-hidden />
              Redo
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            className={editToolbarSave}
            disabled={blockAll}
            onClick={onSaveAll}
          >
            {isSavingAll ? (
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4 shrink-0" aria-hidden />
            )}
            {isSavingAll ? 'Saving…' : 'Save changes'}
          </Button>
        </div>

        {manualSaveNotice && (
          <div
            className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-2.5 py-1.5 dark:bg-emerald-500/10"
            role="status"
          >
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">{manualSaveNotice}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px]"
              onClick={onDismissManualSaveNotice}
            >
              OK
            </Button>
          </div>
        )}
      </div>

      <div className={editToolsScroll}>
        {isFinalizing && (
          <div
            className="flex shrink-0 items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
            <p className="text-xs font-medium text-foreground">Finalizing and saving…</p>
          </div>
        )}

        {finalizeSaveNotice && !isFinalizing && (
          <div
            className="flex shrink-0 items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2 dark:bg-emerald-500/10"
            role="status"
          >
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{finalizeSaveNotice}</p>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onDismissFinalizeNotice}>
              OK
            </Button>
          </div>
        )}

        <ToolSection title={'Narration & text'}>
          <div className="grid grid-cols-2 gap-2">
            <ToolTile icon={Type} label="Add text box" onClick={onAddTextBox} disabled={blockAll} />
            <ToolTile
              icon={Sparkles}
              label="From narration"
              onClick={onGenerateFromNarration}
              disabled={blockAll}
              variant="accent"
            />
            <ToolTile
              icon={RefreshCw}
              label="Rebuild script"
              onClick={onRebuildScript}
              disabled={blockAll || rebuildDisabled}
            />
            <ToolTile
              icon={ScanText}
              label={isConvertingOcr ? 'OCR…' : 'Image to text'}
              onClick={onConvertOcr}
              disabled={blockAll}
              pending={isConvertingOcr}
            />
            <div className="col-span-2">
              <ToolTile
                icon={Layers}
                label={isFinalizing ? 'Finalizing…' : 'Finalize replace'}
                onClick={() => void onFinalizeReplace()}
                disabled={blockAll}
                pending={isFinalizing}
                variant="primary"
              />
            </div>
          </div>
        </ToolSection>

        <ToolSection title="Insert overlays">
          <div className="grid grid-cols-2 gap-2">
            <ToolTile icon={StickyNote} label="Sticky note" onClick={onAddStickyNote} disabled={blockAll} variant="accent" />
            <ToolTile icon={MessageSquare} label="Callout" onClick={onAddCallout} disabled={blockAll} variant="accent" />
            <ToolTile icon={Highlighter} label="Highlight" onClick={onAddHighlightBar} disabled={blockAll} />
            <ToolTile icon={Heading} label="Title bar" onClick={onAddTitleBanner} disabled={blockAll} />
            <ToolTile icon={Subtitles} label="Caption" onClick={onAddCaption} disabled={blockAll} />
            <ToolTile icon={ArrowRight} label="Arrow" onClick={onAddArrow} disabled={blockAll} />
            <ToolTile icon={BadgeAlert} label="Important" onClick={onAddImportantBadge} disabled={blockAll} />
          </div>
        </ToolSection>

        <ToolSection title={'Arrange & style'}>
          <div className="grid grid-cols-2 gap-2">
            <ToolTile icon={Copy} label="Duplicate" onClick={onDuplicateSelection} disabled={blockSelection} />
            <ToolTile icon={Trash2} label="Delete" onClick={onDeleteSelection} disabled={blockSelection} />
            <ToolTile icon={AlignCenter} label="Center" onClick={onCenterSelection} disabled={blockSelection} />
            <ToolTile icon={AlignLeft} label="Align left" onClick={onAlignLeft} disabled={blockSelection} />
            <ToolTile icon={AlignStartVertical} label="Align top" onClick={onAlignTop} disabled={blockSelection} />
            <ToolTile icon={Space} label="Space out" onClick={onDistributeHorizontally} disabled={blockSelection} />
            <ToolTile icon={ArrowUpToLine} label="To front" onClick={onBringToFront} disabled={blockSelection} />
            <ToolTile icon={ArrowDownToLine} label="To back" onClick={onSendToBack} disabled={blockSelection} />
            <ToolTile icon={FlipHorizontal2} label="Flip H" onClick={onFlipHorizontal} disabled={blockSelection} />
            <ToolTile icon={FlipVertical2} label="Flip V" onClick={onFlipVertical} disabled={blockSelection} />
            <ToolTile icon={Bold} label="Bold" onClick={onBoldText} disabled={blockAll} />
            <ToolTile icon={Italic} label="Italic" onClick={onItalicText} disabled={blockAll} />
            <ToolTile icon={Type} label="Full width" onClick={onWidenText} disabled={blockAll} />
            <ToolTile icon={Plus} label="More opaque" onClick={onIncreaseOpacity} disabled={blockSelection} />
            <ToolTile icon={Minus} label="Softer" onClick={onDecreaseOpacity} disabled={blockSelection} />
            <div className="col-span-2">
              <ToolTile icon={Eraser} label="Clear all overlays" onClick={onClearOverlayTexts} disabled={blockAll} />
            </div>
          </div>
          <p className="px-0.5 text-[10px] leading-snug text-muted-foreground">
            Select a sidebar-added element on the canvas for arrange, delete, and layer tools.
          </p>
        </ToolSection>

        <Collapsible open={imageSectionOpen} onOpenChange={setImageSectionOpen} className="shrink-0">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-indigo-200/40 bg-gradient-to-r from-white/80 to-indigo-50/40 px-3 py-2.5 text-left shadow-sm transition-all hover:border-indigo-300/50 hover:shadow-md dark:border-indigo-500/25 dark:from-slate-900/80 dark:to-indigo-950/30"
            >
              <span className="flex min-w-0 items-center gap-2">
                <ImagePlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-xs font-semibold text-foreground">Replace slide image</span>
              </span>
              <ChevronDown
                className={cn('size-4 shrink-0 text-muted-foreground transition-transform', imageSectionOpen && 'rotate-180')}
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="space-y-2 rounded-lg border border-border/50 bg-muted/10 p-3 dark:bg-muted/5">
              <Input
                type="url"
                value={imageUrlInput}
                onChange={(e) => onImageUrlChange(e.target.value)}
                placeholder="https://…"
                disabled={isReplacingImage || isFinalizing}
                className="h-9 bg-background/80 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 px-2 text-xs font-medium"
                  disabled={isReplacingImage || !imageUrlInput.trim() || isFinalizing || isConvertingOcr}
                  onClick={onReplaceFromUrl}
                >
                  {isReplacingImage ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5 opacity-70" />}
                  URL
                </Button>
                <input ref={imageUploadInputRef} type="file" accept="image/*" className="hidden" onChange={onImageFileChange} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 px-2 text-xs font-medium"
                  disabled={isReplacingImage || isFinalizing || isConvertingOcr}
                  onClick={onUploadImageClick}
                >
                  {isReplacingImage ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5 opacity-70" />}
                  Upload
                </Button>
              </div>
              <p className="flex gap-1.5 text-[10px] leading-snug text-muted-foreground">
                <AlertCircle className="mt-0.5 size-3 shrink-0 opacity-80" aria-hidden />
                <span>Select an image on the canvas first. Remote URLs are inlined when possible.</span>
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
