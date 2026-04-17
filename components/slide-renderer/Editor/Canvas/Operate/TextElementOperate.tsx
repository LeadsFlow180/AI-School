import { useMemo } from 'react';
import { useCanvasStore } from '@/lib/store';
import type { PPTTextElement } from '@/lib/types/slides';
import type { OperateResizeHandlers } from '@/lib/types/edit';
import emitter, { EmitterEvents } from '@/lib/utils/emitter';
import { useCommonOperate } from '../hooks/useCommonOperate';
import { RotateHandler } from './RotateHandler';
import { ResizeHandler } from './ResizeHandler';
import { BorderLine } from './BorderLine';

interface TextElementOperateProps {
  readonly elementInfo: PPTTextElement;
  readonly handlerVisible: boolean;
  readonly rotateElement: (e: React.MouseEvent, element: PPTTextElement) => void;
  readonly scaleElement: (
    e: React.MouseEvent,
    element: PPTTextElement,
    command: OperateResizeHandlers,
  ) => void;
}

export function TextElementOperate({
  elementInfo,
  handlerVisible,
  rotateElement,
  scaleElement,
}: TextElementOperateProps) {
  const canvasScale = useCanvasStore.use.canvasScale();

  const scaleWidth = useMemo(
    () => elementInfo.width * canvasScale,
    [elementInfo.width, canvasScale],
  );
  const scaleHeight = useMemo(
    () => elementInfo.height * canvasScale,
    [elementInfo.height, canvasScale],
  );

  const { textElementResizeHandlers, verticalTextElementResizeHandlers, borderLines } =
    useCommonOperate(scaleWidth, scaleHeight);
  const resizeHandlers = useMemo(
    () => (elementInfo.vertical ? verticalTextElementResizeHandlers : textElementResizeHandlers),
    [elementInfo.vertical, textElementResizeHandlers, verticalTextElementResizeHandlers],
  );

  return (
    <div className="text-element-operate">
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
                emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, {
                  target: elementInfo.id,
                  action: { command: 'fontsize-reduce', value: '2' },
                });
              }}
              title="Shrink text"
            >
              A-
            </button>
            <button
              type="button"
              className="h-6 min-w-6 rounded px-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              onMouseDown={(e) => {
                e.stopPropagation();
                emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, {
                  target: elementInfo.id,
                  action: { command: 'fontsize-add', value: '2' },
                });
              }}
              title="Expand text"
            >
              A+
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
