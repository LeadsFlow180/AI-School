import { nanoid } from 'nanoid';
import { ShapePathFormulasKeys } from '@/lib/types/slides';
import type { PPTElement } from '@/lib/types/slides';
import type { Scene } from '@/lib/types/stage';
import { ElementAlignCommands } from '@/lib/types/edit';
import { getElementListRange } from '@/lib/utils/element';

export const EDIT_SLIDE_VIEWPORT_WIDTH = 1000;
export const EDIT_SLIDE_VIEWPORT_HEIGHT = 563;

const PASTE_OFFSET = 20;

/** Elements added from the classroom /edit sidebar (not original slide content). */
export function isEditorSidebarElementId(id: string): boolean {
  return (
    id.startsWith('edit_text_') ||
    id.startsWith('edit_live_text_') ||
    id.startsWith('edit_ocr_text_') ||
    id.startsWith('edit_sticky_') ||
    id.startsWith('edit_callout_') ||
    id.startsWith('edit_highlight_') ||
    id.startsWith('edit_title_banner_') ||
    id.startsWith('edit_caption_') ||
    id.startsWith('edit_arrow_') ||
    id.startsWith('edit_badge_') ||
    id.startsWith('edit_dup_')
  );
}

export function isEditOverlayTextId(id: string): boolean {
  return (
    id.startsWith('edit_text_') ||
    id.startsWith('edit_live_text_') ||
    id.startsWith('edit_ocr_text_')
  );
}

export function resolveTargetElementIds(
  elements: PPTElement[],
  activeIds: string[],
  handleElementId: string | null,
  options?: { sidebarOnly?: boolean },
): string[] {
  const matches = (id: string) => {
    if (options?.sidebarOnly && !isEditorSidebarElementId(id)) return false;
    const el = elements.find((e) => e.id === id);
    return !!el && !el.lock;
  };

  const unlockedActive = activeIds.filter(matches);
  if (unlockedActive.length > 0) return unlockedActive;
  if (handleElementId && matches(handleElementId)) return [handleElementId];
  return [];
}

export function duplicateElements(
  elements: PPTElement[],
  targetIds: string[],
): { elements: PPTElement[]; newIds: string[] } | null {
  if (targetIds.length === 0) return null;

  const groupIdMap = new Map<string, string>();
  const clones: PPTElement[] = [];
  const newIds: string[] = [];

  for (const source of elements) {
    if (!targetIds.includes(source.id)) continue;
    const copied = JSON.parse(JSON.stringify(source)) as PPTElement;
    const newId = `edit_dup_${nanoid(8)}`;
    copied.id = newId;
    copied.left += PASTE_OFFSET;
    copied.top += PASTE_OFFSET;
    copied.lock = false;
    if (copied.groupId) {
      const mapped = groupIdMap.get(copied.groupId) || nanoid(10);
      groupIdMap.set(copied.groupId, mapped);
      copied.groupId = mapped;
    }
    clones.push(copied);
    newIds.push(newId);
  }

  if (clones.length === 0) return null;
  return { elements: [...elements, ...clones], newIds };
}

export function alignElementsToCanvas(
  elements: PPTElement[],
  targetIds: string[],
  command: ElementAlignCommands,
  viewportWidth = EDIT_SLIDE_VIEWPORT_WIDTH,
  viewportHeight = EDIT_SLIDE_VIEWPORT_HEIGHT,
): PPTElement[] | null {
  if (targetIds.length === 0) return null;

  const selected = elements.filter((el) => targetIds.includes(el.id));
  if (selected.length === 0) return null;

  const { minX, maxX, minY, maxY } = getElementListRange(selected);
  const next = JSON.parse(JSON.stringify(elements)) as PPTElement[];

  for (const element of next) {
    if (!targetIds.includes(element.id)) continue;

    if (command === ElementAlignCommands.CENTER) {
      const offsetY = minY + (maxY - minY) / 2 - viewportHeight / 2;
      const offsetX = minX + (maxX - minX) / 2 - viewportWidth / 2;
      element.top -= offsetY;
      element.left -= offsetX;
    } else if (command === ElementAlignCommands.TOP) {
      element.top -= minY;
    } else if (command === ElementAlignCommands.BOTTOM) {
      element.top -= maxY - viewportHeight;
    } else if (command === ElementAlignCommands.LEFT) {
      element.left -= minX;
    } else if (command === ElementAlignCommands.RIGHT) {
      element.left -= maxX - viewportWidth;
    } else if (command === ElementAlignCommands.HORIZONTAL) {
      element.left -= minX + (maxX - minX) / 2 - viewportWidth / 2;
    } else if (command === ElementAlignCommands.VERTICAL) {
      element.top -= minY + (maxY - minY) / 2 - viewportHeight / 2;
    }
  }

  return next;
}

export function reorderElement(
  elements: PPTElement[],
  elementId: string,
  position: 'front' | 'back',
): PPTElement[] | null {
  const element = elements.find((el) => el.id === elementId);
  if (!element) return null;

  const copy = JSON.parse(JSON.stringify(elements)) as PPTElement[];
  const level = copy.findIndex((el) => el.id === elementId);
  if (level < 0) return null;

  if (element.groupId) {
    const groupMembers = copy.filter((el) => el.groupId === element.groupId);
    const minLevel = copy.findIndex((el) => el.id === groupMembers[0]?.id);
    const chunk = copy.splice(minLevel, groupMembers.length);
    if (position === 'front') copy.push(...chunk);
    else copy.unshift(...chunk);
    return copy;
  }

  const [moved] = copy.splice(level, 1);
  if (position === 'front') copy.push(moved);
  else copy.unshift(moved);
  return copy;
}

export function flipElementsHorizontal(
  elements: PPTElement[],
  targetIds: string[],
): PPTElement[] | null {
  if (targetIds.length === 0) return null;
  const next = JSON.parse(JSON.stringify(elements)) as PPTElement[];
  let changed = false;

  for (const element of next) {
    if (!targetIds.includes(element.id)) continue;
    if (element.type === 'image' || element.type === 'shape') {
      element.flipH = !element.flipH;
      changed = true;
    }
  }

  return changed ? next : null;
}

export function flipElementsVertical(
  elements: PPTElement[],
  targetIds: string[],
): PPTElement[] | null {
  if (targetIds.length === 0) return null;
  const next = JSON.parse(JSON.stringify(elements)) as PPTElement[];
  let changed = false;

  for (const element of next) {
    if (!targetIds.includes(element.id)) continue;
    if (element.type === 'image' || element.type === 'shape') {
      element.flipV = !element.flipV;
      changed = true;
    }
  }

  return changed ? next : null;
}

export function deleteSidebarElements(
  elements: PPTElement[],
  targetIds: string[],
): PPTElement[] | null {
  if (targetIds.length === 0) return null;
  const filtered = elements.filter(
    (el) => !targetIds.includes(el.id) || !isEditorSidebarElementId(el.id),
  );
  return filtered.length === elements.length ? null : filtered;
}

export function adjustElementOpacity(
  elements: PPTElement[],
  targetIds: string[],
  delta: number,
): PPTElement[] | null {
  if (targetIds.length === 0) return null;
  const next = JSON.parse(JSON.stringify(elements)) as PPTElement[];
  let changed = false;

  for (const element of next) {
    if (!targetIds.includes(element.id)) continue;
    if ('opacity' in element || element.type === 'text' || element.type === 'shape') {
      const current = typeof element.opacity === 'number' ? element.opacity : 1;
      element.opacity = Math.min(1, Math.max(0.2, current + delta));
      changed = true;
    }
  }

  return changed ? next : null;
}

export function boldTextElements(
  elements: PPTElement[],
  targetIds: string[],
): PPTElement[] | null {
  const ids =
    targetIds.length > 0
      ? targetIds
      : elements.filter((el) => el.type === 'text' && isEditorSidebarElementId(el.id)).map((el) => el.id);
  if (ids.length === 0) return null;

  const wrapBold = (html: string) => {
    const trimmed = html.trim();
    if (!trimmed) return '<p><strong>Edit text</strong></p>';
    if (/<strong[\s>]/i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('<p>') && trimmed.endsWith('</p>')) {
      return trimmed.replace(/^<p>/i, '<p><strong>').replace(/<\/p>$/i, '</strong></p>');
    }
    return `<p><strong>${trimmed.replace(/<[^>]+>/g, '')}</strong></p>`;
  };

  const next = JSON.parse(JSON.stringify(elements)) as PPTElement[];
  let changed = false;

  for (const element of next) {
    if (!ids.includes(element.id)) continue;
    if (element.type === 'text') {
      element.content = wrapBold(element.content);
      changed = true;
    } else if (element.type === 'shape' && element.text) {
      element.text = { ...element.text, content: wrapBold(element.text.content) };
      changed = true;
    }
  }

  return changed ? next : null;
}

export function italicTextElements(
  elements: PPTElement[],
  targetIds: string[],
): PPTElement[] | null {
  const ids =
    targetIds.length > 0
      ? targetIds
      : elements
          .filter((el) => el.type === 'text' && isEditorSidebarElementId(el.id))
          .map((el) => el.id);
  if (ids.length === 0) return null;

  const wrapItalic = (html: string) => {
    const trimmed = html.trim();
    if (!trimmed) return '<p><em>Edit text</em></p>';
    if (/<em[\s>]/i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('<p>') && trimmed.endsWith('</p>')) {
      return trimmed.replace(/^<p>/i, '<p><em>').replace(/<\/p>$/i, '</em></p>');
    }
    return `<p><em>${trimmed.replace(/<[^>]+>/g, '')}</em></p>`;
  };

  const next = JSON.parse(JSON.stringify(elements)) as PPTElement[];
  let changed = false;

  for (const element of next) {
    if (!ids.includes(element.id)) continue;
    if (element.type === 'text') {
      element.content = wrapItalic(element.content);
      changed = true;
    } else if (element.type === 'shape' && element.text) {
      element.text = { ...element.text, content: wrapItalic(element.text.content) };
      changed = true;
    }
  }

  return changed ? next : null;
}

export function widenTextElements(
  elements: PPTElement[],
  targetIds: string[],
  viewportWidth = EDIT_SLIDE_VIEWPORT_WIDTH,
): PPTElement[] | null {
  const ids =
    targetIds.length > 0
      ? targetIds
      : elements.filter((el) => el.type === 'text' && isEditorSidebarElementId(el.id)).map((el) => el.id);
  if (ids.length === 0) return null;

  const next = JSON.parse(JSON.stringify(elements)) as PPTElement[];
  let changed = false;
  const margin = 48;

  for (const element of next) {
    if (!ids.includes(element.id) || element.type !== 'text') continue;
    element.left = margin;
    element.width = viewportWidth - margin * 2;
    changed = true;
  }

  return changed ? next : null;
}

export function removeEditOverlayTexts(elements: PPTElement[]): PPTElement[] | null {
  const filtered = elements.filter((el) => !(el.type === 'text' && isEditOverlayTextId(el.id)));
  return filtered.length === elements.length ? null : filtered;
}

export function createStickyNoteElement(): PPTElement {
  return {
    type: 'text',
    id: `edit_sticky_${nanoid(8)}`,
    left: 72,
    top: 88,
    width: 280,
    height: 200,
    rotate: 0,
    content: '<p><strong>Note</strong><br/>Key point for learners…</p>',
    defaultFontName: 'Microsoft YaHei',
    defaultColor: '#713f12',
    fill: 'rgba(254,240,138,0.94)',
    lineHeight: 1.45,
    wordSpace: 0,
    opacity: 1,
    paragraphSpace: 6,
    shadow: { h: 2, v: 4, blur: 12, color: 'rgba(120,53,15,0.22)' },
  };
}

export function createCalloutShapeElement(): PPTElement {
  return {
    type: 'shape',
    id: `edit_callout_${nanoid(8)}`,
    left: 96,
    top: 420,
    width: 360,
    height: 96,
    rotate: 0,
    viewBox: [200, 200],
    path: 'M 50 0 L 150 0 Q 200 0 200 50 L 200 150 Q 200 200 150 200 L 50 200 Q 0 200 0 150 L 0 50 Q 0 0 50 0 Z',
    pathFormula: ShapePathFormulasKeys.ROUND_RECT,
    keypoints: [0.125],
    fixedRatio: false,
    fill: '#0f766e',
    opacity: 0.94,
    outline: { width: 2, color: '#115e59' },
    text: {
      content: '<p style="color:#ecfdf5">Callout: explain this visually</p>',
      defaultFontName: 'Microsoft YaHei',
      defaultColor: '#ecfdf5',
      align: 'middle',
      lineHeight: 1.35,
    },
  };
}

export function createHighlightBarElement(): PPTElement {
  return {
    type: 'shape',
    id: `edit_highlight_${nanoid(8)}`,
    left: 64,
    top: 280,
    width: 872,
    height: 56,
    rotate: 0,
    viewBox: [200, 200],
    path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
    fixedRatio: false,
    fill: 'rgba(250,204,21,0.38)',
    opacity: 1,
    outline: { style: 'dashed', width: 1, color: 'rgba(202,138,4,0.65)' },
  };
}

export function createCaptionElement(): PPTElement {
  return {
    type: 'text',
    id: `edit_caption_${nanoid(8)}`,
    left: 64,
    top: 480,
    width: 520,
    height: 56,
    rotate: 0,
    content: '<p>Caption or supporting detail…</p>',
    defaultFontName: 'Microsoft YaHei',
    defaultColor: '#334155',
    fill: 'rgba(255,255,255,0.82)',
    lineHeight: 1.35,
    wordSpace: 0,
    opacity: 1,
    paragraphSpace: 4,
  };
}

export function createArrowLineElement(): PPTElement {
  return {
    type: 'line',
    id: `edit_arrow_${nanoid(8)}`,
    left: 140,
    top: 300,
    width: 4,
    start: [0, 0],
    end: [320, 0],
    style: 'solid',
    color: '#dc2626',
    points: ['', 'arrow'],
  };
}

export function createImportantBadgeElement(): PPTElement {
  return {
    type: 'text',
    id: `edit_badge_${nanoid(8)}`,
    left: 72,
    top: 72,
    width: 168,
    height: 44,
    rotate: 0,
    content: '<p><strong>Important</strong></p>',
    defaultFontName: 'Microsoft YaHei',
    defaultColor: '#991b1b',
    fill: 'rgba(254,226,226,0.94)',
    lineHeight: 1.2,
    wordSpace: 0,
    opacity: 1,
    paragraphSpace: 2,
  };
}

export function createTitleBannerElement(title: string): PPTElement {
  const safe = title.trim() || 'Slide title';
  return {
    type: 'text',
    id: `edit_title_banner_${nanoid(8)}`,
    left: 48,
    top: 28,
    width: 904,
    height: 72,
    rotate: 0,
    content: `<p><strong>${safe.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</strong></p>`,
    defaultFontName: 'Microsoft YaHei',
    defaultColor: '#f8fafc',
    fill: 'rgba(15,23,42,0.78)',
    lineHeight: 1.25,
    wordSpace: 0,
    opacity: 1,
    paragraphSpace: 4,
  };
}

export function distributeElementsHorizontally(
  elements: PPTElement[],
  targetIds: string[],
): PPTElement[] | null {
  if (targetIds.length < 3) return null;

  const selected = elements
    .filter((el) => targetIds.includes(el.id))
    .sort((a, b) => a.left - b.left);
  if (selected.length < 3) return null;

  const minLeft = selected[0].left;
  const maxLeft = selected[selected.length - 1].left;
  const gap = (maxLeft - minLeft) / (selected.length - 1);

  const next = JSON.parse(JSON.stringify(elements)) as PPTElement[];
  selected.forEach((source, index) => {
    const element = next.find((el) => el.id === source.id);
    if (element) element.left = Math.round(minLeft + gap * index);
  });

  return next;
}

export function applySlideElements(scene: Scene, elements: PPTElement[]): Scene {
  if (scene.content.type !== 'slide') return scene;
  return {
    ...scene,
    content: {
      ...scene.content,
      canvas: {
        ...scene.content.canvas,
        elements,
      },
    },
    updatedAt: Date.now(),
  };
}
