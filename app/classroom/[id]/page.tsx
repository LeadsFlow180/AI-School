'use client';

import { Stage } from '@/components/stage';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { loadImageMapping } from '@/lib/utils/image-storage';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { Scene } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type { Slide } from '@/lib/types/slides';

const log = createLogger('Classroom');

function getGammaGenerationIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/\/api\/gamma\/(?:export|launch|page-image)\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    // Gamma generation IDs are long opaque tokens; reject short IDs (e.g. classroom IDs)
    if (!/^[A-Za-z0-9_-]{18,}$/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

function ensureGammaSpeechActions(scene: Scene): Scene {
  const isGenericGammaLine = (text: string): boolean => {
    const t = text.replace(/\s+/g, ' ').trim().toLowerCase();
    return (
      /^now we are on slide \d+/.test(t) ||
      /^slide \d+ focuses on slide \d+/.test(t) ||
      /^slide \d+ focuses on this key concept in the lesson/.test(t) ||
      /^on this slide, we focus on this key concept in the lesson/.test(t) ||
      /^on this slide, we focus on as we review this section/.test(t) ||
      /^as we review this section, pay attention to the important terms and examples shown here/.test(
        t,
      )
    );
  };

  const existingSpeech = (scene.actions || []).filter((a): a is Action => a.type === 'speech');
  const hasSpeech = existingSpeech.length > 0;
  const hasDynamicSpeech = existingSpeech.some((a) => !isGenericGammaLine(a.text));
  if (hasSpeech && hasDynamicSpeech) {
    return scene;
  }

  const buildDefaultGammaScript = (pageNumber: number, title: string): Action[] => [
    // Avoid tautologies like "Slide 2 focuses on slide 2"
    // by replacing generic slide titles with contextual phrasing.
    ...(() => {
      const normalizedTitle = title.trim();
      const isGenericTitle = /^slide\s+\d+$/i.test(normalizedTitle);
      const topicText = isGenericTitle ? 'this key concept in the lesson' : normalizedTitle;
      return [
        {
          id: `gamma-speech-1-${scene.id}`,
          type: 'speech' as const,
          text: `On this slide, we focus on ${topicText}. I will explain the key idea clearly and simply.`,
        },
        {
          id: `gamma-speech-2-${scene.id}`,
          type: 'speech' as const,
          text: `As we review this section, pay attention to the important terms and examples shown here.`,
        },
      ];
    })(),
  ];

  const pageNumber = Math.max(1, scene.order || 1);
  const title = (scene.title || `slide ${pageNumber}`).replace(/^Gamma Slide\s*/i, 'slide ');
  const nonSpeech = (scene.actions || []).filter((a) => a.type !== 'speech');
  return {
    ...scene,
    actions: [...buildDefaultGammaScript(pageNumber, title), ...nonSpeech],
  };
}

function buildGammaSpeechFromExtractedText(
  sceneId: string,
  pageNumber: number,
  title: string,
  extractedText?: string,
): Action[] {
  const cleaned = (extractedText || '').replace(/\s+/g, ' ').trim();
  const normalizedTitle = title.trim();
  const isGenericTitle = /^slide\s+\d+$/i.test(normalizedTitle);
  const topicText = isGenericTitle ? 'this key concept in the lesson' : normalizedTitle;

  if (!cleaned) {
    return [
      {
        id: `gamma-speech-1-${sceneId}`,
        type: 'speech',
        text: `On this slide, we focus on ${topicText}. I will explain the key idea clearly and simply.`,
      },
      {
        id: `gamma-speech-2-${sceneId}`,
        type: 'speech',
        text: `As we review this section, pay attention to the important terms and examples shown here.`,
      },
    ];
  }

  const sentences = cleaned
    .split(/[.?!]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const first = sentences[0] || cleaned.slice(0, 180);
  const second = sentences.slice(1).join('. ').trim() || cleaned.slice(180, 360).trim();

  return [
    {
      id: `gamma-speech-1-${sceneId}`,
      type: 'speech',
      text: `On slide ${pageNumber}, the main point is: ${first}.`,
    },
    {
      id: `gamma-speech-2-${sceneId}`,
      type: 'speech',
      text: second
        ? `Also note this detail: ${second}. Keep this in mind for the next slide.`
        : `Keep this key idea in mind, because we will apply it on the next slide.`,
    },
  ];
}

function migrateLegacyGammaScenes(scenes: Scene[]): { scenes: Scene[]; changed: boolean } {
  let changed = false;
  const migrated = scenes.map((scene) => {
    const titleLooksGamma = /gamma slide/i.test(scene.title || '');
    if (scene.type === 'interactive') {
      const interactive = scene.content.type === 'interactive' ? scene.content : null;
      const generationIdFromUrl = interactive ? getGammaGenerationIdFromUrl(interactive.url) : null;
      if (!titleLooksGamma && !generationIdFromUrl) return scene;
      if (titleLooksGamma && !generationIdFromUrl) {
        changed = true;
        return ensureGammaSpeechActions({
          ...scene,
          content: {
            type: 'interactive',
            url: '',
            html: `<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;font-family:Inter,Arial,sans-serif;background:#f8fafc;color:#0f172a"><div style="max-width:560px;padding:20px;border:1px solid #e2e8f0;border-radius:12px;background:white"><h3 style="margin:0 0 8px">Gamma slide source unavailable</h3><p style="margin:0;color:#475569">This classroom was saved with an invalid Gamma export reference. Please regenerate this classroom from the prompt to rebuild local slide snapshots.</p></div></body></html>`,
          },
        });
      }
      const withSpeech = ensureGammaSpeechActions(scene);
      if (withSpeech !== scene) changed = true;
      return withSpeech;
    }

    if (scene.type !== 'slide' || scene.content.type !== 'slide') return scene;

    const imageEl = scene.content.canvas.elements.find((el) => el.type === 'image');
    const imageSrc = imageEl && imageEl.type === 'image' ? imageEl.src : '';
    const generationId =
      typeof imageSrc === 'string' && imageSrc.includes('/api/gamma/page-image/')
        ? getGammaGenerationIdFromUrl(imageSrc)
        : null;
    if (!generationId) {
      if (!titleLooksGamma) return scene;
      const withSpeech = ensureGammaSpeechActions(scene);
      if (withSpeech !== scene) changed = true;
      return withSpeech;
    }

    const pageNumber = Math.max(1, scene.order || 1);
    changed = true;
    return ensureGammaSpeechActions({
      ...scene,
      type: 'interactive',
      content: {
        type: 'interactive',
        url: `/api/gamma/export/${encodeURIComponent(generationId)}#page=${pageNumber}&view=FitH`,
      },
      updatedAt: Date.now(),
    });
  });

  return { scenes: migrated, changed };
}

function getGammaExportInfoFromScene(
  scene: Scene,
): { generationId: string; pageNumber: number } | null {
  if (scene.type !== 'interactive' || scene.content.type !== 'interactive') return null;
  const id = getGammaGenerationIdFromUrl(scene.content.url);
  if (!id) return null;
  const hashMatch = scene.content.url.match(/[?#&]page=(\d+)/i);
  const pageNumber = hashMatch ? Number.parseInt(hashMatch[1], 10) : Math.max(1, scene.order || 1);
  return { generationId: id, pageNumber: Number.isFinite(pageNumber) ? pageNumber : 1 };
}

async function convertGammaInteractiveScenesToSlides(scenes: Scene[]): Promise<{
  scenes: Scene[];
  changed: boolean;
}> {
  const gammaInteractive = scenes
    .map((scene) => ({ scene, info: getGammaExportInfoFromScene(scene) }))
    .filter((x) => x.info !== null) as Array<{ scene: Scene; info: { generationId: string; pageNumber: number } }>;

  if (gammaInteractive.length === 0) return { scenes, changed: false };

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const renderedByKey = new Map<string, string>();
  const renderedTextByKey = new Map<string, string>();
  const pdfByGeneration = new Map<string, { numPages: number; getPage: (pageNum: number) => Promise<unknown> }>();

  for (const { info } of gammaInteractive) {
    const key = `${info.generationId}:${info.pageNumber}`;
    if (renderedByKey.has(key)) continue;

    let pdf = pdfByGeneration.get(info.generationId);
    if (!pdf) {
      const exportUrl = `/api/gamma/export/${encodeURIComponent(info.generationId)}`;
      const exportRes = await fetch(exportUrl, { method: 'GET' });
      if (!exportRes.ok) continue;
      const pdfBytes = new Uint8Array(await exportRes.arrayBuffer());
      const task = pdfjs.getDocument({
        data: pdfBytes,
        useWorkerFetch: false,
        isEvalSupported: false,
        disableWorker: true,
      } as never);
      const loaded = await task.promise;
      pdf = loaded as { numPages: number; getPage: (pageNum: number) => Promise<unknown> };
      pdfByGeneration.set(info.generationId, pdf);
    }
    if (info.pageNumber < 1 || info.pageNumber > (pdf.numPages || 0)) continue;
    const page = (await pdf.getPage(info.pageNumber)) as {
      getViewport: (input: { scale: number }) => { width: number; height: number };
      getTextContent: () => Promise<{ items: unknown[] }>;
      render: (input: unknown) => { promise: Promise<void> };
    };
    const textContent = await page.getTextContent();
    const extracted = textContent.items
      .map((item) => {
        if (typeof item === 'object' && item && 'str' in item) {
          return String((item as { str: string }).str || '');
        }
        return '';
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
    renderedTextByKey.set(key, extracted);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) continue;
    await page.render({ canvasContext: context, viewport } as never).promise;
    renderedByKey.set(key, canvas.toDataURL('image/png'));
  }

  let changed = false;
  const converted = scenes.map((scene) => {
    const info = getGammaExportInfoFromScene(scene);
    if (!info) return scene;
    const image = renderedByKey.get(`${info.generationId}:${info.pageNumber}`);
    const extractedText = renderedTextByKey.get(`${info.generationId}:${info.pageNumber}`) || '';
    if (!image) return ensureGammaSpeechActions(scene);

    const canvas: Slide = {
      id: `gamma-runtime-canvas-${scene.id}`,
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: {
        backgroundColor: '#ffffff',
        themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
        fontColor: '#333333',
        fontName: 'Microsoft Yahei',
      },
      elements: [
        {
          type: 'image',
          id: `gamma-runtime-image-${scene.id}`,
          left: 0,
          top: 0,
          width: 1000,
          height: 563,
          rotate: 0,
          fixedRatio: false,
          src: image,
        },
      ],
    };

    changed = true;
    return ensureGammaSpeechActions({
      ...scene,
      type: 'slide',
      content: {
        type: 'slide',
        canvas,
      },
      actions: [
        ...buildGammaSpeechFromExtractedText(
          scene.id,
          info.pageNumber,
          scene.title || `Slide ${info.pageNumber}`,
          extractedText,
        ),
        ...(scene.actions || []).filter((a) => a.type !== 'speech'),
      ],
      updatedAt: Date.now(),
    });
  });

  return { scenes: converted, changed };
}

export default function ClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;

  const { loadFromStorage } = useStageStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generationStartedRef = useRef(false);

  const { generateRemaining, retrySingleOutline, stop } = useSceneGenerator({
    onComplete: () => {
      log.info('[Classroom] All scenes generated');
    },
  });

  const loadClassroom = useCallback(async () => {
    try {
      await loadFromStorage(classroomId);

      // If IndexedDB had no data, try server-side storage (API-generated classrooms)
      if (!useStageStore.getState().stage) {
        log.info('No IndexedDB data, trying Supabase/server fallback for:', classroomId);
        try {
          const supabase = getSupabaseClient();
          let loadedFromSupabase = false;

          if (supabase) {
            const { data, error } = await supabase
              .from('classrooms')
              .select('stage_data, scenes_data')
              .eq('id', classroomId)
              .maybeSingle();

            if (!error && data?.stage_data && Array.isArray(data.scenes_data)) {
              const stage = data.stage_data;
              const scenes = data.scenes_data;
              useStageStore.getState().setStage(stage);
              useStageStore.setState({
                scenes,
                currentSceneId: scenes[0]?.id ?? null,
              });
              loadedFromSupabase = true;
              log.info('Loaded classroom from Supabase:', classroomId);
              console.info(`[Classroom] Loaded ${classroomId} from Supabase.`);
            } else if (error) {
              log.warn('Supabase classroom fetch failed:', error.message);
            }
          }

          if (!loadedFromSupabase) {
            const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
            if (res.ok) {
              const json = await res.json();
              if (json.success && json.classroom) {
                const { stage, scenes } = json.classroom;
                useStageStore.getState().setStage(stage);
                useStageStore.setState({
                  scenes,
                  currentSceneId: scenes[0]?.id ?? null,
                });
                log.info('Loaded from server-side storage:', classroomId);
                console.info(`[Classroom] Loaded ${classroomId} from /api/classroom fallback.`);
              }
            }
          }
        } catch (fetchErr) {
          log.warn('Supabase/server fallback fetch failed:', fetchErr);
        }
      }

      // Restore completed media generation tasks from IndexedDB
      await useMediaGenerationStore.getState().restoreFromDB(classroomId);

      // Backward compatibility: ensure Gamma classrooms use a robust render path
      // and always include speech actions for playback.
      const stageState = useStageStore.getState();
      if (stageState.scenes.length > 0) {
        const migration = migrateLegacyGammaScenes(stageState.scenes);
        let nextScenes = migration.scenes;
        let changed = migration.changed;
        try {
          const converted = await convertGammaInteractiveScenesToSlides(nextScenes);
          nextScenes = converted.scenes;
          changed = changed || converted.changed;
        } catch (err) {
          log.warn('[Classroom] Gamma interactive -> slide conversion failed:', err);
        }

        if (changed) {
          const currentSceneId = stageState.currentSceneId;
          useStageStore.setState({ scenes: nextScenes });
          if (currentSceneId) {
            useStageStore.getState().setCurrentSceneId(currentSceneId);
          }
          await useStageStore.getState().saveToStorage();
        }
      }

      // Restore agents for this stage
      const { loadGeneratedAgentsForStage, useAgentRegistry } =
        await import('@/lib/orchestration/registry/store');
      const generatedAgentIds = await loadGeneratedAgentsForStage(classroomId);
      const { useSettingsStore } = await import('@/lib/store/settings');
      if (generatedAgentIds.length > 0) {
        // Auto mode — use generated agents from IndexedDB
        useSettingsStore.getState().setAgentMode('auto');
        useSettingsStore.getState().setSelectedAgentIds(generatedAgentIds);
      } else {
        // Preset mode — restore agent IDs saved in the stage at creation time.
        // Filter out any stale generated IDs that may have been persisted before
        // the bleed-fix, so they don't resolve against a leftover registry entry.
        const stage = useStageStore.getState().stage;
        const stageAgentIds = stage?.agentIds;
        const registry = useAgentRegistry.getState();
        const cleanIds = stageAgentIds?.filter((id) => {
          const a = registry.getAgent(id);
          return a && !a.isGenerated;
        });
        useSettingsStore.getState().setAgentMode('preset');
        useSettingsStore
          .getState()
          .setSelectedAgentIds(
            cleanIds && cleanIds.length > 0 ? cleanIds : ['default-1', 'default-2', 'default-3'],
          );
      }
    } catch (error) {
      log.error('Failed to load classroom:', error);
      setError(error instanceof Error ? error.message : 'Failed to load classroom');
    } finally {
      setLoading(false);
    }
  }, [classroomId, loadFromStorage]);

  useEffect(() => {
    // Reset loading state on course switch to unmount Stage during transition,
    // preventing stale data from syncing back to the new course
    setLoading(true);
    setError(null);
    generationStartedRef.current = false;

    // Clear previous classroom's media tasks to prevent cross-classroom contamination.
    // Placeholder IDs (gen_img_1, gen_vid_1) are NOT globally unique across stages,
    // so stale tasks from a previous classroom would shadow the new one's.
    const mediaStore = useMediaGenerationStore.getState();
    mediaStore.revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // Clear whiteboard history to prevent snapshots from a previous course leaking in.
    useWhiteboardHistoryStore.getState().clearHistory();

    loadClassroom();

    // Cancel ongoing generation when classroomId changes or component unmounts
    return () => {
      stop();
    };
  }, [classroomId, loadClassroom, stop]);

  // Auto-resume generation for pending outlines
  useEffect(() => {
    if (loading || error || generationStartedRef.current) return;

    const state = useStageStore.getState();
    const { outlines, scenes, stage } = state;

    // Check if there are pending outlines
    const completedOrders = new Set(scenes.map((s) => s.order));
    const hasPending = outlines.some((o) => !completedOrders.has(o.order));

    if (hasPending && stage) {
      generationStartedRef.current = true;

      // Load generation params from sessionStorage (stored by generation-preview before navigating)
      const genParamsStr = sessionStorage.getItem('generationParams');
      const params = genParamsStr ? JSON.parse(genParamsStr) : {};

      // Reconstruct imageMapping from IndexedDB using pdfImages storageIds
      const storageIds = (params.pdfImages || [])
        .map((img: { storageId?: string }) => img.storageId)
        .filter(Boolean);

      loadImageMapping(storageIds).then((imageMapping) => {
        generateRemaining({
          pdfImages: params.pdfImages,
          imageMapping,
          stageInfo: {
            name: stage.name || '',
            description: stage.description,
            language: stage.language,
            style: stage.style,
          },
          agents: params.agents,
          userProfile: params.userProfile,
        });
      });
    } else if (outlines.length > 0 && stage) {
      // All scenes are generated, but some media may not have finished.
      // Resume media generation for any tasks not yet in IndexedDB.
      // generateMediaForOutlines skips already-completed tasks automatically.
      generationStartedRef.current = true;
      generateMediaForOutlines(outlines, stage.id).catch((err) => {
        log.warn('[Classroom] Media generation resume error:', err);
      });
    }
  }, [loading, error, generateRemaining]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="h-screen flex flex-col overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center text-muted-foreground">
                <p>Loading classroom...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center">
                <p className="text-destructive mb-4">Error: {error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    loadClassroom();
                  }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <Stage onRetryOutline={retrySingleOutline} />
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
