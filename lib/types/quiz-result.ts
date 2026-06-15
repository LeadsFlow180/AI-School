/** Per-question outcome after grading (stored + synced to AGA). */
export type QuizQuestionResultRecord = {
  questionId: string;
  correct: boolean | null;
  status: 'correct' | 'incorrect';
  earned: number;
  aiComment?: string;
};

/** Saved quiz attempt for one scene in a classroom. */
export type QuizResultPayload = {
  sceneId: string;
  classroomId: string;
  score: number;
  totalPoints: number;
  percent: number;
  correctCount: number;
  incorrectCount: number;
  questionCount: number;
  submittedAt: string;
  results: QuizQuestionResultRecord[];
  /** Learner selections (for display in AGA). */
  answers?: Record<string, string | string[]>;
};
