'use client';

import { type ChangeEvent, type ComponentType, type RefObject } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ImagePlus,
  Layers,
  Link2,
  Loader2,
  RefreshCw,
  ScanText,
  Sparkles,
  Type,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EditCanvasActionPanelProps {
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
}

function ActionRow({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
  pending,
  emphasis,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  emphasis?: 'primary' | 'default';
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-45',
        emphasis === 'primary'
          ? 'bg-primary/[0.07] hover:bg-primary/[0.11] dark:bg-primary/15 dark:hover:bg-primary/20'
          : 'hover:bg-muted/80 dark:hover:bg-muted/40',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/40 text-muted-foreground shadow-xs',
          'group-hover:border-border group-hover:bg-background/80 dark:bg-muted/25',
          emphasis === 'primary' && 'border-primary/25 bg-primary/10 text-primary dark:border-primary/30',
        )}
      >
        {pending ? (
          <Loader2 className="size-[18px] animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <Icon className="size-[18px]" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-tight text-foreground">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground"
        aria-hidden
      />
    </button>
  );
}

export function EditCanvasActionPanel({
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
}: EditCanvasActionPanelProps) {
  const blockAll = isFinalizing || isConvertingOcr || isReplacingImage;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/60 bg-background/75 shadow-sm backdrop-blur-2xl',
        'dark:border-white/[0.08] dark:bg-zinc-950/55',
      )}
    >
      <div className="border-b border-border/50 bg-muted/20 px-4 py-3 dark:bg-muted/10">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Slide tools</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Text and narration helpers. <span className="font-medium text-foreground/80">Finalize</span> bakes overlays
          into the image and saves.
        </p>
      </div>

      <div className="space-y-2 p-3">
        {isFinalizing && (
          <div
            className="flex gap-3 rounded-xl border border-border bg-muted/40 px-3 py-3 dark:bg-muted/25"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Finalizing replace</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Merging text into the slide image and saving your classroom…
              </p>
            </div>
          </div>
        )}

        {finalizeSaveNotice && !isFinalizing && (
          <div
            className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-3 dark:border-emerald-500/25 dark:bg-emerald-500/10"
            role="status"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Saved</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{finalizeSaveNotice}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 text-xs"
              onClick={onDismissFinalizeNotice}
            >
              OK
            </Button>
          </div>
        )}

        <div className="rounded-xl border border-border/50 bg-muted/15 p-1 dark:bg-muted/10">
          <ActionRow
            icon={Type}
            label="Add live text box"
            hint="New editable layer on this slide"
            onClick={onAddTextBox}
            disabled={blockAll}
          />
          <ActionRow
            icon={Sparkles}
            label="Generate text from narration"
            hint="From slide speech actions"
            onClick={onGenerateFromNarration}
            disabled={blockAll}
          />
          <ActionRow
            icon={RefreshCw}
            label="Rebuild AI tutor script"
            hint="Refresh narration from current slide text"
            onClick={onRebuildScript}
            disabled={blockAll || rebuildDisabled}
          />
          <ActionRow
            icon={ScanText}
            label={isConvertingOcr ? 'Running OCR…' : 'Convert image text to editable'}
            hint="Uses Tesseract on the slide image"
            onClick={onConvertOcr}
            disabled={blockAll}
            pending={isConvertingOcr}
          />
          <ActionRow
            icon={Layers}
            label={isFinalizing ? 'Finalizing…' : 'Finalize replace'}
            hint="Burn text into the image, save, remove overlay boxes"
            onClick={() => void onFinalizeReplace()}
            disabled={blockAll}
            pending={isFinalizing}
            emphasis="primary"
          />
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/10 p-4 dark:bg-muted/5">
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <ImagePlus className="size-4 shrink-0" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wide">Replace slide image</span>
          </div>
          <Input
            type="url"
            value={imageUrlInput}
            onChange={(e) => onImageUrlChange(e.target.value)}
            placeholder="Image URL (https://…)"
            disabled={isReplacingImage || isFinalizing}
            className="h-10 bg-background/80 text-sm"
          />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 w-full gap-2 font-medium"
              disabled={isReplacingImage || !imageUrlInput.trim() || isFinalizing || isConvertingOcr}
              onClick={onReplaceFromUrl}
            >
              {isReplacingImage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Link2 className="size-4 opacity-70" />
              )}
              Replace from URL
            </Button>
            <input ref={imageUploadInputRef} type="file" accept="image/*" className="hidden" onChange={onImageFileChange} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 w-full gap-2 font-medium"
              disabled={isReplacingImage || isFinalizing || isConvertingOcr}
              onClick={onUploadImageClick}
            >
              {isReplacingImage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4 opacity-70" />
              )}
              Upload file
            </Button>
          </div>
          <p className="mt-3 flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0 opacity-80" aria-hidden />
            <span>Select an image on the canvas first (or the first image on the slide). Remote URLs are inlined when possible.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
