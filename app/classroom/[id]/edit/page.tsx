'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { useStageStore } from '@/lib/store';
import { useCanvasStore } from '@/lib/store/canvas';
import { SceneRenderer } from '@/components/stage/scene-renderer';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { getSessionSafe, getSupabaseClient } from '@/lib/supabase/client';
import type { Scene } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type { PPTElement } from '@/lib/types/slides';
import { nanoid } from 'nanoid';

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

  const [authReady, setAuthReady] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isConvertingOcr, setIsConvertingOcr] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isReplacingImage, setIsReplacingImage] = useState(false);
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const scriptSyncGuardRef = useRef(false);
  const persistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    applySceneUpdate(nextScene);
  };

  const handleUpdateSceneTitle = (value: string) => {
    if (!selectedScene) return;
    applySceneUpdate({
      ...selectedScene,
      title: value,
      updatedAt: Date.now(),
    });
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

  const applySceneUpdate = (scene: Scene, options?: { refreshTutorScript?: boolean }) => {
    const next = options?.refreshTutorScript === false ? scene : rebuildTutorScript(scene);
    // Mark as explicitly edited so classroom runtime does not auto-regenerate
    // Gamma/default scripts repeatedly on every load.
    const lockedScene = {
      ...next,
      __editedInCanvas: true,
      __scriptLocked: true,
    } as Scene;
    updateScene(lockedScene.id, lockedScene);

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
    applySceneUpdate({
      ...selectedScene,
      actions: nextActions,
      updatedAt: Date.now(),
    }, { refreshTutorScript: false });
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

    applySceneUpdate({
      ...selectedScene,
      content: {
        ...selectedScene.content,
        canvas: {
          ...selectedScene.content.canvas,
          elements: nextElements,
        },
      },
      updatedAt: Date.now(),
    });
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

    applySceneUpdate({
      ...selectedScene,
      content: {
        ...selectedScene.content,
        canvas: {
          ...selectedScene.content.canvas,
          elements: nextElements,
        },
      },
      updatedAt: Date.now(),
    });
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

    setIsFinalizing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 563;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

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

      applySceneUpdate({
        ...selectedScene,
        content: {
          ...selectedScene.content,
          canvas: {
            ...selectedScene.content.canvas,
            elements: nextElements,
          },
        },
        updatedAt: Date.now(),
      });
    } catch (e) {
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

      const lines = (result.data?.lines || []).filter((line) => (line.text || '').trim().length > 0);
      if (lines.length === 0) return;

      const ocrW = result.data?.width || 1;
      const ocrH = result.data?.height || 1;

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

      applySceneUpdate({
        ...selectedScene,
        content: {
          ...selectedScene.content,
          canvas: {
            ...selectedScene.content.canvas,
            elements: [...elements, ...overlayElements],
          },
        },
        updatedAt: Date.now(),
      });
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
    applySceneUpdate({
      ...selectedScene,
      content: {
        ...selectedScene.content,
        canvas: {
          ...selectedScene.content.canvas,
          elements: nextElements,
        },
      },
      updatedAt: Date.now(),
    });
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
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push(`/classroom/${encodeURIComponent(classroomId || '')}`)}
            className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors"
          >
            Back
          </button>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-slate-500 font-bold">Edit in Canvas</div>
            <div className="text-sm font-bold text-slate-900 truncate">{stage?.name || ''}</div>
          </div>
        </div>
        <div className="text-xs text-slate-500 font-semibold">
          {authReady && !isAdminUser ? 'Admin only' : ''}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-slate-700 text-sm font-semibold">Loading editor...</div>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center rounded-2xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
            <p className="text-destructive mb-4">Error: {error}</p>
            <button
              onClick={() => router.push(`/classroom/${encodeURIComponent(classroomId || '')}`)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Return
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Slide list */}
          <aside className="w-[260px] border-r border-slate-200 bg-white overflow-auto">
            <div className="p-4 border-b border-slate-200">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Slides</div>
            </div>
            <div className="p-2">
              {slideScenes.length === 0 ? (
                <div className="text-sm text-slate-600 p-3">No slide scenes available for editing.</div>
              ) : (
                slideScenes.map((scene) => {
                  const isActive = scene.id === currentSceneId;
                  return (
                    <button
                      key={scene.id}
                      onClick={() => setCurrentSceneId(scene.id)}
                      className={[
                        'w-full text-left px-3 py-2 rounded-xl border mb-2 transition-colors',
                        isActive
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          : 'border-transparent hover:border-slate-200 bg-transparent text-slate-800',
                      ].join(' ')}
                    >
                      <div className="text-[11px] font-bold text-slate-500">
                        Slide {scene.order}
                      </div>
                      <div className="text-sm font-semibold truncate">{scene.title}</div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Canvas editor */}
          <main className="flex-1 min-w-0 min-h-0 bg-slate-50 dark:bg-slate-950 overflow-auto p-4">
            <div className="mb-3 rounded-xl border border-slate-200 bg-white p-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAddSlideTextBox}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 transition-colors"
              >
                Add live text box
              </button>
              <button
                type="button"
                onClick={handleCreateLiveTextFromSpeech}
                className="rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-2 transition-colors"
              >
                Generate text from narration
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedScene) return;
                  applySceneUpdate(selectedScene);
                }}
                className="rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-semibold px-3 py-2 transition-colors"
              >
                Rebuild AI tutor script
              </button>
              <button
                type="button"
                disabled={isConvertingOcr}
                onClick={() => {
                  void handleConvertImageTextToEditable();
                }}
                className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 transition-colors"
              >
                {isConvertingOcr ? 'Converting OCR...' : 'Convert image text to editable'}
              </button>
              <button
                type="button"
                disabled={isFinalizing}
                onClick={() => {
                  void handleFinalizeReplaceOnImage();
                }}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 transition-colors"
              >
                {isFinalizing ? 'Finalizing...' : 'Finalize replace'}
              </button>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 bg-slate-50">
                <input
                  type="url"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  placeholder="Paste image URL to replace selected image"
                  className="w-[320px] max-w-[60vw] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                />
                <button
                  type="button"
                  disabled={isReplacingImage || !imageUrlInput.trim()}
                  onClick={() => {
                    void handleReplaceImageFromUrl();
                  }}
                  className="rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 transition-colors"
                >
                  {isReplacingImage ? 'Replacing...' : 'Replace via URL'}
                </button>
                <input
                  ref={imageUploadInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void handleReplaceImageFromUpload(file);
                    e.currentTarget.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={isReplacingImage}
                  onClick={() => imageUploadInputRef.current?.click()}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 transition-colors"
                >
                  Upload image
                </button>
              </div>
            </div>
            <div className="w-full h-full min-h-[320px] flex items-center justify-center">
              <div className="w-full h-full aspect-[16/9] bg-white dark:bg-gray-800 shadow-2xl rounded-lg overflow-visible relative">
                <SceneProvider>
                  {selectedScene ? (
                    <SceneRenderer scene={selectedScene} mode="autonomous" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-slate-600">
                      Select a slide to edit
                    </div>
                  )}
                </SceneProvider>
              </div>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

