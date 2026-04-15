'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

type TourStep = {
  id: string;
  title: string;
  description: string;
  selector: string;
  fallback: {
    topPct: number;
    leftPct: number;
    widthPct: number;
    heightPct: number;
    borderRadius?: string;
  };
  padding?: number;
  cardPosition:
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right'
    | 'top-center'
    | 'bottom-center';
};

type SpotlightRect = {
  top: string;
  left: string;
  width: string;
  height: string;
  borderRadius: string;
};

const STEPS: TourStep[] = [
  {
    id: 'sidebar',
    title: 'Scene List',
    description: 'Use this panel to switch scenes quickly and keep your lesson organized.',
    selector: '[data-tour="sidebar"]',
    fallback: { topPct: 9, leftPct: 0.8, widthPct: 17.5, heightPct: 82, borderRadius: '14px' },
    padding: 4,
    cardPosition: 'bottom-right',
  },
  {
    id: 'header',
    title: 'Lesson Header',
    description: 'This top bar shows your current scene title and important context.',
    selector: '[data-tour="header"]',
    fallback: { topPct: 0.8, leftPct: 19, widthPct: 61, heightPct: 9.5, borderRadius: '14px' },
    padding: 6,
    cardPosition: 'bottom-center',
  },
  {
    id: 'export',
    title: 'Export PPT',
    description:
      'Click this download button to export your lesson as PPT when generation is ready.',
    selector: '[data-tour="export"]',
    fallback: { topPct: 1.8, leftPct: 92, widthPct: 6, heightPct: 8.5, borderRadius: '9999px' },
    padding: 6,
    cardPosition: 'bottom-left',
  },
  {
    id: 'canvas',
    title: 'Main Learning Canvas',
    description:
      'This is where slides and interactive content appear. Students focus here during teaching.',
    selector: '[data-tour="canvas"]',
    fallback: { topPct: 11, leftPct: 19, widthPct: 61, heightPct: 56, borderRadius: '14px' },
    padding: 6,
    cardPosition: 'bottom-center',
  },
  {
    id: 'controls',
    title: 'Talk & Control Area',
    description:
      'Use this lower area for speaking, playback controls, speed, and whiteboard actions.',
    selector: '[data-tour="controls"]',
    fallback: { topPct: 67.5, leftPct: 19, widthPct: 61, heightPct: 31, borderRadius: '18px' },
    padding: 6,
    cardPosition: 'top-center',
  },
  {
    id: 'play-audio',
    title: 'Play / Pause Audio',
    description:
      'Click this button to play or pause the teacher audio for the current slide.',
    selector: '[data-tour="play"]',
    fallback: { topPct: 75.5, leftPct: 45.5, widthPct: 5.5, heightPct: 6.8, borderRadius: '10px' },
    padding: 6,
    cardPosition: 'top-center',
  },
  {
    id: 'speed',
    title: 'Reading Speed',
    description: 'Click here to change how fast the classroom audio reads (for example, 1x, 1.5x).',
    selector: '[data-tour="speed"]',
    fallback: { topPct: 75.5, leftPct: 39, widthPct: 7, heightPct: 6.8, borderRadius: '10px' },
    padding: 6,
    cardPosition: 'top-center',
  },
  {
    id: 'whiteboard',
    title: 'Open Whiteboard',
    description: 'Click this pencil button to open the whiteboard and draw while teaching.',
    selector: '[data-tour="whiteboard"]',
    fallback: { topPct: 75.5, leftPct: 58.8, widthPct: 5.5, heightPct: 6.8, borderRadius: '10px' },
    padding: 6,
    cardPosition: 'top-center',
  },
  {
    id: 'chat',
    title: 'Chat & Notes',
    description:
      'Open this side area for live discussion, notes, and follow-up questions during class.',
    selector: '.tour-chat-panel',
    fallback: { topPct: 9, leftPct: 80, widthPct: 19.2, heightPct: 89, borderRadius: '14px' },
    padding: 4,
    cardPosition: 'bottom-left',
  },
];

const CARD_WIDTH = 380;
const CARD_HEIGHT = 228;
const EDGE_MARGIN = 16;
const GAP = 14;

function cssToPx(value: string, axisSize: number) {
  if (value.endsWith('%')) return (parseFloat(value) / 100) * axisSize;
  return parseFloat(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function fallbackCardPosition(position: TourStep['cardPosition'], vw: number, vh: number) {
  const maxLeft = vw - CARD_WIDTH - EDGE_MARGIN;
  const maxTop = vh - CARD_HEIGHT - EDGE_MARGIN;
  switch (position) {
    case 'top-left':
      return { left: EDGE_MARGIN, top: EDGE_MARGIN };
    case 'top-right':
      return { left: maxLeft, top: EDGE_MARGIN };
    case 'bottom-left':
      return { left: EDGE_MARGIN, top: maxTop };
    case 'bottom-right':
      return { left: maxLeft, top: maxTop };
    case 'top-center':
      return { left: clamp(vw / 2 - CARD_WIDTH / 2, EDGE_MARGIN, maxLeft), top: EDGE_MARGIN };
    case 'bottom-center':
    default:
      return { left: clamp(vw / 2 - CARD_WIDTH / 2, EDGE_MARGIN, maxLeft), top: maxTop };
  }
}

function getSmartCardStyle(rect: SpotlightRect, fallbackPosition: TourStep['cardPosition']) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const left = cssToPx(rect.left, vw);
  const top = cssToPx(rect.top, vh);
  const width = cssToPx(rect.width, vw);
  const height = cssToPx(rect.height, vh);

  const spaces = {
    left,
    right: vw - (left + width),
    top,
    bottom: vh - (top + height),
  };

  const maxLeft = vw - CARD_WIDTH - EDGE_MARGIN;
  const maxTop = vh - CARD_HEIGHT - EDGE_MARGIN;

  if (spaces.right >= CARD_WIDTH + GAP) {
    return {
      left: clamp(left + width + GAP, EDGE_MARGIN, maxLeft),
      top: clamp(top + height / 2 - CARD_HEIGHT / 2, EDGE_MARGIN, maxTop),
    };
  }

  if (spaces.left >= CARD_WIDTH + GAP) {
    return {
      left: clamp(left - CARD_WIDTH - GAP, EDGE_MARGIN, maxLeft),
      top: clamp(top + height / 2 - CARD_HEIGHT / 2, EDGE_MARGIN, maxTop),
    };
  }

  if (spaces.bottom >= CARD_HEIGHT + GAP) {
    return {
      left: clamp(left + width / 2 - CARD_WIDTH / 2, EDGE_MARGIN, maxLeft),
      top: clamp(top + height + GAP, EDGE_MARGIN, maxTop),
    };
  }

  if (spaces.top >= CARD_HEIGHT + GAP) {
    return {
      left: clamp(left + width / 2 - CARD_WIDTH / 2, EDGE_MARGIN, maxLeft),
      top: clamp(top - CARD_HEIGHT - GAP, EDGE_MARGIN, maxTop),
    };
  }

  return fallbackCardPosition(fallbackPosition, vw, vh);
}

export function ClassroomTourOverlay({
  open,
  onFinish,
}: {
  open: boolean;
  onFinish: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
  }, [open]);

  const step = useMemo(() => STEPS[stepIndex], [stepIndex]);
  const isLast = stepIndex === STEPS.length - 1;
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect>({
    top: '10%',
    left: '10%',
    width: '40%',
    height: '30%',
    borderRadius: '12px',
  });
  const [cardStyle, setCardStyle] = useState<{ left: number; top: number }>({
    left: EDGE_MARGIN,
    top: EDGE_MARGIN,
  });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFinish();
      if (e.key === 'ArrowRight' && !isLast) setStepIndex((prev) => prev + 1);
      if (e.key === 'ArrowLeft' && stepIndex > 0) setStepIndex((prev) => prev - 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onFinish, isLast, stepIndex]);

  useEffect(() => {
    if (!open) return;

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const applyFallback = () => {
      setSpotlightRect({
        top: `${step.fallback.topPct}%`,
        left: `${step.fallback.leftPct}%`,
        width: `${step.fallback.widthPct}%`,
        height: `${step.fallback.heightPct}%`,
        borderRadius: step.fallback.borderRadius ?? '12px',
      });
    };

    const measure = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el) {
        applyFallback();
        return;
      }
      const r = el.getBoundingClientRect();
      const pad = step.padding ?? 6;
      const margin = 6;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const left = clamp(r.left - pad, margin, vw - margin);
      const top = clamp(r.top - pad, margin, vh - margin);
      const maxWidth = vw - left - margin;
      const maxHeight = vh - top - margin;
      const width = clamp(r.width + pad * 2, 24, maxWidth);
      const height = clamp(r.height + pad * 2, 24, maxHeight);

      setSpotlightRect({
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: step.fallback.borderRadius ?? '12px',
      });
    };

    const raf = requestAnimationFrame(measure);
    const interval = window.setInterval(measure, 450);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(interval);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    // # Reason: Tour should reveal the target area, not explain hidden UI.
    if (step.id === 'sidebar') {
      window.dispatchEvent(new CustomEvent('classroom-tour:open-sidebar'));
    }
    if (
      step.id === 'controls' ||
      step.id === 'play-audio' ||
      step.id === 'speed' ||
      step.id === 'whiteboard'
    ) {
      window.dispatchEvent(new CustomEvent('classroom-tour:open-sidebar'));
    }
    if (step.id === 'chat') {
      window.dispatchEvent(new CustomEvent('classroom-tour:open-chat'));
    }
  }, [open, step.id]);

  useEffect(() => {
    if (!open) return;
    const updateCard = () => {
      setCardStyle(getSmartCardStyle(spotlightRect, step.cardPosition));
    };
    updateCard();
    window.addEventListener('resize', updateCard);
    return () => window.removeEventListener('resize', updateCard);
  }, [open, spotlightRect, step.cardPosition]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] pointer-events-auto">
      {/* Darkened layer with spotlight hole */}
      <div className="absolute inset-0 bg-slate-950/72" />

      {/* Spotlight */}
      <div
        className="absolute border-2 border-violet-300/95 shadow-[0_0_0_9999px_rgba(2,6,23,0.68)] transition-all duration-300 ease-out"
        style={{
          top: spotlightRect.top,
          left: spotlightRect.left,
          width: spotlightRect.width,
          height: spotlightRect.height,
          borderRadius: spotlightRect.borderRadius,
        }}
      />

      {/* Card */}
      <div
        className="absolute z-[121] w-[min(92vw,380px)]"
        style={{
          left: `${cardStyle.left}px`,
          top: `${cardStyle.top}px`,
        }}
      >
        <div className="rounded-2xl border-2 border-violet-200/85 bg-white p-4 shadow-[0_20px_40px_-20px_rgba(30,41,59,0.45)] dark:border-violet-700/65 dark:bg-slate-900">
          <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
            Classroom Tour {stepIndex + 1}/{STEPS.length}
          </p>
          <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
            {step.title}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {step.description}
          </p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onFinish}>
              Skip
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
              >
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (isLast) onFinish();
                  else setStepIndex((prev) => Math.min(STEPS.length - 1, prev + 1));
                }}
              >
                {isLast ? 'Done' : 'Next'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

