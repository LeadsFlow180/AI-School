'use client';

import { Stage } from '@/components/stage';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { loadImageMapping } from '@/lib/utils/image-storage';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { getSupabaseClient } from '@/lib/supabase/client';
import { ClassroomLoadingScene } from '@/components/stage/classroom-loading-scene';
import { ClassroomTourOverlay } from '@/components/stage/classroom-tour-overlay';

const log = createLogger('Classroom');
const MIN_LOADING_SCENE_MS = 3400;

export default function ClassroomDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawParamId = params?.id;
  const classroomId = Array.isArray(rawParamId) ? rawParamId[0] : rawParamId;

  const { loadFromStorage, clearStore } = useStageStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  const generationStartedRef = useRef(false);

  const { generateRemaining, retrySingleOutline, stop } = useSceneGenerator({
    onComplete: () => {
      log.info('[Classroom] All scenes generated');
    },
  });

  const loadClassroom = useCallback(async () => {
    const loadingStartedAt = Date.now();
    try {
      if (!classroomId) {
        throw new Error('Missing classroom id in route');
      }

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

      const loadedStageId = useStageStore.getState().stage?.id;
      if (loadedStageId !== classroomId) {
        throw new Error(`Classroom "${classroomId}" was not found.`);
      }

      // Restore completed media generation tasks from IndexedDB
      await useMediaGenerationStore.getState().restoreFromDB(classroomId);
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
      // Keep the cinematic loading scene on screen long enough for
      // characters to finish their entrance before showing the classroom UI.
      const elapsed = Date.now() - loadingStartedAt;
      const remaining = Math.max(0, MIN_LOADING_SCENE_MS - elapsed);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      setLoading(false);
    }
  }, [classroomId, loadFromStorage]);

  useEffect(() => {
    if (!classroomId) {
      setError('Missing classroom id in route');
      setLoading(false);
      return;
    }

    // Reset loading state on course switch to unmount Stage during transition,
    // preventing stale data from syncing back to the new course
    setLoading(true);
    setError(null);
    generationStartedRef.current = false;
    clearStore();

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
  }, [classroomId, clearStore, loadClassroom, stop]);

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

  useEffect(() => {
    if (loading || error || !classroomId) return;
    const forceTour = searchParams?.get('tour') === '1';
    setTourOpen(forceTour);
  }, [loading, error, classroomId, searchParams]);

  const handleFinishTour = useCallback(() => {
    setTourOpen(false);
    if (searchParams?.get('tour') === '1') {
      router.replace(`/classroom/${encodeURIComponent(classroomId)}`);
    }
  }, [classroomId, router, searchParams]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="h-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
          {loading ? (
            <ClassroomLoadingScene />
          ) : error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center rounded-2xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
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
            <>
              <Stage
                onRetryOutline={retrySingleOutline}
                onOpenGuidance={tourOpen ? undefined : () => setTourOpen(true)}
              />
              <ClassroomTourOverlay open={tourOpen} onFinish={handleFinishTour} />
            </>
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
