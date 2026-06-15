import { describe, expect, it } from 'vitest';
import {
  alignElementsToCanvas,
  createCalloutShapeElement,
  deleteSidebarElements,
  duplicateElements,
  isEditorSidebarElementId,
  removeEditOverlayTexts,
} from '@/lib/classroom/edit-slide-tools';
import { ElementAlignCommands } from '@/lib/types/edit';
import type { PPTElement } from '@/lib/types/slides';

describe('edit-slide-tools', () => {
  it('identifies sidebar element ids', () => {
    expect(isEditorSidebarElementId('edit_text_abc')).toBe(true);
    expect(isEditorSidebarElementId('edit_callout_xyz')).toBe(true);
    expect(isEditorSidebarElementId('native-image-1')).toBe(false);
  });

  it('duplicates sidebar elements with new ids', () => {
    const elements: PPTElement[] = [
      {
        type: 'text',
        id: 'edit_text_1',
        left: 10,
        top: 10,
        width: 100,
        height: 40,
        rotate: 0,
        content: '<p>Hi</p>',
        defaultFontName: 'Arial',
        defaultColor: '#000',
      },
    ];
    const result = duplicateElements(elements, ['edit_text_1']);
    expect(result?.elements).toHaveLength(2);
    expect(result?.newIds[0]).toMatch(/^edit_dup_/);
  });

  it('creates callout with keypoints for resize formulas', () => {
    const callout = createCalloutShapeElement();
    expect(callout.type).toBe('shape');
    if (callout.type === 'shape') {
      expect(callout.keypoints).toEqual([0.125]);
    }
  });

  it('aligns selection to canvas left', () => {
    const elements: PPTElement[] = [
      {
        type: 'text',
        id: 'edit_text_1',
        left: 50,
        top: 20,
        width: 80,
        height: 30,
        rotate: 0,
        content: '<p>x</p>',
        defaultFontName: 'Arial',
        defaultColor: '#000',
      },
    ];
    const next = alignElementsToCanvas(elements, ['edit_text_1'], ElementAlignCommands.LEFT);
    expect(next?.[0].left).toBe(0);
  });

  it('removes only overlay text ids', () => {
    const elements: PPTElement[] = [
      {
        type: 'text',
        id: 'edit_text_1',
        left: 0,
        top: 0,
        width: 10,
        height: 10,
        rotate: 0,
        content: '<p>a</p>',
        defaultFontName: 'Arial',
        defaultColor: '#000',
      },
      {
        type: 'text',
        id: 'native_1',
        left: 0,
        top: 0,
        width: 10,
        height: 10,
        rotate: 0,
        content: '<p>b</p>',
        defaultFontName: 'Arial',
        defaultColor: '#000',
      },
    ];
    const next = removeEditOverlayTexts(elements);
    expect(next).toHaveLength(1);
    expect(next?.[0].id).toBe('native_1');
  });

  it('deleteSidebarElements only removes sidebar ids', () => {
    const elements: PPTElement[] = [
      {
        type: 'text',
        id: 'edit_sticky_1',
        left: 0,
        top: 0,
        width: 10,
        height: 10,
        rotate: 0,
        content: '<p>a</p>',
        defaultFontName: 'Arial',
        defaultColor: '#000',
      },
      {
        type: 'text',
        id: 'native_1',
        left: 0,
        top: 0,
        width: 10,
        height: 10,
        rotate: 0,
        content: '<p>b</p>',
        defaultFontName: 'Arial',
        defaultColor: '#000',
      },
    ];
    const next = deleteSidebarElements(elements, ['edit_sticky_1', 'native_1']);
    expect(next).toHaveLength(1);
    expect(next?.[0].id).toBe('native_1');
  });
});
