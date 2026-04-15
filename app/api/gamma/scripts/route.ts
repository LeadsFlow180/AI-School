import { type NextRequest } from 'next/server';
import { jsonrepair } from 'jsonrepair';
import { callLLM } from '@/lib/ai/llm';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';

type SlideInput = {
  pageNumber: number;
  text?: string;
  title?: string;
};

type ScriptOutput = {
  pageNumber: number;
  lines: string[];
};

function extractJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return raw;
  return raw.slice(start, end + 1);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      lessonTitle?: string;
      slides?: SlideInput[];
      language?: 'zh-CN' | 'en-US';
    };
    const lessonTitle = body.lessonTitle?.trim() || 'the lesson';
    const slides = Array.isArray(body.slides) ? body.slides : [];
    const language = body.language === 'zh-CN' ? 'zh-CN' : 'en-US';
    if (slides.length === 0) {
      return Response.json({ success: false, error: 'slides are required' }, { status: 400 });
    }

    const { model, modelInfo } = resolveModelFromHeaders(req);
    const compactSlides = slides.map((s) => ({
      pageNumber: s.pageNumber,
      title: s.title || `Slide ${s.pageNumber}`,
      text: (s.text || '').slice(0, 3500),
    }));

    const system = `You write high-quality teacher narration scripts for classroom slides.
Return JSON only.
Target language: ${language === 'zh-CN' ? 'Chinese (Simplified)' : 'English'}.
For each slide, produce 4 to 6 lines, each line 1 spoken sentence.
Each line must teach concrete content from the slide text and collectively cover the important points from the slide (terms, concepts, relationships, examples).
Never output generic filler like "this slide focuses on..." or "key ideas shown here".
If one slide has little text, borrow context from neighboring slides and lesson title.
Tone: clear, teacher-like, concise, natural speech for TTS.
`;

    const prompt = `Lesson title: ${lessonTitle}
Slides:
${JSON.stringify(compactSlides)}

Return exactly this shape:
{
  "scripts": [
    { "pageNumber": 1, "lines": ["...", "...", "...", "..."] }
  ]
}`;

    const llm = await callLLM(
      {
        model,
        system,
        prompt,
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'gamma-scripts',
      { retries: 1 },
    );

    const repaired = jsonrepair(extractJsonObject(llm.text));
    const parsed = JSON.parse(repaired) as { scripts?: ScriptOutput[] };
    const scripts = Array.isArray(parsed.scripts) ? parsed.scripts : [];

    return Response.json({ success: true, scripts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, error: 'Failed to generate Gamma scripts', details: message },
      { status: 500 },
    );
  }
}

