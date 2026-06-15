'use client';

import type { ComponentType, ReactNode } from 'react';
import {
  BookOpen,
  Layers,
  MousePointer2,
  PanelRight,
  Redo2,
  Save,
  Shield,
  Undo2,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

function ZoneCard({
  label,
  title,
  description,
  className,
}: {
  label: string;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-indigo-200/40 bg-gradient-to-br from-indigo-500/8 to-teal-500/8 p-3 dark:border-indigo-500/25 dark:from-indigo-500/15 dark:to-teal-500/10',
        className,
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/50 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((step, i) => (
        <li key={step} className="flex gap-3 text-sm text-muted-foreground">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {i + 1}
          </span>
          <span className="pt-0.5 leading-snug">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function ToolRow({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/40 py-2 last:border-0 last:pb-0 sm:flex-row sm:gap-4">
      <span className="shrink-0 text-sm font-medium text-foreground sm:w-36">{name}</span>
      <span className="text-sm text-muted-foreground">{detail}</span>
    </div>
  );
}

/** Opens a full editor guide in a dialog — keeps the tools sidebar uncluttered. */
export function EditCanvasGuide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 border-indigo-300/40 bg-gradient-to-r from-indigo-500/10 to-teal-500/10 px-2.5 text-xs font-medium text-indigo-800 hover:from-indigo-500/15 hover:to-teal-500/15 dark:border-indigo-500/30 dark:text-indigo-200"
        >
          <BookOpen className="size-3.5 text-primary" aria-hidden />
          Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(90vh,720px)] max-w-[min(92vw,42rem)] flex-col gap-0 overflow-hidden border-white/60 p-0 shadow-2xl sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-indigo-200/30 bg-gradient-to-r from-indigo-500/10 via-white to-teal-500/10 px-5 py-4 pr-12 text-left dark:border-indigo-500/20 dark:from-indigo-500/15 dark:via-slate-900 dark:to-teal-500/10">
          <DialogTitle className="bg-gradient-to-r from-indigo-700 to-teal-700 bg-clip-text text-lg font-semibold tracking-tight text-transparent dark:from-indigo-300 dark:to-teal-300">
            How to use this editor
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Add overlays on slides, arrange what you added from the sidebar, then save or finalize when ready.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <ZoneCard
              label="Left"
              title="Slides"
              description="Pick a slide. Text formatting appears here when you select text."
            />
            <ZoneCard
              label="Center"
              title="Canvas"
              description="Select, drag, and resize sidebar-added elements."
            />
            <ZoneCard
              label="Right"
              title="Slide tools"
              description="Add overlays, arrange, replace image, undo, and save."
            />
          </div>

          <SectionCard icon={Wand2} title="Quick start">
            <StepList
              steps={[
                'Choose a slide from the list on the left.',
                'Add overlays from Slide tools (text box, sticky note, callout, etc.).',
                'Click an overlay on the canvas — move, resize, or use Arrange & style.',
                'Click Save when you are done. Use Undo (Ctrl+Z) if you need to step back.',
                'When the slide looks final, use Finalize replace to bake text into the image.',
              ]}
            />
          </SectionCard>

          <SectionCard icon={Shield} title="What you can edit">
            <p>
              Only elements <strong className="font-medium text-foreground">added from Slide tools</strong> show resize
              handles and a red delete control on the canvas.
            </p>
            <p>
              The original slide image and AI-generated content stay protected — you cannot delete or resize them from
              the canvas.
            </p>
          </SectionCard>

          <div className="grid gap-4 sm:grid-cols-2">
            <SectionCard icon={PanelRight} title="Narration & text">
              <ToolRow name="Add text box" detail="Editable text on the slide." />
              <ToolRow name="From narration" detail="Text box from the slide speech script." />
              <ToolRow name="Rebuild script" detail="Refresh AI tutor narration from slide text." />
              <ToolRow name="Image to text" detail="OCR — needs an image on the slide." />
              <ToolRow name="Finalize replace" detail="Merge overlay text into the image and remove text boxes." />
            </SectionCard>

            <SectionCard icon={Layers} title="Overlays & arrange">
              <ToolRow name="Insert overlays" detail="Sticky note, callout, highlight, title, caption, arrow, badge." />
              <ToolRow name="Arrange & style" detail="Select a sidebar-added element first (duplicate, align, layer)." />
              <ToolRow name="Space out" detail="Needs 3+ selected sidebar elements." />
              <ToolRow name="Flip H / V" detail="Shapes and images — not plain text." />
              <ToolRow name="Replace image" detail="Select an image on canvas, then URL or upload." />
            </SectionCard>
          </div>

          <SectionCard icon={Undo2} title="Undo, redo & save">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-xs font-medium">
                <Undo2 className="size-3.5 opacity-70" /> Ctrl+Z
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-xs font-medium">
                <Redo2 className="size-3.5 opacity-70" /> Ctrl+Y
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-xs font-medium">
                <Save className="size-3.5 opacity-70" /> Save
              </span>
            </div>
            <p className="mt-2">
              Undo covers up to ~20 steps in this session and restores the{' '}
              <strong className="text-foreground">whole classroom</strong>, not just the current slide. To discard
              everything since you opened the editor, leave without saving or re-open the classroom.
            </p>
          </SectionCard>

          <SectionCard icon={MousePointer2} title="Tips">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Tool edits auto-save after a short delay; click Save after canvas drag or resize.</li>
              <li>Admin access is required for this editor.</li>
              <li>Some Gamma-generated classrooms may not show Edit in Canvas.</li>
            </ul>
          </SectionCard>
        </div>
      </DialogContent>
    </Dialog>
  );
}
