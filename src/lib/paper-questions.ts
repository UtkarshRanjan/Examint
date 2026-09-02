/**
 * Shared helpers for paper question trees (top-level questions + subquestions).
 */

export interface PaperQuestionLike {
  id: string;
  marks: number;
  parentQuestionId?: string | null;
  order: number;
}

/** Returns top-level questions in a section (no parent), sorted by order. */
export function getTopLevelQuestions<T extends PaperQuestionLike>(
  questions: T[]
): T[] {
  return questions
    .filter((q) => !q.parentQuestionId)
    .sort((a, b) => a.order - b.order);
}

/** Returns subquestions for a parent question, sorted by order. */
export function getSubquestions<T extends PaperQuestionLike>(
  questions: T[],
  parentId: string
): T[] {
  return questions
    .filter((q) => q.parentQuestionId === parentId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Sums marks for a section's flat question list.
 * Parents with subquestions contribute the sum of subquestion marks only.
 */
export function sumSectionMarks(questions: PaperQuestionLike[]): number {
  return getTopLevelQuestions(questions).reduce((sum, q) => {
    const subs = getSubquestions(questions, q.id);
    if (subs.length > 0) {
      return sum + subs.reduce((s, sub) => s + (sub.marks || 0), 0);
    }
    return sum + (q.marks || 0);
  }, 0);
}
