import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS class names, resolving conflicts intelligently.
 * Built on `clsx` (handles conditionals/arrays) and `tailwind-merge`
 * (removes conflicting Tailwind utilities like `p-2` vs `p-4`).
 *
 * Used by all shadcn/ui components and throughout the application.
 *
 * @param inputs - Any number of class values (strings, objects, arrays).
 * @returns A single merged className string.
 *
 * @example
 *   cn("px-4 py-2", isActive && "bg-blue-500", "px-6")
 *   // Returns: "py-2 bg-blue-500 px-6" (px-4 overridden by px-6)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a Date object or ISO string into a human-readable display string.
 * Used throughout the UI for showing created/updated dates.
 *
 * @param date - A Date object, ISO string, or null/undefined.
 * @returns A formatted date string (e.g. "20 Aug 2026") or "—" if null.
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Truncates a string to a maximum number of characters, appending "…" if cut.
 * Used in ContentCard previews and paper question previews.
 *
 * @param text - The text to truncate.
 * @param maxLength - Maximum number of characters (default: 150).
 * @returns Truncated string with ellipsis if over limit.
 */
export function truncate(text: string, maxLength = 150): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}

/**
 * Calculates the total marks for an array of questions.
 * Used by PaperCanvas and PaperSection to show live running totals.
 *
 * @param questions - Array of objects with a numeric `marks` property.
 * @returns Sum of all marks values.
 */
export function sumMarks(questions: { marks: number }[]): number {
  return questions.reduce((sum, q) => sum + (q.marks || 0), 0);
}
