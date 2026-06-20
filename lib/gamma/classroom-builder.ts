import { nanoid } from 'nanoid';
import { useSettingsStore } from '@/lib/store/settings';
import { useStageStore } from '@/lib/store/stage';
import { syncClassroomToSupabase } from '@/lib/supabase/classroom-sync';
import { getSessionSafe, getSupabaseClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/utils/database';
import type { QuizQuestion, Scene, Stage } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type { Slide } from '@/lib/types/slides';
import type { TutorGenerationConfig } from '@/lib/types/tutor-voice';
import { resolveEffectiveTTSRequest } from '@/lib/audio/resolve-effective-tts';
import { requestTTSWithJobPolling } from '@/lib/audio/tts-job-client';
import { splitLongSpeechActions } from '@/lib/audio/tts-utils';
import type { GammaGenerationStepId } from '@/lib/gamma/types';

const log = createLogger('GammaClassroom');

type GammaJson = {
  success?: boolean;
  error?: string;
  details?: string;
  generationId?: string;
  status?: string;
  gammaUrl?: string;
  pageCount?: number;
};

type GammaScriptJson = {
  success?: boolean;
  scripts?: Array<{ pageNumber: number; lines: string[] }>;
  error?: string;
  details?: string;
};

type GammaQuizJson = {
  success?: boolean;
  quizzes?: Array<{ afterPageNumber: number; questions: QuizQuestion[] }>;
  error?: string;
  details?: string;
};

export interface GammaClassroomProgress {
  stepId: GammaGenerationStepId;
  statusMessage: string;
}

export interface BuildGammaClassroomInput {
  prompt: string;
  language: 'zh-CN' | 'en-US';
  enableRAG?: boolean;
  tutorConfig?: TutorGenerationConfig;
  onProgress?: (progress: GammaClassroomProgress) => void;
  signal?: AbortSignal;
}

function formatGammaError(json: { error?: string; details?: string }, fallback: string): string {
  const message = json.error?.trim() || fallback;
  return json.details?.trim() ? `${message} — ${json.details.trim()}` : message;
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Gamma generation aborted', 'AbortError');
  }
}

async function uploadSpeechAudioForClassroom(
  classroomId: string,
  audioId: string,
  blob: Blob,
): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const session = await getSessionSafe(supabase);
  const token = session?.access_token;
  if (!token) return null;

  const ext = blob.type.includes('wav')
    ? 'wav'
    : blob.type.includes('mpeg') || blob.type.includes('mp3')
      ? 'mp3'
      : blob.type.includes('ogg')
        ? 'ogg'
        : blob.type.includes('webm')
          ? 'webm'
          : 'bin';
  const file = new File([blob], `${audioId}.${ext}`, { type: blob.type || 'audio/mpeg' });
  const form = new FormData();
  form.append('file', file);
  form.append('classroomId', classroomId);

  const res = await fetch('/api/classroom/media-upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success || !json?.src) return null;
  return String(json.src);
}

async function loadPdfJsWithWorker() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerUrl = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  if (pdfjs.GlobalWorkerOptions?.workerSrc !== workerUrl) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return pdfjs;
}

async function renderGammaPdfPagesToImages(
  generationId: string,
  pageCountHint: number,
): Promise<{ images: string[]; pageTexts: string[]; pageCount: number }> {
  const exportUrl = `/api/gamma/export/${encodeURIComponent(generationId)}`;
  const exportRes = await fetch(exportUrl, { method: 'GET' });
  if (!exportRes.ok) {
    throw new Error(`Failed to download Gamma export PDF (${exportRes.status})`);
  }
  const pdfBytes = new Uint8Array(await exportRes.arrayBuffer());
  const pdfjs = await loadPdfJsWithWorker();
  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    useWorkerFetch: false,
    isEvalSupported: false,
  } as never);
  const pdf = await loadingTask.promise;

  const pageCount = Math.max(1, Math.min(50, Math.min(pdf.numPages || 1, pageCountHint || 50)));
  const images: string[] = [];
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    try {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const rawText = textContent.items
        .map((item) => {
          if (typeof item === 'object' && item && 'str' in item) {
            return String((item as { str: string }).str || '');
          }
          return '';
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      pageTexts.push(rawText.slice(0, 2500));

      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not create canvas context for PDF rendering');
      await page.render({ canvasContext: context, viewport } as never).promise;
      images.push(canvas.toDataURL('image/png'));
    } catch {
      try {
        const pageRes = await fetch(
          `/api/gamma/page-image/${encodeURIComponent(generationId)}/${pageNumber}`,
          { method: 'GET' },
        );
        if (!pageRes.ok) {
          images.push('');
          pageTexts.push('');
          continue;
        }
        const blob = await pageRes.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () =>
            reject(new Error('Could not convert Gamma page image to data URL'));
          reader.readAsDataURL(blob);
        });
        images.push(dataUrl);
        pageTexts.push('');
      } catch {
        images.push('');
        pageTexts.push('');
      }
    }
  }

  return { images, pageTexts, pageCount };
}

function getAiHeaders() {
  const settings = useSettingsStore.getState();
  const selectedProviderId = settings.providerId;
  const selectedModelId = settings.modelId;
  const selectedProvider = settings.providersConfig[selectedProviderId];
  return {
    'Content-Type': 'application/json',
    'x-model': `${selectedProviderId}:${selectedModelId}`,
    'x-api-key': selectedProvider?.apiKey || '',
    'x-base-url': selectedProvider?.baseUrl || '',
    'x-provider-type': selectedProvider?.type || '',
    'x-requires-api-key': selectedProvider?.requiresApiKey ? 'true' : 'false',
  };
}

async function generateGammaScriptsByAI(
  lessonTitle: string,
  pageTexts: string[],
  language: 'zh-CN' | 'en-US',
): Promise<Map<number, string[]>> {
  const res = await fetch('/api/gamma/scripts', {
    method: 'POST',
    headers: getAiHeaders(),
    body: JSON.stringify({
      lessonTitle,
      language,
      slides: pageTexts.map((text, idx) => ({
        pageNumber: idx + 1,
        title: `Slide ${idx + 1}`,
        text: text || '',
      })),
    }),
  });
  const json = (await res.json()) as GammaScriptJson;
  if (!res.ok) {
    throw new Error(formatGammaError(json, `Gamma script API failed (${res.status})`));
  }
  if (!json.success || !Array.isArray(json.scripts)) {
    throw new Error(formatGammaError(json, 'Gamma script generation failed'));
  }

  const map = new Map<number, string[]>();
  for (const s of json.scripts) {
    if (!Number.isFinite(s.pageNumber) || s.pageNumber < 1) continue;
    const lines = Array.isArray(s.lines)
      ? s.lines
          .map((l) => String(l || '').trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];
    if (lines.length > 0) map.set(s.pageNumber, lines);
  }
  return map;
}

async function generateGammaQuizzesByAI(
  lessonTitle: string,
  pageTexts: string[],
): Promise<Map<number, QuizQuestion[]>> {
  const res = await fetch('/api/gamma/quizzes', {
    method: 'POST',
    headers: getAiHeaders(),
    body: JSON.stringify({
      lessonTitle,
      slides: pageTexts.map((text, idx) => ({
        pageNumber: idx + 1,
        title: `Slide ${idx + 1}`,
        text: text || '',
      })),
    }),
  });
  const json = (await res.json()) as GammaQuizJson;
  if (!res.ok) {
    throw new Error(formatGammaError(json, `Gamma quiz API failed (${res.status})`));
  }
  if (!json.success || !Array.isArray(json.quizzes)) {
    throw new Error(formatGammaError(json, 'Gamma quiz generation failed'));
  }

  const map = new Map<number, QuizQuestion[]>();
  for (const quiz of json.quizzes) {
    if (!Number.isFinite(quiz.afterPageNumber) || quiz.afterPageNumber < 1) continue;
    if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) continue;
    const normalizedQuestions = quiz.questions
      .map((q) => ({
        id: q.id || nanoid(10),
        type: q.type === 'multiple' ? ('multiple' as const) : ('single' as const),
        question: String(q.question || '').trim(),
        options: Array.isArray(q.options)
          ? q.options
              .map((opt) => ({
                label: String(opt?.label || '').trim(),
                value: String(opt?.value || '').trim(),
              }))
              .filter((opt) => opt.label && opt.value)
              .slice(0, 4)
          : [],
        answer: Array.isArray(q.answer)
          ? q.answer
              .map((a) => String(a || '').trim())
              .filter(Boolean)
              .slice(0, 2)
          : [],
        analysis:
          String(q.analysis || '').trim() || 'Review the key concept from the previous slides.',
        hasAnswer: true,
        points: Number.isFinite(q.points) ? Math.max(1, Number(q.points)) : 1,
      }))
      .filter((q) => q.question.length > 0 && q.options.length >= 2 && q.answer.length >= 1);
    if (normalizedQuestions.length > 0) {
      map.set(quiz.afterPageNumber, normalizedQuestions.slice(0, 10));
    }
  }

  return map;
}

function buildGammaSlideSpeech(pageNumber: number, pageText?: string): string {
  const cleaned = (pageText || '').trim();
  if (!cleaned) {
    return `For slide ${pageNumber}, we will connect this part to the lesson goal and focus on the most important takeaway before moving on.`;
  }
  const normalized = cleaned.replace(/\s+/g, ' ').trim();
  const snippet = normalized.slice(0, 180);
  return `On slide ${pageNumber}, notice this key content: ${snippet}. I will break it down step by step and explain why it matters.`;
}

function buildGammaSlideScript(
  pageNumber: number,
  pageText: string,
  lessonTitle: string,
): string[] {
  const cleaned = pageText
    .replace(/^on slide\s+\d+\s*,?\s*we focus on\s*/i, '')
    .replace(/^slide\s+\d+\s+focuses on\s*/i, '')
    .trim();
  if (!cleaned) {
    return [
      `This is slide ${pageNumber} in our lesson on ${lessonTitle}. I will explain the visual content and the key takeaway for this section.`,
      `As you watch this slide, focus on the main concept and how it connects with the previous part of the lesson.`,
      `After this explanation, you should be able to summarize the central idea in your own words.`,
    ];
  }

  const normalized = cleaned.replace(/\s+/g, ' ').trim();
  const chunks = normalized
    .split(/[.?!]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const primary = chunks[0] || normalized.slice(0, 180);
  const secondary = chunks.slice(1).join('. ').slice(0, 220);

  return [
    `Slide ${pageNumber} covers: ${primary}.`,
    secondary
      ? `In this part, notice that ${secondary}. Think about why this matters before we move on.`
      : `Pay attention to the examples and structure shown here, because they are important for understanding the next slide.`,
    `Try to identify one key term or relationship from this slide that you can reuse in the next section.`,
  ];
}

async function fetchGammaPageImageDataUrl(
  generationId: string,
  pageNumber: number,
): Promise<string | null> {
  const pageRes = await fetch(
    `/api/gamma/page-image/${encodeURIComponent(generationId)}/${pageNumber}`,
    { method: 'GET' },
  );
  if (!pageRes.ok) return null;
  const blob = await pageRes.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not convert Gamma page image to data URL'));
    reader.readAsDataURL(blob);
  });
  return dataUrl || null;
}

async function fillMissingGammaPageImages(
  generationId: string,
  images: string[],
  pageCount: number,
): Promise<string[]> {
  const out = [...images];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    if (out[pageNumber - 1]) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const image = await fetchGammaPageImageDataUrl(generationId, pageNumber);
        if (image) {
          out[pageNumber - 1] = image;
          break;
        }
      } catch {
        // retry
      }
    }
  }
  return out;
}

export async function buildClassroomFromGamma(
  input: BuildGammaClassroomInput,
): Promise<{ stageId: string }> {
  const { prompt, language, enableRAG, tutorConfig, onProgress, signal } = input;
  const report = (stepId: GammaGenerationStepId, statusMessage: string) => {
    onProgress?.({ stepId, statusMessage });
  };

  report('gamma-create', 'Starting Gamma presentation generation...');
  assertNotAborted(signal);

  const startRes = await fetch('/api/gamma/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: prompt.trim(),
      numCards: 10,
      exportAs: 'pdf',
      textMode: 'generate',
      format: 'presentation',
      enableRAG: enableRAG || undefined,
    }),
    signal,
  });
  const startData = (await startRes.json()) as GammaJson;
  if (!startRes.ok || !startData.success || !startData.generationId) {
    throw new Error(formatGammaError(startData, 'Could not start Gamma generation'));
  }

  report('gamma-wait', 'Gamma is building your slides. This may take a few minutes...');
  let last: GammaJson = {};
  for (let i = 0; i < 120; i++) {
    assertNotAborted(signal);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const pollRes = await fetch(`/api/gamma/generations/${startData.generationId}`, { signal });
    last = (await pollRes.json()) as GammaJson;
    if (!pollRes.ok || !last.success) {
      throw new Error(formatGammaError(last, 'Gamma polling failed'));
    }
    if (last.status === 'completed' || last.status === 'failed') break;
    report(
      'gamma-wait',
      last.status === 'processing'
        ? 'Gamma is still generating your presentation...'
        : `Gamma status: ${last.status || 'pending'}`,
    );
  }

  if (last.status !== 'completed' || !last.gammaUrl) {
    throw new Error(
      formatGammaError(last, last.status === 'failed' ? 'Gamma generation failed' : 'Gamma generation timed out'),
    );
  }

  const settings = useSettingsStore.getState();
  const now = Date.now();
  const stageId = nanoid(10);
  const stage: Stage & { tutorConfig?: TutorGenerationConfig } = {
    id: stageId,
    name: prompt.trim().slice(0, 120) || 'Gamma Presentation',
    description: 'Generated via Gamma AI',
    createdAt: now,
    updatedAt: now,
    language,
    style: 'professional',
    ...(tutorConfig ? { tutorConfig } : {}),
  };

  report('gamma-slides', 'Converting Gamma slides into classroom pages...');
  assertNotAborted(signal);

  const pageCountHint = Math.max(1, Math.min(50, Math.floor(last.pageCount ?? 1)));
  let renderedPageImages: string[] = [];
  let renderedPageTexts: string[] = [];
  let resolvedPageCount = pageCountHint;
  try {
    const rendered = await renderGammaPdfPagesToImages(startData.generationId, pageCountHint);
    renderedPageImages = rendered.images;
    renderedPageTexts = rendered.pageTexts;
    resolvedPageCount = rendered.pageCount;
  } catch (error) {
    log.warn('[gamma] page image download failed', error);
  }

  renderedPageImages = await fillMissingGammaPageImages(
    startData.generationId,
    renderedPageImages,
    resolvedPageCount,
  );

  const missingPages = renderedPageImages
    .map((img, idx) => ({ idx, ok: typeof img === 'string' && img.length > 0 }))
    .filter((x) => !x.ok)
    .map((x) => x.idx + 1);
  if (missingPages.length > 0) {
    throw new Error(
      `Could not prepare local slide snapshots for pages: ${missingPages.join(', ')}. Please retry generation.`,
    );
  }

  report('gamma-scripts', 'Generating tutor narration for each slide...');
  assertNotAborted(signal);

  let aiScripts = new Map<number, string[]>();
  try {
    aiScripts = await generateGammaScriptsByAI(stage.name, renderedPageTexts, language);
  } catch (error) {
    log.warn('[gamma] ai script generation failed, using fallback scripts', error);
  }

  report('gamma-quizzes', 'Adding knowledge-check quizzes between slides...');
  assertNotAborted(signal);

  let aiQuizzes = new Map<number, QuizQuestion[]>();
  try {
    aiQuizzes = await generateGammaQuizzesByAI(stage.name, renderedPageTexts);
  } catch (error) {
    log.warn('[gamma] ai quiz generation failed, continuing without quizzes', error);
  }

  const pageCount = resolvedPageCount;
  const slideScenes: Scene[] = Array.from({ length: pageCount }, (_, idx) => {
    const pageNumber = idx + 1;
    const pageImage = renderedPageImages[idx];
    const pageText = renderedPageTexts[idx];
    const slideScript =
      aiScripts.get(pageNumber) ||
      buildGammaSlideScript(pageNumber, pageText || '', stage.name || 'this topic');
    const narrationLines =
      slideScript.length > 0
        ? slideScript
        : [buildGammaSlideSpeech(pageNumber, pageText), buildGammaSlideSpeech(pageNumber, pageText)];
    const narrationActions = narrationLines
      .map((line) => line.trim())
      .filter(Boolean)
      .map(
        (line) =>
          ({
            id: nanoid(10),
            type: 'speech',
            text: line,
          }) as Action,
      );
    return {
      id: nanoid(12),
      stageId,
      type: 'slide',
      title: `Gamma Slide ${pageNumber}`,
      order: pageNumber,
      content: {
        type: 'slide',
        canvas: {
          id: nanoid(12),
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
              id: nanoid(12),
              left: 0,
              top: 0,
              width: 1000,
              height: 563,
              rotate: 0,
              fixedRatio: false,
              src: pageImage,
            },
          ],
        } as Slide,
      },
      actions:
        pageNumber === 1
          ? ([
              {
                id: nanoid(10),
                type: 'speech',
                text: `Welcome everyone. We will learn ${stage.name} together. I will guide you through each slide and explain the key concepts clearly.`,
              },
              ...narrationActions,
              {
                id: nanoid(10),
                type: 'discussion',
                topic: 'Let us begin with your first impressions of this topic.',
                prompt:
                  'Ask the student one warm-up question about the lesson topic and respond supportively.',
              },
            ] as Action[])
          : (narrationActions as Action[]),
      createdAt: now,
      updatedAt: now,
    };
  });

  const scenes: Scene[] = [];
  for (const slideScene of slideScenes) {
    scenes.push(slideScene);
    const afterPageNumber = slideScene.order;
    const quizQuestions = aiQuizzes.get(afterPageNumber);
    if (!quizQuestions || quizQuestions.length === 0) continue;
    scenes.push({
      id: nanoid(12),
      stageId,
      type: 'quiz',
      title: `Quick Check ${afterPageNumber}`,
      order: scenes.length + 1,
      content: {
        type: 'quiz',
        questions: quizQuestions,
      },
      actions: [
        {
          id: nanoid(10),
          type: 'speech',
          text: 'Great progress. Let us do a quick quiz to check your understanding before we continue.',
        },
      ] as Action[],
      createdAt: now,
      updatedAt: now,
    });
  }
  scenes.forEach((scene, index) => {
    scene.order = index + 1;
  });

  if (settings.ttsEnabled) {
    report('gamma-tts', 'Generating tutor voice audio for narration...');
    assertNotAborted(signal);

    const ttsRequest = resolveEffectiveTTSRequest(stage.tutorConfig?.voicePreset);
    if (ttsRequest) {
      for (const scene of scenes) {
        assertNotAborted(signal);
        const splitActions = splitLongSpeechActions(scene.actions || [], ttsRequest.providerId);
        if (splitActions.length !== (scene.actions || []).length) {
          scene.actions = splitActions;
        }
        const speechActions = (scene.actions || []).filter(
          (a): a is Action & { type: 'speech'; text: string } => a.type === 'speech' && !!a.text,
        );
        for (const action of speechActions) {
          const audioId = `tts_${action.id}`;
          action.audioId = audioId;
          try {
            const ttsData = await requestTTSWithJobPolling(
              {
                text: action.text,
                audioId,
                ttsProviderId: ttsRequest.providerId,
                ttsVoice: ttsRequest.voiceId,
                ttsSpeed: ttsRequest.speed,
                ttsApiKey: ttsRequest.apiKey,
                ttsBaseUrl: ttsRequest.baseUrl,
              },
              { maxWaitMs: 120_000, intervalMs: 1_500 },
            );
            if (!ttsData?.success || !ttsData?.base64 || !ttsData?.format) continue;
            const binary = atob(ttsData.base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: `audio/${ttsData.format}` });
            await db.audioFiles.put({
              id: audioId,
              blob,
              format: ttsData.format,
              createdAt: Date.now(),
            });
            try {
              const uploadedUrl = await uploadSpeechAudioForClassroom(stage.id, audioId, blob);
              if (uploadedUrl) {
                action.audioUrl = uploadedUrl;
              }
            } catch (gammaUploadErr) {
              log.warn('[gamma] failed to upload tutor speech clip', gammaUploadErr);
            }
          } catch (gammaTTSError) {
            log.warn('[gamma] failed to pre-generate tutor speech', gammaTTSError);
          }
        }
      }
    }
  }

  report('gamma-save', 'Saving your classroom...');
  assertNotAborted(signal);

  const stageStore = useStageStore.getState();
  stageStore.setStage(stage);
  scenes.forEach((scene) => stageStore.addScene(scene));
  stageStore.setCurrentSceneId(scenes[0].id);
  await stageStore.saveToStorage();

  try {
    await syncClassroomToSupabase({
      stage,
      scenes,
      chats: [],
    });
  } catch (syncError) {
    log.warn('[gamma] explicit supabase sync failed', syncError);
  }

  return { stageId };
}
