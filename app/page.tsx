'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ImagePlus,
  Pencil,
  Trash2,
  Settings,
  Sun,
  Moon,
  Monitor,
  BotOff,
  ChevronUp,
  Database,
  UserRound,
  LogOut,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { createLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Textarea as UITextarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SettingsDialog } from '@/components/settings';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { AgentBar } from '@/components/agent/agent-bar';
import { useTheme } from '@/lib/hooks/use-theme';
import { nanoid } from 'nanoid';
import { storePdfBlob } from '@/lib/utils/image-storage';
import type { UserRequirements } from '@/lib/types/generation';
import { useSettingsStore } from '@/lib/store/settings';
import { useStageStore } from '@/lib/store/stage';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import {
  StageListItem,
  listStages,
  deleteStageData,
  getFirstSlideByStages,
} from '@/lib/utils/stage-storage';
import { ThumbnailSlide } from '@/components/slide-renderer/components/ThumbnailSlide';
import type { Slide } from '@/lib/types/slides';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { SpeechButton } from '@/components/audio/speech-button';
import { clearSupabaseAuthStorage, getSessionSafe, getSupabaseClient } from '@/lib/supabase/client';
import { KidsGuideOverlay } from '@/components/stage/kids-guide-overlay';
import { KidsParallaxBackground } from '@/components/stage/kids-parallax-background';
import { syncClassroomToSupabase } from '@/lib/supabase/classroom-sync';
import type { QuizQuestion, Scene, Stage } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';

const log = createLogger('Home');

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const RAG_STORAGE_KEY = 'ragEnabled';
const LANGUAGE_STORAGE_KEY = 'generationLanguage';
const RECENT_OPEN_STORAGE_KEY = 'recentClassroomsOpen';
const REQUIREMENT_DRAFT_STORAGE_KEY = 'requirementDraft';

interface FormState {
  pdfFile: File | null;
  requirement: string;
  language: 'zh-CN' | 'en-US';
  webSearch: boolean;
  enableRAG: boolean;
}

interface SupabaseClassroomRow {
  id: string;
  name: string;
  description: string | null;
  scenes_data: unknown;
  created_at: string;
  updated_at: string;
}

type GammaJson = {
  success?: boolean;
  error?: string;
  details?: string;
  generationId?: string;
  status?: string;
  gammaUrl?: string;
  exportUrl?: string;
  pageCount?: number;
};

type GammaScriptJson = {
  success?: boolean;
  scripts?: Array<{ pageNumber: number; lines: string[] }>;
  error?: string;
};

type GammaQuizJson = {
  success?: boolean;
  quizzes?: Array<{ afterPageNumber: number; questions: QuizQuestion[] }>;
  error?: string;
};

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
      // Keep richer extracted text so narration can cover more complete slide content.
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
      // Fallback: if browser PDF rendering fails for a page, try server-rendered page image.
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
          reader.onerror = () => reject(new Error('Could not convert Gamma page image to data URL'));
          reader.readAsDataURL(blob);
        });
        images.push(dataUrl);
        pageTexts.push('');
      } catch {
        // Keep flow alive: this page will fallback to interactive viewer scene.
        images.push('');
        pageTexts.push('');
      }
    }
  }

  return { images, pageTexts, pageCount };
}

async function generateGammaScriptsByAI(
  lessonTitle: string,
  pageTexts: string[],
  language: 'zh-CN' | 'en-US',
): Promise<Map<number, string[]>> {
  const settings = useSettingsStore.getState();
  const selectedProviderId = settings.providerId;
  const selectedModelId = settings.modelId;
  const selectedProvider = settings.providersConfig[selectedProviderId];
  const aiHeaders = {
    'Content-Type': 'application/json',
    'x-model': `${selectedProviderId}:${selectedModelId}`,
    'x-api-key': selectedProvider?.apiKey || '',
    'x-base-url': selectedProvider?.baseUrl || '',
    'x-provider-type': selectedProvider?.type || '',
    'x-requires-api-key': selectedProvider?.requiresApiKey ? 'true' : 'false',
  };

  const payload = {
    lessonTitle,
    language,
    slides: pageTexts.map((text, idx) => ({
      pageNumber: idx + 1,
      title: `Slide ${idx + 1}`,
      text: text || '',
    })),
  };

  const res = await fetch('/api/gamma/scripts', {
    method: 'POST',
    headers: aiHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Gamma script API failed (${res.status})`);
  }
  const json = (await res.json()) as GammaScriptJson;
  if (!json.success || !Array.isArray(json.scripts)) {
    throw new Error(json.error || 'Gamma script generation failed');
  }

  const map = new Map<number, string[]>();
  for (const s of json.scripts) {
    if (!Number.isFinite(s.pageNumber) || s.pageNumber < 1) continue;
    const lines = Array.isArray(s.lines)
      ? s.lines.map((l) => String(l || '').trim()).filter(Boolean).slice(0, 6)
      : [];
    if (lines.length > 0) map.set(s.pageNumber, lines);
  }
  return map;
}

async function generateGammaQuizzesByAI(
  lessonTitle: string,
  pageTexts: string[],
): Promise<Map<number, QuizQuestion[]>> {
  const settings = useSettingsStore.getState();
  const selectedProviderId = settings.providerId;
  const selectedModelId = settings.modelId;
  const selectedProvider = settings.providersConfig[selectedProviderId];
  const aiHeaders = {
    'Content-Type': 'application/json',
    'x-model': `${selectedProviderId}:${selectedModelId}`,
    'x-api-key': selectedProvider?.apiKey || '',
    'x-base-url': selectedProvider?.baseUrl || '',
    'x-provider-type': selectedProvider?.type || '',
    'x-requires-api-key': selectedProvider?.requiresApiKey ? 'true' : 'false',
  };

  const payload = {
    lessonTitle,
    slides: pageTexts.map((text, idx) => ({
      pageNumber: idx + 1,
      title: `Slide ${idx + 1}`,
      text: text || '',
    })),
  };

  const res = await fetch('/api/gamma/quizzes', {
    method: 'POST',
    headers: aiHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Gamma quiz API failed (${res.status})`);
  }
  const json = (await res.json()) as GammaQuizJson;
  if (!json.success || !Array.isArray(json.quizzes)) {
    throw new Error(json.error || 'Gamma quiz generation failed');
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
          ? q.answer.map((a) => String(a || '').trim()).filter(Boolean).slice(0, 2)
          : [],
        analysis: String(q.analysis || '').trim() || 'Review the key concept from the previous slides.',
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

function buildGammaPdfPageUrl(baseUrl: string, pageNumber: number): string {
  if (!baseUrl.trim()) return '';
  const suffix = `page=${pageNumber}&view=FitH`;
  return baseUrl.includes('#') ? `${baseUrl}&${suffix}` : `${baseUrl}#${suffix}`;
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

function buildGammaSlideScript(pageNumber: number, pageText: string, lessonTitle: string): string[] {
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

async function fetchGammaPageImageDataUrl(generationId: string, pageNumber: number): Promise<string | null> {
  const pageRes = await fetch(`/api/gamma/page-image/${encodeURIComponent(generationId)}/${pageNumber}`, {
    method: 'GET',
  });
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
    // Retry twice for transient server/image conversion failures.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const image = await fetchGammaPageImageDataUrl(generationId, pageNumber);
        if (image) {
          out[pageNumber - 1] = image;
          break;
        }
      } catch {
        // ignore and retry
      }
    }
  }
  return out;
}

const initialFormState: FormState = {
  pdfFile: null,
  requirement: '',
  language: 'zh-CN',
  webSearch: false,
  enableRAG: false,
};

function HomePage() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    import('@/lib/types/settings').SettingsSection | undefined
  >(undefined);

  // Draft cache for requirement text
  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: REQUIREMENT_DRAFT_STORAGE_KEY });

  // Model setup state
  const currentModelId = useSettingsStore((s) => s.modelId);
  const [recentOpen, setRecentOpen] = useState(true);

  // Hydrate client-only state after mount (avoids SSR mismatch)
  /* eslint-disable react-hooks/set-state-in-effect -- Hydration from localStorage must happen in effect */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_OPEN_STORAGE_KEY);
      if (saved !== null) setRecentOpen(saved !== 'false');
    } catch {
      /* localStorage unavailable */
    }
    try {
      const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      const savedRAG = localStorage.getItem(RAG_STORAGE_KEY);
      const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      const updates: Partial<FormState> = {};
      if (savedWebSearch === 'true') updates.webSearch = true;
      if (savedRAG === 'true') updates.enableRAG = true;
      if (savedLanguage === 'zh-CN' || savedLanguage === 'en-US') {
        updates.language = savedLanguage;
      } else {
        const detected = navigator.language?.startsWith('zh') ? 'zh-CN' : 'en-US';
        updates.language = detected;
      }
      if (Object.keys(updates).length > 0) {
        setForm((prev) => ({ ...prev, ...updates }));
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Restore requirement draft: useDraftCache reads localStorage into cachedRequirement on mount,
  // but it never changes during the session, so we must merge into form here. The old "derived"
  // sync skipped this when prev and cache matched on first render (e.g. after navigating back
  // from /rag), which cleared the visible prompt.
  useEffect(() => {
    if (cachedRequirement === undefined) return;
    setForm((prev) => ({ ...prev, requirement: cachedRequirement }));
  }, [cachedRequirement]);

  const [languageOpen, setLanguageOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [authUserEmail, setAuthUserEmail] = useState('');
  const [profileCardOpen, setProfileCardOpen] = useState(false);
  const [recentPage, setRecentPage] = useState(1);
  const [gammaBusy, setGammaBusy] = useState(false);
  const gammaRunRef = useRef(0);
  const [gammaSelected, setGammaSelected] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const RECENTS_PER_PAGE = 8;

  const verifyAdminStatus = async (accessToken: string) => {
    const res = await fetch('/api/auth/admin-status', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) return false;
    const json = await res.json();
    return !!json?.success && !!json?.isAdmin;
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!languageOpen && !themeOpen && !profileCardOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setLanguageOpen(false);
        setThemeOpen(false);
        setProfileCardOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [languageOpen, themeOpen, profileCardOpen]);

  const loadClassrooms = async () => {
    try {
      const loadLocalFallback = async (reason: string) => {
        const localList = await listStages();
        setClassrooms(localList);
        console.info(
          `[Recents] Using local IndexedDB fallback (${reason}). Loaded ${localList.length} classrooms.`,
        );
        if (localList.length > 0) {
          const slides = await getFirstSlideByStages(localList.map((c) => c.id));
          setThumbnails(slides);
        } else {
          setThumbnails({});
        }
      };

      const supabase = getSupabaseClient();
      if (isAuthenticated && isAdminUser && supabase) {
        const session = await getSessionSafe(supabase);
        const currentUserId = session?.user?.id;

        if (!currentUserId) {
          await loadLocalFallback('no active user session');
          return;
        }

        const { data, error } = await supabase
          .from('classrooms')
          .select('id, user_id, name, description, scenes_data, created_at, updated_at')
          .eq('user_id', currentUserId)
          .order('updated_at', { ascending: false });

        if (!error && data) {
          const rows = data as SupabaseClassroomRow[];
          const list: StageListItem[] = rows.map((row) => {
            const scenes = Array.isArray(row.scenes_data) ? row.scenes_data : [];
            return {
              id: row.id,
              name: row.name || 'Untitled Stage',
              description: row.description ?? '',
              sceneCount: scenes.length,
              createdAt: Date.parse(row.created_at) || Date.now(),
              updatedAt: Date.parse(row.updated_at) || Date.now(),
            };
          });

          const slideMap: Record<string, Slide> = {};
          for (const row of rows) {
            const scenes = Array.isArray(row.scenes_data) ? row.scenes_data : [];
            const firstSlideScene = scenes.find(
              (scene): scene is { content?: { type?: string; canvas?: Slide } } =>
                typeof scene === 'object' &&
                scene !== null &&
                typeof (scene as { content?: { type?: string } }).content?.type === 'string' &&
                (scene as { content?: { type?: string } }).content?.type === 'slide',
            );
            const maybeCanvas = firstSlideScene?.content;
            if (maybeCanvas?.type === 'slide' && maybeCanvas.canvas) {
              slideMap[row.id] = maybeCanvas.canvas;
            }
          }

          setClassrooms(list);
          setThumbnails(slideMap);
          console.info(
            `[Recents] Loaded ${list.length} classrooms from Supabase for admin ${currentUserId}.`,
          );
          if (list.length === 0) {
            await loadLocalFallback('Supabase returned zero classrooms');
          }
          return;
        }

        console.warn(
          `[Recents] Supabase fetch failed (${error?.message ?? 'unknown error'}). Falling back to local IndexedDB.`,
        );
        await loadLocalFallback(`Supabase fetch failed: ${error?.message ?? 'unknown error'}`);
        return;
      }

      await loadLocalFallback('unauthenticated or non-admin mode');
    } catch (err) {
      log.error('Failed to load classrooms:', err);
    }
  };

  useEffect(() => {
    // Clear stale media store to prevent cross-course thumbnail contamination.
    // The store may hold tasks from a previously visited classroom whose elementIds
    // (gen_img_1, etc.) collide with other courses' placeholders.
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsAuthenticated(false);
      setAuthReady(true);
      return;
    }

    let active = true;
    const syncAuthState = async () => {
      const session = await getSessionSafe(supabase);
      if (!active) return;
      const hasSession = !!session;
      setIsAuthenticated(hasSession);
      setAuthUserEmail(session?.user.email ?? '');

      if (!hasSession || !session?.user?.id) {
        setIsAdminUser(false);
        setAuthReady(true);
        return;
      }

      const isAdmin = await verifyAdminStatus(session.access_token);
      if (!active) return;
      setIsAdminUser(isAdmin);
      setAuthReady(true);
    };

    void syncAuthState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setIsAuthenticated(!!session);
      setAuthUserEmail(session?.user.email ?? '');
      if (!session?.user?.id) {
        setIsAdminUser(false);
        setAuthReady(true);
        setProfileCardOpen(false);
        return;
      }

      const isAdmin = await verifyAdminStatus(session.access_token);
      setIsAdminUser(isAdmin);
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    void loadClassrooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load based on auth state only
  }, [authReady, isAuthenticated]);

  useEffect(() => {
    setRecentPage(1);
  }, [classrooms.length]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDelete = async (id: string) => {
    setPendingDeleteId(null);
    try {
      // Always clear local copy first.
      await deleteStageData(id);

      // If logged in, also delete remote classroom row from Supabase.
      const supabase = getSupabaseClient();
      if (isAuthenticated && supabase) {
        const { error: remoteDeleteError } = await supabase.from('classrooms').delete().eq('id', id);
        if (remoteDeleteError) {
          throw remoteDeleteError;
        }
      }

      await loadClassrooms();
    } catch (err) {
      log.error('Failed to delete classroom:', err);
      toast.error('Failed to delete classroom');
    }
  };

  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    try {
      if (field === 'webSearch') localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      if (field === 'enableRAG') localStorage.setItem(RAG_STORAGE_KEY, String(value));
      if (field === 'language') localStorage.setItem(LANGUAGE_STORAGE_KEY, String(value));
      if (field === 'requirement') updateRequirementCache(value as string);
    } catch {
      /* ignore */
    }
  };

  const showSetupToast = (icon: React.ReactNode, title: string, desc: string) => {
    toast.custom(
      (id) => (
        <div
          className="w-[356px] rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-r from-amber-50 via-white to-amber-50 dark:from-amber-950/60 dark:via-slate-900 dark:to-amber-950/60 shadow-lg shadow-amber-500/8 dark:shadow-amber-900/20 p-4 flex items-start gap-3 cursor-pointer"
          onClick={() => {
            toast.dismiss(id);
            setSettingsOpen(true);
          }}
        >
          <div className="shrink-0 mt-0.5 size-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center ring-1 ring-amber-200/50 dark:ring-amber-800/30">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 leading-tight">
              {title}
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5 leading-relaxed">
              {desc}
            </p>
          </div>
          <div className="shrink-0 mt-1 text-[10px] font-medium text-amber-500 dark:text-amber-500/70 tracking-wide">
            <Settings className="size-3.5 animate-[spin_3s_linear_infinite]" />
          </div>
        </div>
      ),
      { duration: 4000 },
    );
  };

  const handleGenerate = async () => {
    if (!isAuthenticated || !isAdminUser) {
      toast.error('Admin login required to generate classrooms.');
      router.push('/auth');
      return;
    }

    // Validate setup before proceeding
    if (!currentModelId) {
      showSetupToast(
        <BotOff className="size-4.5 text-amber-600 dark:text-amber-400" />,
        t('settings.modelNotConfigured'),
        t('settings.setupNeeded'),
      );
      setSettingsOpen(true);
      return;
    }

    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }

    setError(null);

    try {
      const userProfile = useUserProfileStore.getState();
      const requirements: UserRequirements = {
        requirement: form.requirement,
        language: form.language,
        userNickname: userProfile.nickname || undefined,
        userBio: userProfile.bio || undefined,
        webSearch: form.webSearch || undefined,
        enableRAG: form.enableRAG || undefined,
      };

      let pdfStorageKey: string | undefined;
      let pdfFileName: string | undefined;
      let pdfProviderId: string | undefined;
      let pdfProviderConfig: { apiKey?: string; baseUrl?: string } | undefined;

      if (form.pdfFile) {
        pdfStorageKey = await storePdfBlob(form.pdfFile);
        pdfFileName = form.pdfFile.name;

        const settings = useSettingsStore.getState();
        pdfProviderId = settings.pdfProviderId;
        const providerCfg = settings.pdfProvidersConfig?.[settings.pdfProviderId];
        if (providerCfg) {
          pdfProviderConfig = {
            apiKey: providerCfg.apiKey,
            baseUrl: providerCfg.baseUrl,
          };
        }
      }

      const sessionState = {
        sessionId: nanoid(),
        requirements,
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        pdfStorageKey,
        pdfFileName,
        pdfProviderId,
        pdfProviderConfig,
        sceneOutlines: null,
        currentStep: 'generating' as const,
      };
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));

      router.push('/generation-preview');
    } catch (err) {
      log.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    }
  };

  const handleGammaGenerate = async () => {
    if (gammaBusy) return;
    if (!isAuthenticated || !isAdminUser) {
      toast.error('Admin login required to generate classrooms.');
      router.push('/auth');
      return;
    }
    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }

    setError(null);
    setGammaBusy(true);
    const runId = Date.now();
    gammaRunRef.current = runId;
    try {
      const startRes = await fetch('/api/gamma/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: form.requirement.trim(),
          numCards: 10,
          exportAs: 'pdf',
          textMode: 'generate',
          format: 'presentation',
        }),
      });
      const startData = (await startRes.json()) as GammaJson;
      if (!startData.success || !startData.generationId) {
        toast.error(startData.error || 'Could not start Gamma generation');
        return;
      }
      let last: GammaJson = {};
      for (let i = 0; i < 120; i++) {
        if (gammaRunRef.current !== runId) return;
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const pollRes = await fetch(`/api/gamma/generations/${startData.generationId}`);
        last = (await pollRes.json()) as GammaJson;
        if (!last.success) {
          toast.error(last.error || 'Gamma polling failed');
          return;
        }
        if (last.status === 'completed' || last.status === 'failed') break;
      }

      if (last.status === 'completed' && last.gammaUrl) {
        if (gammaRunRef.current !== runId) return;
        const now = Date.now();
        const stageId = nanoid(10);
        const stage: Stage = {
          id: stageId,
          name: form.requirement.trim().slice(0, 120) || 'Gamma Presentation',
          description: 'Generated via Gamma AI',
          createdAt: now,
          updatedAt: now,
          language: form.language,
          style: 'professional',
        };
        const exportBaseUrl = `/api/gamma/export/${encodeURIComponent(startData.generationId)}`;
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
          const message = error instanceof Error ? error.message : String(error);
          toast.warning('Some Gamma slides could not convert. Using viewer fallback for those pages.');
          console.warn('[gamma] page image download failed', {
            message,
          });
        }

        renderedPageImages = await fillMissingGammaPageImages(
        startData.generationId,
        renderedPageImages,
        resolvedPageCount,
      );

        let aiScripts = new Map<number, string[]>();
        try {
          aiScripts = await generateGammaScriptsByAI(stage.name, renderedPageTexts, form.language);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn('[gamma] ai script generation failed, using local fallback scripts', { message });
        }
        let aiQuizzes = new Map<number, QuizQuestion[]>();
        try {
          aiQuizzes = await generateGammaQuizzesByAI(stage.name, renderedPageTexts);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn('[gamma] ai quiz generation failed, continuing without quizzes', { message });
        }

        const missingPages = renderedPageImages
          .map((img, idx) => ({ idx, ok: typeof img === 'string' && img.length > 0 }))
          .filter((x) => !x.ok)
          .map((x) => x.idx + 1);
        if (missingPages.length > 0) {
          toast.error(
            `Could not prepare local slide snapshot for pages: ${missingPages.join(', ')}. Please retry generation.`,
          );
          return;
        }

        const pageCount = resolvedPageCount;
        const slideScenes: Scene[] = Array.from({ length: pageCount }, (_, idx) => {
          const pageNumber = idx + 1;
          const pageImage = renderedPageImages[idx];
          const pageText = renderedPageTexts[idx];
          const slideScript =
            aiScripts.get(pageNumber) ||
            buildGammaSlideScript(
          pageNumber,
          pageText || '',
          stage.name || 'this topic',
            );
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
          console.warn('[gamma] explicit supabase sync failed', syncError);
        }

        toast.success('Gamma slides generated successfully.');
        router.push(`/classroom/${stageId}`);
      } else {
        toast.error(last.error || 'Gamma generation failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gamma request failed');
    } finally {
      if (gammaRunRef.current === runId) {
        setGammaBusy(false);
      }
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('classroom.today');
    if (diffDays === 1) return t('classroom.yesterday');
    if (diffDays < 7) return `${diffDays} ${t('classroom.daysAgo')}`;
    return date.toLocaleDateString();
  };

  const canGenerate = !!form.requirement.trim() && isAuthenticated && isAdminUser;
  const canGenerateNow = canGenerate && !gammaBusy;
  const showAuthenticatedUi = authReady && isAuthenticated;
  const totalRecentPages = Math.max(1, Math.ceil(classrooms.length / RECENTS_PER_PAGE));
  const pagedClassrooms = classrooms.slice(
    (recentPage - 1) * RECENTS_PER_PAGE,
    recentPage * RECENTS_PER_PAGE,
  );
  const goToCreatorProfile = () => {
    // Avoid false redirect during initial auth hydration after refresh.
    // If we already have an authenticated state, allow opening the card immediately.
    if (!authReady) {
      if (isAuthenticated) {
        setProfileCardOpen(true);
      }
      return;
    }

    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }
    setProfileCardOpen(true);
  };

  const handleLogout = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error('Supabase is not configured.');
      return;
    }

    try {
      setProfileCardOpen(false);
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) {
        throw error;
      }
      setIsAuthenticated(false);
      setIsAdminUser(false);
      setAuthUserEmail('');
      toast.success('Logged out successfully.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to log out.';
      toast.error(`Logout failed: ${message}`);
    } finally {
      // Force-clear auth caches so UI cannot remain in a stale logged-in state.
      try {
        clearSupabaseAuthStorage();
      } catch {
        /* ignore */
      }
      window.location.replace('/auth');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!canGenerateNow) return;
      if (gammaSelected) {
        void handleGammaGenerate();
      } else {
        void handleGenerate();
      }
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full bg-[linear-gradient(to_bottom,rgba(250,250,250,1),rgba(244,244,245,0.95))] dark:bg-[linear-gradient(to_bottom,rgba(9,9,11,1),rgba(15,23,42,0.95))] flex flex-col items-center p-3 pt-20 sm:p-4 sm:pt-20 md:p-8 md:pt-16 overflow-x-hidden">
      {/* ═══ Top-right pill (unchanged) ═══ */}
      <div
        ref={toolbarRef}
        className="fixed top-2 inset-x-2 sm:top-4 sm:right-4 sm:inset-x-auto z-50 flex items-center justify-between sm:justify-start gap-1 bg-white/90 dark:bg-zinc-900/85 backdrop-blur-xl px-2 py-1.5 sm:px-2.5 rounded-full border border-zinc-200/80 dark:border-zinc-700/60 shadow-sm"
      >
        {/* Language Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setLanguageOpen(!languageOpen);
              setThemeOpen(false);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
          >
            {locale === 'zh-CN' ? 'CN' : 'EN'}
          </button>
          {languageOpen && (
            <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[120px]">
              <button
                onClick={() => {
                  setLocale('zh-CN');
                  setLanguageOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                  locale === 'zh-CN' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                简体中文
              </button>
              <button
                onClick={() => {
                  setLocale('en-US');
                  setLanguageOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                  locale === 'en-US' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                English
              </button>
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Theme Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setThemeOpen(!themeOpen);
              setLanguageOpen(false);
            }}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
          >
            {theme === 'light' && <Sun className="w-4 h-4" />}
            {theme === 'dark' && <Moon className="w-4 h-4" />}
            {theme === 'system' && <Monitor className="w-4 h-4" />}
          </button>
          {themeOpen && (
            <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[140px]">
              <button
                onClick={() => {
                  setTheme('light');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'light' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Sun className="w-4 h-4" />
                {t('settings.themeOptions.light')}
              </button>
              <button
                onClick={() => {
                  setTheme('dark');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'dark' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Moon className="w-4 h-4" />
                {t('settings.themeOptions.dark')}
              </button>
              <button
                onClick={() => {
                  setTheme('system');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'system' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Monitor className="w-4 h-4" />
                {t('settings.themeOptions.system')}
              </button>
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        <button
          type="button"
          onClick={() => router.push('/classroom/Q_aCAqhuTq?tour=1')}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50/75 border border-violet-200/80 transition-all hover:bg-violet-100 dark:text-violet-200 dark:bg-violet-900/30 dark:border-violet-700/70 dark:hover:bg-violet-800/40"
        >
          <BookOpen className="size-3.5 shrink-0" />
          <span className="max-[380px]:hidden">{t('home.guidanceBook')}</span>
        </button>

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {showAuthenticatedUi ? (
          <div className="relative">
            <button
              type="button"
              onClick={goToCreatorProfile}
              title="Profile Info"
              aria-label="Profile Info"
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 transition-all hover:bg-white dark:hover:bg-gray-700 hover:text-primary dark:hover:text-violet-400 hover:shadow-sm"
            >
              <UserRound className="size-4 shrink-0" />
              <span className="max-[380px]:hidden">Profile Info</span>
            </button>
            {profileCardOpen && (
              <div className="absolute top-full right-0 mt-2 w-64 rounded-xl border border-border/60 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl p-3 z-[60]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Logged in user
                </p>
                <p className="mt-1 text-sm font-medium text-foreground break-all">
                  {authUserEmail || 'No email available'}
                </p>
                <p
                  className={cn(
                    'mt-2 text-xs font-medium',
                    isAdminUser ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {isAdminUser ? 'Admin access enabled' : 'Logged in, but not in admin_users'}
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="mt-3 w-full rounded-md border border-border/70 px-3 py-2 text-xs font-medium text-left hover:bg-accent transition-colors"
                >
                  Go to Home
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleLogout();
                  }}
                  className="mt-2 w-full rounded-md bg-destructive/90 px-3 py-2 text-xs font-semibold text-destructive-foreground hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5"
                >
                  <LogOut className="size-3.5" />
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => router.push('/auth')}
            disabled={!authReady}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 transition-all hover:bg-white dark:hover:bg-gray-700 hover:text-primary dark:hover:text-violet-400 hover:shadow-sm"
          >
            <UserRound className="size-4 shrink-0" />
            <span className="max-[380px]:hidden">Creator Profile</span>
          </button>
        )}

        {/* <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" /> */}

        {/* Settings button intentionally hidden for cleaner OSS home header.
            Kept as commented code so it can be restored quickly later. */}
        {/*
        <div className="relative">
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all group"
          >
            <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
          </button>
        </div>
        */}
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />

      {/* ═══ Background Decor ═══ */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>
      <KidsParallaxBackground />
      <KidsGuideOverlay compact />

      {/* ═══ Hero section: title + input (centered, wider) ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
          className={cn(
            'relative z-20 w-full max-w-[900px] flex flex-col items-center',
            classrooms.length === 0
              ? 'justify-center min-h-[calc(100dvh-10rem)] sm:min-h-[calc(100dvh-8rem)]'
              : 'mt-[5.5rem] sm:mt-[8vh]',
          )}
      >
        {/* ── Logo ── */}
        <motion.img
          src="/newlogo.png"
          alt="Allen Girls Adventure"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.1,
            type: 'spring',
            stiffness: 200,
            damping: 20,
          }}
          className="h-12 md:h-16 mb-2 -ml-2 md:-ml-3"
        />

        {/* ── Slogan ── */}
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2"
        >
          Create interactive classrooms in minutes
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-sm md:text-[15px] text-muted-foreground/85 mb-6 sm:mb-8 text-center max-w-[680px] px-1"
        >
          {t('home.slogan')}
        </motion.p>

        {/* ── Unified input area ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35 }}
          className="w-full"
        >
          <div className="w-full rounded-2xl sm:rounded-3xl border border-zinc-200/80 dark:border-zinc-700/60 bg-white/95 dark:bg-zinc-900/90 backdrop-blur-xl shadow-md transition-shadow focus-within:shadow-lg">
            <div className="px-3 sm:px-4 pt-3">
              <span className="inline-flex items-center rounded-full border border-zinc-300/80 dark:border-zinc-600/70 bg-zinc-100/90 dark:bg-zinc-800/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-300">
                AI Classroom Studio
              </span>
            </div>
            {/* ── Greeting + Profile + Agents ── */}
            <div className="relative z-20 flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-0">
              <GreetingBar />
              <div className="pr-3 pt-0 sm:pt-3.5 pl-3 sm:pl-0 shrink-0">
                <AgentBar />
              </div>
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              placeholder={
                isAuthenticated && isAdminUser
                  ? t('upload.requirementPlaceholder')
                  : 'Login as admin to enter prompt and generate classroom.'
              }
              className="w-full resize-none border-0 bg-transparent px-3.5 sm:px-5 pt-2 pb-2 text-[14px] leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none min-h-[128px] sm:min-h-[150px] max-h-[320px]"
              value={form.requirement}
              onChange={(e) => updateForm('requirement', e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
              disabled={!isAuthenticated || !isAdminUser}
            />

            {/* Toolbar row */}
            <div className="px-3 pb-1 flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-x-4 gap-y-2">
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:flex-wrap sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 border-border/80 bg-background/70 text-xs font-medium shadow-none hover:bg-accent rounded-lg w-full sm:w-auto"
                  onClick={goToCreatorProfile}
                >
                  <UserRound className="size-3.5" />
                  {showAuthenticatedUi ? 'Profile Info' : 'Creator Profile'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 border-border/80 bg-background/70 text-xs font-medium shadow-none hover:bg-accent rounded-lg w-full sm:w-auto"
                  onClick={() => {
                    // Persist immediately so text is not lost if the debounced draft write has not run yet.
                    try {
                      localStorage.setItem(
                        REQUIREMENT_DRAFT_STORAGE_KEY,
                        JSON.stringify(form.requirement),
                      );
                    } catch {
                      /* ignore */
                    }
                    router.push('/rag');
                  }}
                >
                  <Database className="size-3.5" />
                  {t('home.manageRagDocs')}
                </Button>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground self-start sm:self-auto">
                <input
                  type="checkbox"
                  checked={form.enableRAG}
                  onChange={(e) => updateForm('enableRAG', e.target.checked)}
                />
                Enable RAG
              </label>
            </div>

            {/* Toolbar row */}
            <div className="px-3 pb-3 flex flex-wrap sm:flex-nowrap items-end gap-2">
              <div className="min-w-0 w-full sm:flex-1">
                <GenerationToolbar
                  language={form.language}
                  onLanguageChange={(lang) => updateForm('language', lang)}
                  webSearch={form.webSearch}
                  onWebSearchChange={(v) => updateForm('webSearch', v)}
                  onSettingsOpen={(section) => {
                    setSettingsSection(section);
                    setSettingsOpen(true);
                  }}
                  pdfFile={form.pdfFile}
                  onPdfFileChange={(f) => updateForm('pdfFile', f)}
                  onPdfError={setError}
                  onGammaPrompt={() => setGammaSelected((v) => !v)}
                  gammaSelected={gammaSelected}
                  canGenerate={canGenerateNow}
                />
              </div>

              {/* Voice input */}
              <SpeechButton
                size="md"
                className="shrink-0"
                onTranscription={(text) => {
                  setForm((prev) => {
                    const next = prev.requirement + (prev.requirement ? ' ' : '') + text;
                    updateRequirementCache(next);
                    return { ...prev, requirement: next };
                  });
                }}
              />

              {/* Send button */}
              <button
                onClick={() => {
                  if (gammaSelected) {
                    void handleGammaGenerate();
                  } else {
                    void handleGenerate();
                  }
                }}
                disabled={!canGenerateNow}
                className={cn(
                  'h-10 rounded-xl flex items-center justify-center gap-1.5 transition-all px-4 min-w-[130px] w-[calc(100%-3rem)] min-[420px]:w-auto sm:w-auto sm:shrink-0',
                  canGenerateNow
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-95 shadow-sm cursor-pointer'
                    : 'bg-muted text-muted-foreground/40 cursor-not-allowed',
                )}
              >
                <span className="text-xs font-medium">{t('toolbar.enterClassroom')}</span>
                <ArrowUp className="size-3.5" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 w-full p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
            >
              <p className="text-sm text-destructive">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ═══ Recent classrooms — collapsible ═══ */}
      {classrooms.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="relative z-30 mt-8 sm:mt-10 w-full max-w-6xl flex flex-col items-center pointer-events-auto rounded-2xl sm:rounded-3xl border border-white/55 bg-white/65 px-3 sm:px-5 py-4 sm:py-5 shadow-[0_24px_50px_-32px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/55"
        >
          {/* Trigger — divider-line with centered text */}
          <button
            onClick={() => {
              const next = !recentOpen;
              setRecentOpen(next);
              try {
                localStorage.setItem(RECENT_OPEN_STORAGE_KEY, String(next));
              } catch {
                /* ignore */
              }
            }}
            className="group w-full flex items-center gap-4 py-2.5 cursor-pointer"
          >
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
            <span className="shrink-0 inline-flex items-center gap-2 rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1.5 text-[13px] font-semibold text-violet-700 dark:border-violet-700/60 dark:bg-violet-900/30 dark:text-violet-200 transition-colors select-none">
              <Clock className="size-3.5 text-violet-500" />
              {t('classroom.recentClassrooms')}
              <span className="inline-flex items-center justify-center rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
                {classrooms.length}
              </span>
              <motion.div
                animate={{ rotate: recentOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <ChevronDown className="size-3.5 text-violet-500" />
              </motion.div>
            </span>
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
          </button>

          {/* Expandable content */}
          <AnimatePresence>
            {recentOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="w-full overflow-hidden"
              >
                <div className="pt-4 sm:pt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 sm:gap-x-5 gap-y-4 sm:gap-y-6">
                  {pagedClassrooms.map((classroom, i) => (
                    <motion.div
                      key={classroom.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: i * 0.035,
                        duration: 0.35,
                        ease: 'easeOut',
                      }}
                    >
                      <ClassroomCard
                        classroom={classroom}
                        slide={thumbnails[classroom.id]}
                        formatDate={formatDate}
                        onDelete={handleDelete}
                        confirmingDelete={pendingDeleteId === classroom.id}
                        onConfirmDelete={() => confirmDelete(classroom.id)}
                        onCancelDelete={() => setPendingDeleteId(null)}
                        onClick={() => router.push(`/classroom/${encodeURIComponent(classroom.id)}`)}
                      />
                    </motion.div>
                  ))}
                </div>
                {totalRecentPages > 1 && (
                  <div className="mt-5 flex items-center justify-center gap-2 sm:gap-3 pb-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={recentPage === 1}
                      onClick={() => setRecentPage((prev) => Math.max(1, prev - 1))}
                      className="h-8 rounded-full px-2.5 sm:px-3 text-xs min-w-8"
                    >
                      <ChevronLeft className="size-3.5" />
                      <span className="hidden sm:inline ml-1">Prev</span>
                    </Button>
                    <span className="rounded-full border border-violet-200/70 bg-violet-50 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold text-violet-700 dark:border-violet-700/60 dark:bg-violet-900/30 dark:text-violet-200 whitespace-nowrap">
                      Page {recentPage} of {totalRecentPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={recentPage === totalRecentPages}
                      onClick={() => setRecentPage((prev) => Math.min(totalRecentPages, prev + 1))}
                      className="h-8 rounded-full px-2.5 sm:px-3 text-xs min-w-8"
                    >
                      <span className="hidden sm:inline mr-1">Next</span>
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Footer — flows with content, at the very end */}
      <div className="mt-auto pt-12 pb-4 text-center text-xs text-muted-foreground/40">
        Allen Girls Adventure Open Source Project
      </div>
    </div>
  );
}

// ─── Greeting Bar — avatar + "Hi, Name", click to edit in-place ────
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function isCustomAvatar(src: string) {
  return src.startsWith('data:');
}

function GreetingBar() {
  const { t } = useI18n();
  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const bio = useUserProfileStore((s) => s.bio);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const setBio = useUserProfileStore((s) => s.setBio);

  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = nickname || t('profile.defaultNickname');

  // Click-outside to collapse
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingName(false);
        setAvatarPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startEditName = () => {
    setNameDraft(nickname);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const commitName = () => {
    setNickname(nameDraft.trim());
    setEditingName(false);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(t('profile.fileTooLarge'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.invalidFileType'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(128 / img.width, 128 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
        setAvatar(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div ref={containerRef} className="relative pl-4 pr-2 pt-3.5 pb-1 w-auto">
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* ── Collapsed pill (always in flow) ── */}
      {!open && (
        <div
          className="flex items-center gap-2.5 cursor-pointer transition-all duration-200 group rounded-full px-2.5 py-1.5 border border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 active:scale-[0.97]"
          onClick={() => setOpen(true)}
        >
          <div className="shrink-0 relative">
            <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-border/30 group-hover:ring-violet-400/60 dark:group-hover:ring-violet-400/40 transition-all duration-300">
              <img src={avatar} alt="" className="size-full object-cover" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/40 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity">
              <Pencil className="size-[7px] text-muted-foreground/70" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="leading-none select-none flex items-center gap-1">
                  <span>
                    <span className="text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                      {t('home.greeting')}
                    </span>
                    <span className="text-[13px] font-semibold text-foreground/85 group-hover:text-foreground transition-colors">
                      {displayName}
                    </span>
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {t('profile.editTooltip')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {/* ── Expanded panel (absolute, floating) ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute left-4 top-3.5 z-50 w-64"
          >
            <div className="rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[0_1px_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_8px_-2px_rgba(0,0,0,0.3)] px-2.5 py-2">
              {/* ── Row: avatar + name ── */}
              <div
                className="flex items-center gap-2.5 cursor-pointer transition-all duration-200"
                onClick={() => {
                  setOpen(false);
                  setEditingName(false);
                  setAvatarPickerOpen(false);
                }}
              >
                {/* Avatar */}
                <div
                  className="shrink-0 relative cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAvatarPickerOpen(!avatarPickerOpen);
                  }}
                >
                  <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-violet-300/70 dark:ring-violet-500/40 transition-all duration-300">
                    <img src={avatar} alt="" className="size-full object-cover" />
                  </div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/60 flex items-center justify-center"
                  >
                    <ChevronDown
                      className={cn(
                        'size-2 text-muted-foreground/70 transition-transform duration-200',
                        avatarPickerOpen && 'rotate-180',
                      )}
                    />
                  </motion.div>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  {editingName ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={nameInputRef}
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitName();
                          if (e.key === 'Escape') {
                            setEditingName(false);
                          }
                        }}
                        onBlur={commitName}
                        maxLength={20}
                        placeholder={t('profile.defaultNickname')}
                        className="flex-1 min-w-0 h-6 bg-transparent border-b border-border/80 text-[13px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                      <button
                        onClick={commitName}
                        className="shrink-0 size-5 rounded flex items-center justify-center text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                      >
                        <Check className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditName();
                      }}
                      className="group/name inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span className="text-[13px] font-semibold text-foreground/85 group-hover/name:text-foreground transition-colors">
                        {displayName}
                      </span>
                      <Pencil className="size-2.5 text-muted-foreground/30 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                    </span>
                  )}
                </div>

                {/* Collapse arrow */}
                <motion.div
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="shrink-0 size-6 rounded-full flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                >
                  <ChevronUp className="size-3.5 text-muted-foreground/50" />
                </motion.div>
              </div>

              {/* ── Expandable content ── */}
              <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                {/* Avatar picker */}
                <AnimatePresence>
                  {avatarPickerOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="p-1 pb-2.5 flex items-center gap-1.5 flex-wrap">
                        {AVATAR_OPTIONS.map((url) => (
                          <button
                            key={url}
                            onClick={() => setAvatar(url)}
                            className={cn(
                              'size-7 rounded-full overflow-hidden bg-gray-50 dark:bg-gray-800 cursor-pointer transition-all duration-150',
                              'hover:scale-110 active:scale-95',
                              avatar === url
                                ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-0'
                                : 'hover:ring-1 hover:ring-muted-foreground/30',
                            )}
                          >
                            <img src={url} alt="" className="size-full" />
                          </button>
                        ))}
                        <label
                          className={cn(
                            'size-7 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border border-dashed',
                            'hover:scale-110 active:scale-95',
                            isCustomAvatar(avatar)
                              ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-0 border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/30'
                              : 'border-muted-foreground/30 text-muted-foreground/50 hover:border-muted-foreground/50',
                          )}
                          onClick={() => avatarInputRef.current?.click()}
                          title={t('profile.uploadAvatar')}
                        >
                          <ImagePlus className="size-3" />
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bio */}
                <UITextarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t('profile.bioPlaceholder')}
                  maxLength={200}
                  rows={2}
                  className="resize-none border-border/40 bg-transparent min-h-[72px] !text-[13px] !leading-relaxed placeholder:!text-[11px] placeholder:!leading-relaxed focus-visible:ring-1 focus-visible:ring-border/60"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Classroom Card — clean, minimal style ──────────────────────
function ClassroomCard({
  classroom,
  slide,
  formatDate,
  onDelete,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onClick,
}: {
  classroom: StageListItem;
  slide?: Slide;
  formatDate: (ts: number) => string;
  onDelete: (id: string, e: React.MouseEvent) => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setThumbWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className="group cursor-pointer rounded-2xl border border-white/70 bg-white/80 p-2 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.85)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(59,130,246,0.45)] dark:border-slate-700/70 dark:bg-slate-900/70"
      onClick={confirmingDelete ? undefined : onClick}
    >
      {/* Thumbnail — large radius, no border, subtle bg */}
      <div
        ref={thumbRef}
        className="relative w-full aspect-[16/9] rounded-xl bg-slate-100 dark:bg-slate-800/80 overflow-hidden transition-transform duration-300 group-hover:scale-[1.015]"
      >
        {slide && thumbWidth > 0 ? (
          <ThumbnailSlide
            slide={slide}
            size={thumbWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : !slide ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30 flex items-center justify-center">
              <span className="text-xl opacity-50">📄</span>
            </div>
          </div>
        ) : null}

        {/* Delete — top-right, only on hover */}
        <AnimatePresence>
          {!confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-destructive/80 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(classroom.id, e);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline delete confirmation overlay */}
        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[6px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[13px] font-medium text-white/90">
                {t('classroom.deleteConfirmTitle')}?
              </span>
              <div className="flex gap-2">
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-white/15 text-white/80 hover:bg-white/25 backdrop-blur-sm transition-colors"
                  onClick={onCancelDelete}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-red-500/90 text-white hover:bg-red-500 transition-colors"
                  onClick={onConfirmDelete}
                >
                  {t('classroom.delete')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info — outside the thumbnail */}
      <div className="mt-2.5 px-1">
        <span className="mb-1.5 inline-flex items-center rounded-full border border-violet-200/70 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:border-violet-700/60 dark:bg-violet-900/30 dark:text-violet-200">
          {classroom.sceneCount} {t('classroom.slides')} · {formatDate(classroom.updatedAt)}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="font-semibold text-[15px] truncate text-foreground/90 min-w-0">
              {classroom.name}
            </p>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            sideOffset={4}
            className="!max-w-[min(90vw,32rem)] break-words whitespace-normal"
          >
            <div className="flex items-center gap-1.5">
              <span className="break-all">{classroom.name}</span>
              <button
                className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(classroom.name);
                  toast.success(t('classroom.nameCopied'));
                }}
              >
                <Copy className="size-3 opacity-60" />
              </button>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export default function Page() {
  return <HomePage />;
}
