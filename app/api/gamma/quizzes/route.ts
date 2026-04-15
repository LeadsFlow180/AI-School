import { type NextRequest } from 'next/server';
import { jsonrepair } from 'jsonrepair';
import { callLLM } from '@/lib/ai/llm';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';

type SlideInput = {
  pageNumber: number;
  text?: string;
  title?: string;
};

type QuizQuestion = {
  id: string;
  type: 'single' | 'multiple';
  question: string;
  options: Array<{ label: string; value: string }>;
  answer: string[];
  analysis?: string;
  points?: number;
};

type QuizPack = {
  afterPageNumber: number;
  questions: QuizQuestion[];
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
    };
    const lessonTitle = body.lessonTitle?.trim() || 'the lesson';
    const slides = Array.isArray(body.slides) ? body.slides : [];
    if (slides.length === 0) {
      return Response.json({ success: false, error: 'slides are required' }, { status: 400 });
    }

    const compactSlides = slides.map((s) => ({
      pageNumber: s.pageNumber,
      title: s.title || `Slide ${s.pageNumber}`,
      text: (s.text || '').slice(0, 500),
    }));

    const { model, modelInfo } = resolveModelFromHeaders(req);
    const system = `You generate a single final quiz for classroom slides.
Return JSON only.
Create exactly one quiz pack, and place it after the final slide.
The quiz pack must include 5 to 10 multiple-choice questions.
Use only facts from the provided slide text.
Each question must have 4 options with values A,B,C,D and one correct answer.
`;

    const prompt = `Lesson title: ${lessonTitle}
Slides:
${JSON.stringify(compactSlides)}

Return exactly this shape:
{
  "quizzes": [
    {
      "afterPageNumber": ${compactSlides.length},
      "questions": [
        {
          "id": "q1",
          "type": "single",
          "question": "Question text",
          "options": [
            { "label": "Option text", "value": "A" },
            { "label": "Option text", "value": "B" },
            { "label": "Option text", "value": "C" },
            { "label": "Option text", "value": "D" }
          ],
          "answer": ["A"],
          "analysis": "Short explanation",
          "points": 1
        }
      ]
    }
  ]
}`;

    const llm = await callLLM(
      {
        model,
        system,
        prompt,
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'gamma-quizzes',
      { retries: 1 },
    );

    const repaired = jsonrepair(extractJsonObject(llm.text));
    const parsed = JSON.parse(repaired) as { quizzes?: QuizPack[] };
    const quizzes = Array.isArray(parsed.quizzes) ? parsed.quizzes : [];

    return Response.json({ success: true, quizzes });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { success: false, error: 'Failed to generate Gamma quizzes', details: message },
      { status: 500 },
    );
  }
}

