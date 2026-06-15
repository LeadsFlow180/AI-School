'use client';

import { db, quizResultKey } from '@/lib/utils/database';
import type { QuizQuestionResultRecord, QuizResultPayload } from '@/lib/types/quiz-result';

export async function saveQuizResultLocal(payload: QuizResultPayload): Promise<void> {
  await db.quizResults.put({
    id: quizResultKey(payload.classroomId, payload.sceneId),
    stageId: payload.classroomId,
    sceneId: payload.sceneId,
    score: payload.score,
    totalPoints: payload.totalPoints,
    percent: payload.percent,
    correctCount: payload.correctCount,
    incorrectCount: payload.incorrectCount,
    questionCount: payload.questionCount,
    submittedAt: Date.parse(payload.submittedAt) || Date.now(),
    results: JSON.stringify(payload.results),
    answers: payload.answers ? JSON.stringify(payload.answers) : undefined,
  });
}

export async function loadQuizResultLocal(
  classroomId: string,
  sceneId: string,
): Promise<QuizResultPayload | null> {
  const row = await db.quizResults.get(quizResultKey(classroomId, sceneId));
  if (!row) return null;
  try {
    const results = JSON.parse(row.results) as QuizQuestionResultRecord[];
    const answers = row.answers
      ? (JSON.parse(row.answers) as Record<string, string | string[]>)
      : undefined;
    return {
      classroomId,
      sceneId: row.sceneId,
      score: row.score,
      totalPoints: row.totalPoints,
      percent: row.percent,
      correctCount: row.correctCount,
      incorrectCount: row.incorrectCount,
      questionCount: row.questionCount,
      submittedAt: new Date(row.submittedAt).toISOString(),
      results,
      answers,
    };
  } catch {
    return null;
  }
}

export async function clearQuizResultLocal(classroomId: string, sceneId: string): Promise<void> {
  await db.quizResults.delete(quizResultKey(classroomId, sceneId));
}

export async function listQuizResultsForClassroom(
  classroomId: string,
): Promise<QuizResultPayload[]> {
  const rows = await db.quizResults.where('stageId').equals(classroomId).toArray();
  const out: QuizResultPayload[] = [];
  for (const row of rows) {
    const parsed = await loadQuizResultLocal(classroomId, row.sceneId);
    if (parsed) out.push(parsed);
  }
  return out.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}
