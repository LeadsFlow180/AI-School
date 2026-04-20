import { useMemo } from 'react';
import { useCanvasStore } from '@/lib/store';
import type { PPTImageElement } from '@/lib/types/slides';
import type { OperateResizeHandlers } from '@/lib/types/edit';
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';
import { useHistorySnapshot } from '@/lib/hooks/use-history-snapshot';
import { useCommonOperate } from '../hooks/useCommonOperate';
import { RotateHandler } from './RotateHandler';
import { ResizeHandler } from './ResizeHandler';
import { BorderLine } from './BorderLine';

interface ImageElementOperateProps {
  readonly elementInfo: PPTImageElement;
  readonly handlerVisible: boolean;
  readonly rotateElement: (e: React.MouseEvent, element: PPTImageElement) => void;
  readonly scaleElement: (
    e: React.MouseEvent,
    element: PPTImageElement,
    command: OperateResizeHandlers,
  ) => void;
}

export function ImageElementOperate({
  elementInfo,
  handlerVisible,
  rotateElement,
  scaleElement,
}: ImageElementOperateProps) {
  const canvasScale = useCanvasStore.use.canvasScale();
  const clipingImageElementId = useCanvasStore.use.clipingImageElementId();
  const { updateElement } = useCanvasOperations();
  const { addHistorySnapshot } = useHistorySnapshot();

  const isCliping = useMemo(
    () => clipingImageElementId === elementInfo.id,
    [clipingImageElementId, elementInfo.id],
  );

  const scaleWidth = useMemo(
    () => elementInfo.width * canvasScale,
    [elementInfo.width, canvasScale],
  );
  const scaleHeight = useMemo(
    () => elementInfo.height * canvasScale,
    [elementInfo.height, canvasScale],
  );
  const { resizeHandlers, borderLines } = useCommonOperate(scaleWidth, scaleHeight);

  const quickScaleImage = (factor: number) => {
    const minSize = 20;
    const maxSize = 4000;
    const nextWidth = Math.max(minSize, Math.min(maxSize, Math.round(elementInfo.width * factor)));
    const nextHeight = Math.max(minSize, Math.min(maxSize, Math.round(elementInfo.height * factor)));
    const dx = (nextWidth - elementInfo.width) / 2;
    const dy = (nextHeight - elementInfo.height) / 2;

    updateElement({
      id: elementInfo.id,
      props: {
        width: nextWidth,
        height: nextHeight,
        left: elementInfo.left - dx,
        top: elementInfo.top - dy,
      },
    });
    addHistorySnapshot();
  };

  return (
    <div className={`image-element-operate ${isCliping ? 'invisible' : ''}`}>
      {borderLines.map((line) => (
        <BorderLine
          key={line.type}
          type={line.type}
          style={line.style}
          className="operate-border-line"
        />
      ))}
      {handlerVisible && (
        <>
          <div
            className="absolute top-1 left-1/2 z-[120] -translate-x-1/2 flex items-center gap-1 rounded-md border border-slate-300/80 bg-white/95 px-1 py-1 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/90"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="h-6 min-w-6 rounded px-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              onMouseDown={(e) => {
                e.stopPropagation();
                quickScaleImage(0.9);
              }}
              title="Shrink image"
            >
              -
            </button>
            <button
              type="button"
              className="h-6 min-w-6 rounded px-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              onMouseDown={(e) => {
                e.stopPropagation();
                quickScaleImage(1.1);
              }}
              title="Expand image"
            >
              +
            </button>
          </div>
          {resizeHandlers.map((point) => (
            <ResizeHandler
              key={point.direction}
              type={point.direction}
              rotate={elementInfo.rotate}
              style={point.style}
              className="operate-resize-handler"
              onMouseDown={(e) => {
                e.stopPropagation();
                scaleElement(e, elementInfo, point.direction);
              }}
            />
          ))}
          <RotateHandler
            className="operate-rotate-handler"
            style={{ left: scaleWidth / 2 + 'px' }}
            onMouseDown={(e) => {
              e.stopPropagation();
              rotateElement(e, elementInfo);
            }}
          />
        </>
      )}
    </div>
  );
}
