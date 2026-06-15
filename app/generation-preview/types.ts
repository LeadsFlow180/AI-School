import {
  ScanLine,
  Search,
  Bot,
  FileText,
  LayoutPanelLeft,
  Clapperboard,
  Sparkles,
  Clock,
  Images,
  MessageSquare,
  HelpCircle,
  Volume2,
  Save,
} from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settings';
import type { ProviderId } from '@/lib/ai/providers';
import type {
  SceneOutline,
  UserRequirements,
  PdfImage,
  ImageMapping,
} from '@/lib/types/generation';
import type { TutorGenerationConfig } from '@/lib/types/tutor-voice';

// Session state stored in sessionStorage
export type GenerationMode = 'standard' | 'gamma';

export interface GenerationSessionState {
  sessionId: string;
  generationMode?: GenerationMode;
  requirements: UserRequirements;
  tutorConfig?: TutorGenerationConfig;
  pdfText: string;
  pdfImages?: PdfImage[];
  imageStorageIds?: string[];
  imageMapping?: ImageMapping;
  sceneOutlines?: SceneOutline[] | null;
  currentStep: 'generating' | 'complete';
  // PDF deferred parsing fields
  pdfStorageKey?: string;
  pdfFileName?: string;
  pdfProviderId?: string;
  pdfProviderConfig?: { apiKey?: string; baseUrl?: string };
  // Web search context
  researchContext?: string;
  researchSources?: Array<{ title: string; url: string }>;
  forceModel?: { providerId: ProviderId; modelId: string };
}

export type GenerationStep = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  type: 'analysis' | 'writing' | 'visual';
};

export const ALL_STEPS: GenerationStep[] = [
  {
    id: 'pdf-analysis',
    title: 'generation.analyzingPdf',
    description: 'generation.analyzingPdfDesc',
    icon: ScanLine,
    type: 'analysis',
  },
  {
    id: 'web-search',
    title: 'generation.webSearching',
    description: 'generation.webSearchingDesc',
    icon: Search,
    type: 'analysis',
  },
  {
    id: 'agent-generation',
    title: 'generation.agentGeneration',
    description: 'generation.agentGenerationDesc',
    icon: Bot,
    type: 'writing',
  },
  {
    id: 'outline',
    title: 'generation.generatingOutlines',
    description: 'generation.generatingOutlinesDesc',
    icon: FileText,
    type: 'writing',
  },
  {
    id: 'slide-content',
    title: 'generation.generatingSlideContent',
    description: 'generation.generatingSlideContentDesc',
    icon: LayoutPanelLeft,
    type: 'visual',
  },
  {
    id: 'actions',
    title: 'generation.generatingActions',
    description: 'generation.generatingActionsDesc',
    icon: Clapperboard,
    type: 'visual',
  },
];

export type { GammaGenerationStepId } from '@/lib/gamma/types';

export const GAMMA_STEPS: GenerationStep[] = [
  {
    id: 'gamma-create',
    title: 'generation.gammaCreate',
    description: 'generation.gammaCreateDesc',
    icon: Sparkles,
    type: 'writing',
  },
  {
    id: 'gamma-wait',
    title: 'generation.gammaWait',
    description: 'generation.gammaWaitDesc',
    icon: Clock,
    type: 'analysis',
  },
  {
    id: 'gamma-slides',
    title: 'generation.gammaSlides',
    description: 'generation.gammaSlidesDesc',
    icon: Images,
    type: 'visual',
  },
  {
    id: 'gamma-scripts',
    title: 'generation.gammaScripts',
    description: 'generation.gammaScriptsDesc',
    icon: MessageSquare,
    type: 'writing',
  },
  {
    id: 'gamma-quizzes',
    title: 'generation.gammaQuizzes',
    description: 'generation.gammaQuizzesDesc',
    icon: HelpCircle,
    type: 'writing',
  },
  {
    id: 'gamma-tts',
    title: 'generation.gammaTts',
    description: 'generation.gammaTtsDesc',
    icon: Volume2,
    type: 'visual',
  },
  {
    id: 'gamma-save',
    title: 'generation.gammaSave',
    description: 'generation.gammaSaveDesc',
    icon: Save,
    type: 'visual',
  },
];

export const getActiveSteps = (session: GenerationSessionState | null) => {
  if (session?.generationMode === 'gamma') {
    return GAMMA_STEPS.filter((step) => {
      if (step.id === 'gamma-tts') return useSettingsStore.getState().ttsEnabled;
      return true;
    });
  }
  return ALL_STEPS.filter((step) => {
    if (step.id === 'pdf-analysis') return !!session?.pdfStorageKey;
    if (step.id === 'web-search') return !!session?.requirements?.webSearch;
    if (step.id === 'agent-generation') return useSettingsStore.getState().agentMode === 'auto';
    return true;
  });
};
