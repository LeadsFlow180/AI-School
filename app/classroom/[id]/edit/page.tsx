'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { useStageStore } from '@/lib/store';
import { useSnapshotStore } from '@/lib/store/snapshot';
import { useCanvasStore } from '@/lib/store/canvas';
import { SceneRenderer } from '@/components/stage/scene-renderer';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { getSessionSafe, getSupabaseClient } from '@/lib/supabase/client';
import type { Scene } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type { PPTElement } from '@/lib/types/slides';
import { nanoid } from 'nanoid';
import { Layers, LayoutGrid, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SlideTextRichToolbar } from '@/components/slide-renderer/Editor/Canvas/Operate/SlideTextRichToolbar';
import { EditCanvasActionPanel } from '@/components/classroom/edit-canvas-action-panel';
import { EditCanvasAmbient } from '@/components/classroom/edit-canvas-ambient';
import { EditCanvasHeader } from '@/components/classroom/edit-canvas-header';
import { EditCanvasPanel } from '@/components/classroom/edit-canvas-panel';
import { EditCanvasSlideButton } from '@/components/classroom/edit-canvas-slide-button';
import {
  editAccentGradient,
  editCanvasChromeBar,
  editCanvasFrame,
  editGlassPanel,
  editPanelBody,
  editStudioBackdrop,
} from '@/lib/classroom/edit-canvas-styles';
import {
  adjustElementOpacity,
  applySlideElements,
  alignElementsToCanvas,
  boldTextElements,
  createArrowLineElement,
  createCalloutShapeElement,
  createCaptionElement,
  createHighlightBarElement,
  createImportantBadgeElement,
  createStickyNoteElement,
  createTitleBannerElement,
  deleteSidebarElements,
  distributeElementsHorizontally,
  duplicateElements,
  flipElementsHorizontal,
  flipElementsVertical,
  italicTextElements,
  removeEditOverlayTexts,
  reorderElement,
  resolveTargetElementIds,
  widenTextElements,
} from '@/lib/classroom/edit-slide-tools';
import { ElementAlignCommands } from '@/lib/types/edit';

type TesseractBbox = { x0: number; y0: number; x1: number; y1: number };

type TesseractLineLike = {
  text?: string;
  bbox?: TesseractBbox;
};

function flattenTesseractLines(page: {
  blocks?: { paragraphs?: { lines?: TesseractLineLike[] }[] }[] | null;
}): TesseractLineLike[] {
  if (!page.blocks) return [];
  return page.blocks.flatMap((block) =>
    (block.paragraphs ?? []).flatMap((paragraph) => paragraph.lines ?? []),
  );
}

function getImageNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        width: Math.max(1, img.naturalWidth),
        height: Math.max(1, img.naturalHeight),
      });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = src;
  });
}

export default function ClassroomEditCanvasPage() {
  const params = useParams();
  const router = useRouter();

  const rawParamId = params?.id;
  const classroomId = Array.isArray(rawParamId) ? rawParamId[0] : rawParamId;

  const { loadFromStorage, clearStore } = useStageStore();
  const setCurrentSceneId = useStageStore((s) => s.setCurrentSceneId);
  const updateScene = useStageStore((s) => s.updateScene);

  const stage = useStageStore((s) => s.stage);
  const scenes = useStageStore((s) => s.scenes);
  const currentSceneId = useStageStore((s) => s.currentSceneId);
  const handleElementId = useCanvasStore.use.handleElementId();
  const activeElementIdList = useCanvasStore.use.activeElementIdList();
  const setActiveElementIdList = useCanvasStore.use.setActiveElementIdList();

  const snapshotCursor = useSnapshotStore((s) => s.snapshotCursor);
  const snapshotLength = useSnapshotStore((s) => s.snapshotLength);
  const canUndoHistory = snapshotCursor > 0;
  const canRedoHistory = snapshotCursor < snapshotLength - 1;

  const [authReady, setAuthReady] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isConvertingOcr, setIsConvertingOcr] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isReplacingImage, setIsReplacingImage] = useState(false);
  const [finalizeSaveNotice, setFinalizeSaveNotice] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [manualSaveNotice, setManualSaveNotice] = useState<string | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const scriptSyncGuardRef = useRef(false);
  const persistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!finalizeSaveNotice) return;
    const t = window.setTimeout(() => setFinalizeSaveNotice(null), 8000);
    return () => window.clearTimeout(t);
  }, [finalizeSaveNotice]);

  useEffect(() => {
    if (!manualSaveNotice) return;
    const t = window.setTimeout(() => setManualSaveNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [manualSaveNotice]);

  useEffect(() => {
    const { setClassroomCanvasEditMode } = useCanvasStore.getState();
    setClassroomCanvasEditMode(true);
    return () => setClassroomCanvasEditMode(false);
  }, []);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setAuthReady(true);
      setIsAdminUser(false);
      return;
    }

    const syncAdmin = async () => {
      const session = await getSessionSafe(supabase);
      if (!active) return;

      const token = session?.access_token;
      if (!token) {
        setIsAdminUser(false);
        setAuthReady(true);
        return;
      }

      try {
        const res = await fetch('/api/auth/admin-status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!active) return;

        if (!res.ok) {
          setIsAdminUser(false);
          setAuthReady(true);
          return;
        }

        const json = await res.json();
        if (!active) return;
        setIsAdminUser(!!json.isAdmin);
        setAuthReady(true);
      } catch {
        if (!active) return;
        setIsAdminUser(false);
        setAuthReady(true);
      }
    };

    void syncAdmin();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!isAdminUser) {
      setLoading(false);
      setError('Admin only');
      return;
    }
    if (!classroomId) {
      setLoading(false);
      setError('Missing classroom id');
      return;
    }

    let active = true;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        clearStore();
        useWhiteboardHistoryStore.getState().clearHistory();

        const mediaStore = useMediaGenerationStore.getState();
        mediaStore.revokeObjectUrls();
        useMediaGenerationStore.setState({ tasks: {} });

        await loadFromStorage(classroomId);

        // If IndexedDB had no data, try server-side storage
        if (!useStageStore.getState().stage) {
          const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.classroom) {
              const { stage: loadedStage, scenes: loadedScenes } = json.classroom;
              useStageStore.getState().setStage(loadedStage);
              useStageStore.getState().setScenes(loadedScenes);
              useStageStore.getState().setCurrentSceneId(loadedScenes[0]?.id ?? null);
            }
          }
        }

        if (!active) return;

        const loadedStageId = useStageStore.getState().stage?.id;
        if (loadedStageId !== classroomId) {
          throw new Error(`Classroom "${classroomId}" not found.`);
        }

        // Restore media tasks and reconcile gen_img_* placeholders
        await useMediaGenerationStore.getState().restoreFromDB(classroomId);
        const { reconcileGeneratedImageSources } = await import('@/lib/media/media-orchestrator');
        await reconcileGeneratedImageSources(classroomId);

        // Select first slide scene (editor only supports slide content for now)
        const slideScenes = useStageStore.getState().scenes.filter(
          (s): s is Scene & { content: { type: 'slide' } } =>
            s.type === 'slide' && s.content.type === 'slide',
        );
        if (slideScenes.length > 0) {
          setCurrentSceneId(slideScenes[0].id);
        }

        await useSnapshotStore.getState().resetSnapshotHistory();
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Failed to load classroom');
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [authReady, isAdminUser, classroomId, loadFromStorage, clearStore, setCurrentSceneId]);

  const slideScenes = useMemo(() => {
    return scenes.filter(
      (s): s is Scene & { content: { type: 'slide' } } => s.type === 'slide' && s.content.type === 'slide',
    );
  }, [scenes]);

  const selectedScene = useMemo(() => {
    if (!currentSceneId) return null;
    return scenes.find((s) => s.id === currentSceneId && s.type === 'slide' && s.content.type === 'slide') || null;
  }, [scenes, currentSceneId]);

  useEffect(() => {
    if (!selectedScene) {
      if (slideScenes.length > 0) setCurrentSceneId(slideScenes[0].id);
    }
  }, [selectedScene, slideScenes, setCurrentSceneId]);

  /** Active canvas text target for sidebar rich-text tools (matches ProseMirror `elementId`). */
  const slideRichTextTarget = useMemo(() => {
    if (!handleElementId || !selectedScene || selectedScene.content.type !== 'slide') return null;
    const el = selectedScene.content.canvas.elements.find((e) => e.id === handleElementId);
    if (!el) return null;
    if (el.type === 'text') return { id: el.id, defaultColor: el.defaultColor };
    if (el.type === 'shape' && el.text) return { id: el.id, defaultColor: el.text.defaultColor };
    return null;
  }, [handleElementId, selectedScene]);

  const editableBlocks = useMemo(() => {
    if (!selectedScene || selectedScene.content.type !== 'slide') return [];
    const elements = selectedScene.content.canvas.elements;
    return elements
      .map((el) => {
        if (el.type === 'text') {
          return { id: el.id, label: 'Text element', field: 'text' as const, value: el.content };
        }
        if (el.type === 'shape' && el.text) {
          return { id: el.id, label: 'Shape text', field: 'shapeText' as const, value: el.text.content };
        }
        if (el.type === 'latex' && el.html) {
          return { id: el.id, label: 'Latex HTML', field: 'latexHtml' as const, value: el.html };
        }
        return null;
      })
      .filter((x): x is { id: string; label: string; field: 'text' | 'shapeText' | 'latexHtml'; value: string } =>
        !!x,
      );
  }, [selectedScene]);

  const handleUpdateHtml = (
    elementId: string,
    field: 'text' | 'shapeText' | 'latexHtml',
    value: string,
  ) => {
    if (!selectedScene || selectedScene.content.type !== 'slide') return;
    const nextScene: Scene = {
      ...selectedScene,
      content: {
        ...selectedScene.content,
        canvas: {
          ...selectedScene.content.canvas,
          elements: selectedScene.content.canvas.elements.map((el: PPTElement) => {
            if (el.id !== elementId) return el;
            if (field === 'text' && el.type === 'text') {
              return { ...el, content: value };
            }
            if (field === 'shapeText' && el.type === 'shape' && el.text) {
              return { ...el, text: { ...el.text, content: value } };
            }
            if (field === 'latexHtml' && el.type === 'latex') {
              return { ...el, html: value };
            }
            return el;
          }),
        },
      },
      updatedAt: Date.now(),
    };
    applySceneUpdate(nextScene, { recordHistory: true });
  };

  const handleUpdateSceneTitle = (value: string) => {
    if (!selectedScene) return;
    applySceneUpdate(
      {
        ...selectedScene,
        title: value,
        updatedAt: Date.now(),
      },
      { recordHistory: true },
    );
  };

  const speechActions = useMemo(() => {
    if (!selectedScene) return [];
    return (selectedScene.actions || [])
      .map((action, index) => ({ action, index }))
      .filter((x): x is { action: Action & { type: 'speech' }; index: number } => x.action.type === 'speech');
  }, [selectedScene]);

  const persistEditChanges = async () => {
    try {
      await useStageStore.getState().saveToStorage();
      const supabase = getSupabaseClient();
      const session = supabase ? await getSessionSafe(supabase) : null;
      if (session?.access_token) {
        const storeState = useStageStore.getState();
        const stage = storeState.stage;
        if (stage?.id) {
          const syncRes = await fetch('/api/classroom/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              stage,
              scenes: storeState.scenes,
              chats: storeState.chats,
            }),
          });
          if (!syncRes.ok) {
            const syncJson = await syncRes.json().catch(() => null);
            const msg = syncJson?.error || 'Database sync failed.';
            throw new Error(msg);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to persist classroom updates.');
    }
  };

  const rebuildTutorScript = (scene: Scene): Scene => {
    if (scene.type !== 'slide' || scene.content.type !== 'slide') return scene;
    const htmlToText = (input: string) =>
      input
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const textFromElements = scene.content.canvas.elements
      .map((el) => {
        if (el.type === 'text') return htmlToText(el.content || '');
        if (el.type === 'shape' && el.text) return htmlToText(el.text.content || '');
        if (el.type === 'latex' && el.html) return htmlToText(el.html || '');
        return '';
      })
      .filter(Boolean)
      .join(' ')
      .slice(0, 900);

    const title = (scene.title || `Slide ${scene.order || 1}`).trim();
    const firstSpeech = textFromElements
      ? `In this slide, we focus on: ${textFromElements.slice(0, 260)}${textFromElements.length > 260 ? '...' : ''}`
      : `In this slide, we focus on ${title}.`;
    const secondSpeech = textFromElements
      ? `Key takeaway: ${textFromElements.slice(260, 520).trim() || textFromElements.slice(0, 220)}`
      : 'Please observe the visuals and highlighted points carefully before moving to the next slide.';

    const nonSpeechActions = (scene.actions || []).filter((a) => a.type !== 'speech');
    const refreshedSpeech: Action[] = [
      { id: `edit-speech-1-${scene.id}`, type: 'speech', text: firstSpeech },
      { id: `edit-speech-2-${scene.id}`, type: 'speech', text: secondSpeech },
    ];

    return {
      ...scene,
      actions: [...refreshedSpeech, ...nonSpeechActions],
      updatedAt: Date.now(),
    };
  };

  const applySceneUpdate = (
    scene: Scene,
    options?: { refreshTutorScript?: boolean; recordHistory?: boolean },
  ) => {
    const next = options?.refreshTutorScript === false ? scene : rebuildTutorScript(scene);
    // Mark as explicitly edited so classroom runtime does not auto-regenerate
    // Gamma/default scripts repeatedly on every load.
    const lockedScene = {
      ...next,
      __editedInCanvas: true,
      __scriptLocked: true,
    } as Scene;
    updateScene(lockedScene.id, lockedScene);

    if (options?.recordHistory) {
      void useSnapshotStore.getState().addSnapshot();
    }

    if (persistDebounceRef.current) {
      clearTimeout(persistDebounceRef.current);
    }
    persistDebounceRef.current = setTimeout(() => {
      void persistEditChanges();
      persistDebounceRef.current = null;
    }, 700);
  };

  useEffect(() => {
    if (!selectedScene || selectedScene.type !== 'slide' || selectedScene.content.type !== 'slide') return;
    if (scriptSyncGuardRef.current) return;

    const rebuilt = rebuildTutorScript(selectedScene);
    const currentSpeech = (selectedScene.actions || []).filter((a) => a.type === 'speech');
    const rebuiltSpeech = (rebuilt.actions || []).filter((a) => a.type === 'speech');
    const currentSig = currentSpeech.map((a) => a.text).join('||');
    const rebuiltSig = rebuiltSpeech.map((a) => a.text).join('||');

    if (currentSig === rebuiltSig) return;

    scriptSyncGuardRef.current = true;
    applySceneUpdate(selectedScene, { refreshTutorScript: true });
    // Release guard after state propagates; avoids self-trigger loops.
    setTimeout(() => {
      scriptSyncGuardRef.current = false;
    }, 0);
  }, [selectedScene]);

  const handleUpdateSpeechAction = (actionIndex: number, value: string) => {
    if (!selectedScene) return;
    const nextActions = [...(selectedScene.actions || [])];
    const current = nextActions[actionIndex];
    if (!current || current.type !== 'speech') return;
    nextActions[actionIndex] = { ...current, text: value };
    applySceneUpdate(
      {
        ...selectedScene,
        actions: nextActions,
        updatedAt: Date.now(),
      },
      { refreshTutorScript: false, recordHistory: true },
    );
  };

  const getSlideElements = (): PPTElement[] => {
    if (!selectedScene || selectedScene.content.type !== 'slide') return [];
    return selectedScene.content.canvas.elements;
  };

  const getTargetElementIds = () =>
    resolveTargetElementIds(getSlideElements(), activeElementIdList, handleElementId, {
      sidebarOnly: true,
    });

  const commitSlideElements = (elements: PPTElement[], selectIds?: string[]) => {
    if (!selectedScene || selectedScene.content.type !== 'slide') return;
    applySceneUpdate(applySlideElements(selectedScene, elements), { recordHistory: true });
    if (selectIds?.length) setActiveElementIdList(selectIds);
  };

  const handleUndoHistory = async () => {
    if (!canUndoHistory) return;
    await useSnapshotStore.getState().undo();
    setActiveElementIdList([]);
    if (persistDebounceRef.current) {
      clearTimeout(persistDebounceRef.current);
    }
    persistDebounceRef.current = setTimeout(() => {
      void persistEditChanges();
      persistDebounceRef.current = null;
    }, 700);
  };

  const handleRedoHistory = async () => {
    if (!canRedoHistory) return;
    await useSnapshotStore.getState().redo();
    setActiveElementIdList([]);
    if (persistDebounceRef.current) {
      clearTimeout(persistDebounceRef.current);
    }
    persistDebounceRef.current = setTimeout(() => {
      void persistEditChanges();
      persistDebounceRef.current = null;
    }, 700);
  };

  useEffect(() => {
    if (loading || error) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        void handleUndoHistory();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        void handleRedoHistory();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, error, canUndoHistory, canRedoHistory]);

  const handleDuplicateSelection = () => {
    const elements = getSlideElements();
    const targetIds = getTargetElementIds();
    const result = duplicateElements(elements, targetIds);
    if (!result) return;
    commitSlideElements(result.elements, result.newIds);
  };

  const handleCenterSelection = () => {
    const elements = getSlideElements();
    const targetIds = getTargetElementIds();
    const next = alignElementsToCanvas(elements, targetIds, ElementAlignCommands.CENTER);
    if (!next) return;
    commitSlideElements(next, targetIds);
  };

  const handleAlignSelection = (command: ElementAlignCommands) => {
    const elements = getSlideElements();
    const targetIds = getTargetElementIds();
    const next = alignElementsToCanvas(elements, targetIds, command);
    if (!next) return;
    commitSlideElements(next, targetIds);
  };

  const handleDeleteSelection = () => {
    const targetIds = getTargetElementIds();
    const next = deleteSidebarElements(getSlideElements(), targetIds);
    if (!next) return;
    commitSlideElements(next, []);
  };

  const handleWidenText = () => {
    const elements = getSlideElements();
    const targetIds = getTargetElementIds();
    const next = widenTextElements(elements, targetIds);
    if (!next) return;
    commitSlideElements(next, targetIds.length ? targetIds : undefined);
  };

  const handleDistributeHorizontally = () => {
    const elements = getSlideElements();
    const targetIds = getTargetElementIds();
    const next = distributeElementsHorizontally(elements, targetIds);
    if (!next) return;
    commitSlideElements(next, targetIds);
  };

  const handleItalicText = () => {
    const elements = getSlideElements();
    const targetIds = getTargetElementIds();
    const next = italicTextElements(elements, targetIds);
    if (!next) return;
    commitSlideElements(next, targetIds.length ? targetIds : undefined);
  };

  const handleAdjustOpacity = (delta: number) => {
    const elements = getSlideElements();
    const targetIds = getTargetElementIds();
    const next = adjustElementOpacity(elements, targetIds, delta);
    if (!next) return;
    commitSlideElements(next, targetIds);
  };

  const handleReorderSelection = (position: 'front' | 'back') => {
    const targetIds = getTargetElementIds();
    if (targetIds.length === 0) return;
    let elements = getSlideElements();
    for (const id of targetIds) {
      const next = reorderElement(elements, id, position);
      if (next) elements = next;
    }
    commitSlideElements(elements, targetIds);
  };

  const handleFlipHorizontal = () => {
    const elements = getSlideElements();
    const targetIds = getTargetElementIds();
    const next = flipElementsHorizontal(elements, targetIds);
    if (!next) return;
    commitSlideElements(next, targetIds);
  };

  const handleFlipVertical = () => {
    const elements = getSlideElements();
    const targetIds = getTargetElementIds();
    const next = flipElementsVertical(elements, targetIds);
    if (!next) return;
    commitSlideElements(next, targetIds);
  };

  const handleBoldText = () => {
    const elements = getSlideElements();
    const targetIds = getTargetElementIds();
    const next = boldTextElements(elements, targetIds);
    if (!next) return;
    commitSlideElements(next, targetIds.length ? targetIds : undefined);
  };

  const handleClearOverlayTexts = () => {
    const next = removeEditOverlayTexts(getSlideElements());
    if (!next) return;
    commitSlideElements(next, []);
  };

  const handleAddStickyNote = () => {
    const note = createStickyNoteElement();
    commitSlideElements([...getSlideElements(), note], [note.id]);
  };

  const handleAddCallout = () => {
    const callout = createCalloutShapeElement();
    commitSlideElements([...getSlideElements(), callout], [callout.id]);
  };

  const handleAddHighlightBar = () => {
    const bar = createHighlightBarElement();
    commitSlideElements([...getSlideElements(), bar], [bar.id]);
  };

  const handleAddTitleBanner = () => {
    if (!selectedScene) return;
    const banner = createTitleBannerElement(selectedScene.title || `Slide ${selectedScene.order || 1}`);
    commitSlideElements([...getSlideElements(), banner], [banner.id]);
  };

  const handleAddCaption = () => {
    const caption = createCaptionElement();
    commitSlideElements([...getSlideElements(), caption], [caption.id]);
  };

  const handleAddArrow = () => {
    const arrow = createArrowLineElement();
    commitSlideElements([...getSlideElements(), arrow], [arrow.id]);
  };

  const handleAddImportantBadge = () => {
    const badge = createImportantBadgeElement();
    commitSlideElements([...getSlideElements(), badge], [badge.id]);
  };

  const handleAddSlideTextBox = () => {
    if (!selectedScene || selectedScene.content.type !== 'slide') return;

    const nextElements = [...selectedScene.content.canvas.elements];
    nextElements.push({
      type: 'text',
      id: `edit_text_${nanoid(8)}`,
      left: 120,
      top: 110,
      width: 760,
      height: 90,
      rotate: 0,
      content: '<p>Edit this text</p>',
      defaultFontName: 'Microsoft YaHei',
      defaultColor: '#111827',
      lineHeight: 1.5,
      wordSpace: 0,
      opacity: 1,
      paragraphSpace: 5,
    });

    applySceneUpdate(
      {
        ...selectedScene,
        content: {
          ...selectedScene.content,
          canvas: {
            ...selectedScene.content.canvas,
            elements: nextElements,
          },
        },
        updatedAt: Date.now(),
      },
      { recordHistory: true },
    );
  };

  const handleCreateLiveTextFromSpeech = () => {
    if (!selectedScene || selectedScene.content.type !== 'slide') return;

    const speechTexts = (selectedScene.actions || [])
      .filter((a): a is Action & { type: 'speech' } => a.type === 'speech')
      .map((a) => a.text?.trim())
      .filter((text): text is string => !!text);

    if (speechTexts.length === 0) return;

    const nextElements = [...selectedScene.content.canvas.elements];
    const seed = speechTexts.join(' ').slice(0, 480);
    nextElements.push({
      type: 'text',
      id: `edit_live_text_${nanoid(8)}`,
      left: 70,
      top: 62,
      width: 860,
      height: 180,
      rotate: 0,
      content: `<p>${seed.replace(/\n/g, '<br/>')}</p>`,
      defaultFontName: 'Microsoft YaHei',
      defaultColor: '#0f172a',
      fill: 'rgba(255,255,255,0.88)',
      lineHeight: 1.4,
      wordSpace: 0,
      opacity: 1,
      paragraphSpace: 5,
    });

    applySceneUpdate(
      {
        ...selectedScene,
        content: {
          ...selectedScene.content,
          canvas: {
            ...selectedScene.content.canvas,
            elements: nextElements,
          },
        },
        updatedAt: Date.now(),
      },
      { recordHistory: true },
    );
  };

  const toPlainText = (html: string) => {
    if (!html) return '';
    const normalized = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return normalized;
  };

  const handleFinalizeReplaceOnImage = async () => {
    if (!selectedScene || selectedScene.content.type !== 'slide') return;
    const elements = selectedScene.content.canvas.elements;
    const imageElement = elements.find((el) => el.type === 'image');
    if (!imageElement || imageElement.type !== 'image' || !imageElement.src) return;

    const textOverlays = elements.filter(
      (el): el is Extract<PPTElement, { type: 'text' }> =>
        el.type === 'text' && (el.id.startsWith('edit_text_') || el.id.startsWith('edit_live_text_')),
    );

    if (textOverlays.length === 0) return;

    setFinalizeSaveNotice(null);
    setIsFinalizing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 563;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError('Could not access canvas to finalize the slide image.');
        return;
      }

      const background = new Image();
      background.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        background.onload = () => resolve();
        background.onerror = () => reject(new Error('Failed to load slide background image.'));
        background.src = imageElement.src;
      });

      // Draw existing slide image first.
      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

      // Bake edited text overlays into image pixels.
      for (const textEl of textOverlays) {
        const fontSize = 30;
        const lineHeight = Math.round(fontSize * 1.35);
        const plain = toPlainText(textEl.content);
        if (!plain) continue;

        ctx.save();
        if (textEl.fill) {
          ctx.fillStyle = textEl.fill;
          ctx.globalAlpha = typeof textEl.opacity === 'number' ? textEl.opacity : 1;
          ctx.fillRect(textEl.left, textEl.top, textEl.width, textEl.height);
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = textEl.defaultColor || '#111827';
        ctx.font = `${fontSize}px "${textEl.defaultFontName || 'Microsoft YaHei'}", sans-serif`;
        ctx.textBaseline = 'top';

        const lines = plain.split('\n');
        let y = textEl.top + 12;
        for (const line of lines) {
          if (y > textEl.top + textEl.height - lineHeight) break;
          ctx.fillText(line, textEl.left + 12, y, Math.max(20, textEl.width - 24));
          y += lineHeight;
        }
        ctx.restore();
      }

      const bakedSrc = canvas.toDataURL('image/png');
      const nextElements = elements
        .map((el) => (el.id === imageElement.id && el.type === 'image' ? { ...el, src: bakedSrc } : el))
        .filter(
          (el) => !(el.type === 'text' && (el.id.startsWith('edit_text_') || el.id.startsWith('edit_live_text_'))),
        );

      applySceneUpdate(
        {
          ...selectedScene,
          content: {
            ...selectedScene.content,
            canvas: {
              ...selectedScene.content.canvas,
              elements: nextElements,
            },
          },
          updatedAt: Date.now(),
        },
        { recordHistory: true },
      );
      await persistStageNow();
      setFinalizeSaveNotice(
        'Your changes have been saved. Overlay text was merged into the slide image and temporary text boxes were removed.',
      );
    } catch (e) {
      setFinalizeSaveNotice(null);
      setError(e instanceof Error ? e.message : 'Failed to finalize slide edits');
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleConvertImageTextToEditable = async () => {
    if (!selectedScene || selectedScene.content.type !== 'slide') return;
    const elements = selectedScene.content.canvas.elements;
    const imageElement = elements.find((el) => el.type === 'image');
    if (!imageElement || imageElement.type !== 'image' || !imageElement.src) return;

    setIsConvertingOcr(true);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const result = await worker.recognize(imageElement.src);
      await worker.terminate();

      const lines = flattenTesseractLines(result.data).filter(
        (line) => (line.text || '').trim().length > 0,
      );
      if (lines.length === 0) return;

      const { width: ocrW, height: ocrH } = await getImageNaturalSize(imageElement.src);

      const overlayElements: PPTElement[] = lines.map((line, idx) => {
        const bbox = line.bbox || { x0: 0, y0: 0, x1: 300, y1: 40 };
        const xRatio = imageElement.width / ocrW;
        const yRatio = imageElement.height / ocrH;
        const left = imageElement.left + bbox.x0 * xRatio;
        const top = imageElement.top + bbox.y0 * yRatio;
        const width = Math.max(60, (bbox.x1 - bbox.x0) * xRatio);
        const height = Math.max(24, (bbox.y1 - bbox.y0) * yRatio + 12);
        const fontPx = Math.max(16, Math.min(42, Math.round(height * 0.72)));

        return {
          type: 'text',
          id: `edit_ocr_text_${nanoid(8)}_${idx}`,
          left,
          top,
          width,
          height,
          rotate: 0,
          content: `<p>${(line.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`,
          defaultFontName: 'Microsoft YaHei',
          defaultColor: '#0f172a',
          fill: 'rgba(255,255,255,0.72)',
          lineHeight: 1.2,
          wordSpace: 0,
          opacity: 1,
          paragraphSpace: 4,
        };
      });

      applySceneUpdate(
        {
          ...selectedScene,
          content: {
            ...selectedScene.content,
            canvas: {
              ...selectedScene.content.canvas,
              elements: [...elements, ...overlayElements],
            },
          },
          updatedAt: Date.now(),
        },
        { recordHistory: true },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OCR conversion failed');
    } finally {
      setIsConvertingOcr(false);
    }
  };

  const getTargetImageElementId = () => {
    if (!selectedScene || selectedScene.content.type !== 'slide') return null;
    const elements = selectedScene.content.canvas.elements;
    if (handleElementId) {
      const active = elements.find((el) => el.id === handleElementId);
      if (active?.type === 'image') return active.id;
    }
    const firstImage = elements.find((el) => el.type === 'image');
    return firstImage?.id ?? null;
  };

  const persistStageNow = persistEditChanges;

  const handleSaveAll = async () => {
    if (persistDebounceRef.current) {
      clearTimeout(persistDebounceRef.current);
      persistDebounceRef.current = null;
    }
    setIsSavingAll(true);
    setManualSaveNotice(null);
    setError(null);
    try {
      await persistEditChanges();
      setManualSaveNotice('All changes saved to this classroom.');
    } finally {
      setIsSavingAll(false);
    }
  };

  const fileToDataUrl = (file: File | Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image.'));
      reader.readAsDataURL(file);
    });

  const replaceImageSource = async (nextSrc: string) => {
    if (!selectedScene || selectedScene.content.type !== 'slide') return false;
    const targetImageId = getTargetImageElementId();
    if (!targetImageId) return false;
    const nextElements = selectedScene.content.canvas.elements.map((el) =>
      el.id === targetImageId && el.type === 'image' ? { ...el, src: nextSrc } : el,
    );
    applySceneUpdate(
      {
        ...selectedScene,
        content: {
          ...selectedScene.content,
          canvas: {
            ...selectedScene.content.canvas,
            elements: nextElements,
          },
        },
        updatedAt: Date.now(),
      },
      { recordHistory: true },
    );
    await persistStageNow();
    return true;
  };

  const handleReplaceImageFromUrl = async () => {
    const src = imageUrlInput.trim();
    if (!src) return;
    setIsReplacingImage(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const session = supabase ? await getSessionSafe(supabase) : null;
      let durableSrc = src;

      // Convert to data URL for guaranteed persistence in saved scene JSON.
      // # Reason: third-party URLs or private storage links can break in new tabs.
      try {
        const remoteRes = await fetch(src);
        if (remoteRes.ok) {
          const blob = await remoteRes.blob();
          if (blob.type.startsWith('image/')) {
            durableSrc = await fileToDataUrl(blob);
          }
        }
      } catch {
        // Fall back to original URL if fetch/read fails.
      }

      const success = await replaceImageSource(durableSrc);
      if (!success) {
        setError('No image element found in this slide. Select an image or add one first.');
      } else {
        setImageUrlInput('');
      }
    } finally {
      setIsReplacingImage(false);
    }
  };

  const handleReplaceImageFromUpload = async (file: File) => {
    setIsReplacingImage(true);
    setError(null);
    try {
      // Always store as data URL for deterministic rendering after save/reload.
      const nextSrc = await fileToDataUrl(file);
      const success = await replaceImageSource(nextSrc);
      if (!success) {
        setError('No image element found in this slide. Select an image or add one first.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to replace image.');
    } finally {
      setIsReplacingImage(false);
    }
  };

  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
      <EditCanvasAmbient />
      <EditCanvasHeader
        classroomName={stage?.name || ''}
        slideCount={slideScenes.length}
        currentSlideOrder={selectedScene?.order ?? null}
        adminRequired={authReady && !isAdminUser}
        onBack={() => router.push(`/classroom/${encodeURIComponent(classroomId || '')}`)}
      />

      {loading ? (
        <div className="relative z-10 flex flex-1 items-center justify-center p-6">
          <div className={cn('flex flex-col items-center gap-4 rounded-2xl px-10 py-8', editGlassPanel)}>
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Loading editor…</p>
          </div>
        </div>
      ) : error ? (
        <div className="relative z-10 flex flex-1 items-center justify-center p-6">
          <div className={cn('max-w-md text-center rounded-2xl px-8 py-7', editGlassPanel)}>
            <p className="mb-4 text-sm font-medium text-destructive">Error: {error}</p>
            <button
              type="button"
              onClick={() => router.push(`/classroom/${encodeURIComponent(classroomId || '')}`)}
              className={cn(
                'rounded-xl px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-opacity hover:opacity-95',
                editAccentGradient,
              )}
            >
              Return to classroom
            </button>
          </div>
        </div>
      ) : (
        <div className={cn('relative z-10 min-h-0 flex-1 overflow-hidden', editStudioBackdrop)}>
          <EditCanvasPanel
            title="Slides"
            description="Pick a slide to edit"
            icon={LayoutGrid}
            className="z-30 w-full shrink-0 lg:z-10 lg:h-full lg:min-h-0 lg:w-[min(272px,30vw)]"
            headerAction={
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                {slideScenes.length}
              </span>
            }
          >
            <div className={editPanelBody}>
            {/* Mobile: horizontal slide strip */}
            <div className="sticky top-0 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-3 py-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] lg:hidden">
              {slideScenes.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">No slides</p>
              ) : (
                slideScenes.map((scene) => (
                  <EditCanvasSlideButton
                    key={scene.id}
                    order={scene.order}
                    title={scene.title}
                    isActive={scene.id === currentSceneId}
                    layout="horizontal"
                    onSelect={() => setCurrentSceneId(scene.id)}
                  />
                ))
              )}
            </div>

            {/* Desktop: vertical slide list */}
            <div className="hidden min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2 lg:flex">
              {slideScenes.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No slide scenes available for editing.</p>
              ) : (
                slideScenes.map((scene) => (
                  <EditCanvasSlideButton
                    key={scene.id}
                    order={scene.order}
                    title={scene.title}
                    isActive={scene.id === currentSceneId}
                    layout="vertical"
                    onSelect={() => setCurrentSceneId(scene.id)}
                  />
                ))
              )}
            </div>

            {slideRichTextTarget && (
              <div className="shrink-0 border-t border-border/60 bg-muted/15 p-3 sm:p-4 lg:max-h-[min(36vh,280px)] lg:overflow-y-auto">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-primary">Text formatting</p>
                <p className="mb-2 hidden text-[11px] text-muted-foreground sm:block">Selected text box on the canvas.</p>
                <SlideTextRichToolbar
                  elementId={slideRichTextTarget.id}
                  defaultColor={slideRichTextTarget.defaultColor}
                  embedded
                />
              </div>
            )}
            </div>
          </EditCanvasPanel>

          <EditCanvasPanel
            title="Canvas"
            description={selectedScene ? `Editing slide ${selectedScene.order}` : 'Select a slide to start'}
            icon={Layers}
            className="min-h-0 min-w-0 flex-1"
          >
            <div className={cn(editPanelBody, 'p-3 sm:p-4')}>
              <div className="relative flex min-h-[min(48dvh,560px)] flex-1 flex-col lg:min-h-0">
                <div className="pointer-events-none absolute -inset-1 rounded-2xl bg-primary/15 opacity-60 blur-lg" aria-hidden />
                <div className={cn('relative min-h-0 flex-1', editCanvasFrame)}>
                  <div className={editCanvasChromeBar}>
                    <span className="text-xs font-medium text-muted-foreground">Workspace</span>
                    {selectedScene && (
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                        Slide {selectedScene.order}
                      </span>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 bg-muted/20">
                    <SceneProvider>
                      {selectedScene ? (
                        <SceneRenderer scene={selectedScene} mode="autonomous" />
                      ) : (
                        <div className="flex h-[min(44dvh,400px)] w-full flex-col items-center justify-center gap-3 px-6 text-center">
                          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                            <Layers className="size-6 text-primary" aria-hidden />
                          </div>
                          <p className="text-sm font-semibold text-foreground">Select a slide to begin</p>
                          <p className="max-w-xs text-xs text-muted-foreground">
                            Choose a slide from the list, then add overlays from Slide tools.
                          </p>
                        </div>
                      )}
                    </SceneProvider>
                  </div>
                </div>
              </div>
            </div>
          </EditCanvasPanel>

          <div className={cn('w-full shrink-0 lg:w-[min(320px,30vw)] lg:min-h-0', editGlassPanel)}>
              <EditCanvasActionPanel
                onSaveAll={() => void handleSaveAll()}
                isSavingAll={isSavingAll}
                manualSaveNotice={manualSaveNotice}
                onDismissManualSaveNotice={() => setManualSaveNotice(null)}
                onAddTextBox={handleAddSlideTextBox}
                onGenerateFromNarration={handleCreateLiveTextFromSpeech}
                onRebuildScript={() => {
                  if (!selectedScene) return;
                  applySceneUpdate(selectedScene, { recordHistory: true });
                }}
                onUndo={() => void handleUndoHistory()}
                onRedo={() => void handleRedoHistory()}
                canUndoHistory={canUndoHistory}
                canRedoHistory={canRedoHistory}
                rebuildDisabled={!selectedScene}
                onConvertOcr={() => void handleConvertImageTextToEditable()}
                isConvertingOcr={isConvertingOcr}
                onFinalizeReplace={handleFinalizeReplaceOnImage}
                isFinalizing={isFinalizing}
                finalizeSaveNotice={finalizeSaveNotice}
                onDismissFinalizeNotice={() => setFinalizeSaveNotice(null)}
                imageUrlInput={imageUrlInput}
                onImageUrlChange={setImageUrlInput}
                onReplaceFromUrl={() => void handleReplaceImageFromUrl()}
                isReplacingImage={isReplacingImage}
                imageUploadInputRef={imageUploadInputRef}
                onImageFileChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void handleReplaceImageFromUpload(file);
                  e.currentTarget.value = '';
                }}
                onUploadImageClick={() => imageUploadInputRef.current?.click()}
                onDuplicateSelection={handleDuplicateSelection}
                onDeleteSelection={handleDeleteSelection}
                onCenterSelection={handleCenterSelection}
                onAlignLeft={() => handleAlignSelection(ElementAlignCommands.LEFT)}
                onAlignTop={() => handleAlignSelection(ElementAlignCommands.TOP)}
                onBringToFront={() => handleReorderSelection('front')}
                onSendToBack={() => handleReorderSelection('back')}
                onDistributeHorizontally={handleDistributeHorizontally}
                onAddStickyNote={handleAddStickyNote}
                onAddCallout={handleAddCallout}
                onAddHighlightBar={handleAddHighlightBar}
                onAddTitleBanner={handleAddTitleBanner}
                onAddCaption={handleAddCaption}
                onAddArrow={handleAddArrow}
                onAddImportantBadge={handleAddImportantBadge}
                onBoldText={handleBoldText}
                onItalicText={handleItalicText}
                onWidenText={handleWidenText}
                onFlipHorizontal={handleFlipHorizontal}
                onFlipVertical={handleFlipVertical}
                onIncreaseOpacity={() => handleAdjustOpacity(0.12)}
                onDecreaseOpacity={() => handleAdjustOpacity(-0.12)}
                onClearOverlayTexts={handleClearOverlayTexts}
                selectionToolsDisabled={!selectedScene}
              />
          </div>
        </div>
      )}
    </div>
  );
}

