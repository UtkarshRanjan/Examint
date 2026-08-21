/**
 * Examint — Shared TypeScript Types
 *
 * This file defines the shapes of all structured data used across the application.
 * Keeping types in one place ensures consistency between API routes, React
 * components, and the DOCX builder.
 */

// =============================================================================
// Content Item Types
// =============================================================================

/**
 * The possible categories of a content item extracted from an image.
 * These map to the `type` field on the `ContentItem` database model.
 */
export type ContentItemType =
  | "paragraph"
  | "question"
  | "photo"
  | "diagram"
  | "heading"
  | "other";

/** All valid ContentItemType values as a runtime-accessible array. */
export const CONTENT_ITEM_TYPES: ContentItemType[] = [
  "paragraph",
  "question",
  "photo",
  "diagram",
  "heading",
  "other",
];

/**
 * Display label and color chip style for each content type.
 * Used by ContentCard and the Content Bank filter chips.
 */
export const CONTENT_TYPE_LABELS: Record<
  ContentItemType,
  { label: string; color: string }
> = {
  paragraph: { label: "Paragraph", color: "bg-blue-100 text-blue-800" },
  question: { label: "Question", color: "bg-green-100 text-green-800" },
  photo: { label: "Photo", color: "bg-purple-100 text-purple-800" },
  diagram: { label: "Diagram", color: "bg-orange-100 text-orange-800" },
  heading: { label: "Heading", color: "bg-gray-100 text-gray-800" },
  other: { label: "Other", color: "bg-zinc-100 text-zinc-800" },
};

// =============================================================================
// Question Paper — Header / Footer Config Types
// =============================================================================

/**
 * Header configuration for a question paper.
 * Stored as a JSON string in `QuestionPaper.headerConfig`.
 * Rendered as a styled table (logo + school details) at the top of the DOCX.
 */
export interface PaperHeaderConfig {
  /** Full name of the school or institution. */
  schoolName: string;
  /** Subject name (e.g. "Mathematics", "Science"). */
  subject: string;
  /** Class or grade (e.g. "Class X", "Grade 8"). */
  className: string;
  /** Exam date as a display string (e.g. "20 August 2026"). */
  date: string;
  /**
   * Path to the uploaded school logo image inside uploads/<userId>/.
   * Empty string if no logo has been uploaded.
   */
  logoUrl: string;
  /** General instructions shown below the header (e.g. "Answer all questions"). */
  instructions: string;
}

/**
 * Footer configuration for a question paper.
 * Stored as a JSON string in `QuestionPaper.footerConfig`.
 */
export interface PaperFooterConfig {
  /** Whether to include a "Page X of Y" footer in the DOCX. */
  showPageNumbers: boolean;
  /**
   * Label for the signature line (e.g. "Teacher's Signature").
   * Empty string means no signature line is shown.
   */
  signatureLine: string;
  /** Additional custom text shown in the footer (e.g. school motto). */
  customText: string;
}

/** Default header config used when a new paper is created. */
export const DEFAULT_HEADER_CONFIG: PaperHeaderConfig = {
  schoolName: "",
  subject: "",
  className: "",
  date: "",
  logoUrl: "",
  instructions: "",
};

/** Default footer config used when a new paper is created. */
export const DEFAULT_FOOTER_CONFIG: PaperFooterConfig = {
  showPageNumbers: true,
  signatureLine: "Teacher's Signature",
  customText: "",
};

// =============================================================================
// Question Paper — Numbering Format
// =============================================================================

/**
 * Available question numbering formats for a paper.
 * Controls how questions are numbered in the preview and DOCX export.
 */
export type NumberingFormat = "1." | "Q1." | "(i)" | "a)";

export const NUMBERING_FORMATS: {
  value: NumberingFormat;
  label: string;
  example: string;
}[] = [
  { value: "1.", label: "1. 2. 3.", example: "1.  What is photosynthesis?" },
  { value: "Q1.", label: "Q1. Q2. Q3.", example: "Q1. What is photosynthesis?" },
  { value: "(i)", label: "(i) (ii) (iii)", example: "(i) What is photosynthesis?" },
  { value: "a)", label: "a) b) c)", example: "a)  What is photosynthesis?" },
];

/**
 * Generates the question label for a given 1-based question number
 * and numbering format.
 *
 * @param index - 1-based question number within the section.
 * @param format - The selected NumberingFormat for the paper.
 * @returns Formatted label string (e.g. "Q3." or "(iii)").
 */
export function formatQuestionLabel(
  index: number,
  format: NumberingFormat
): string {
  switch (format) {
    case "1.":
      return `${index}.`;
    case "Q1.":
      return `Q${index}.`;
    case "(i)":
      return `(${toRoman(index)})`;
    case "a)":
      return `${String.fromCharCode(96 + index)})`;
    default:
      return `${index}.`;
  }
}

/**
 * Converts a positive integer to a lowercase Roman numeral string.
 * Used for the "(i)" numbering format.
 *
 * @param num - A positive integer (1–39 covers all practical exam questions).
 * @returns Roman numeral string (e.g. 4 → "iv", 14 → "xiv").
 */
function toRoman(num: number): string {
  const vals = [10, 9, 5, 4, 1];
  const syms = ["x", "ix", "v", "iv", "i"];
  let result = "";
  for (let i = 0; i < vals.length; i++) {
    while (num >= vals[i]) {
      result += syms[i];
      num -= vals[i];
    }
  }
  return result;
}

// =============================================================================
// Gemini API Response Types
// =============================================================================

/**
 * A single extracted content block returned by the Gemini Vision API wrapper.
 * The Gemini prompt instructs the model to return an array of these objects.
 */
export interface GeminiExtractedBlock {
  /** Category of the extracted content block. */
  type: ContentItemType;
  /**
   * The extracted text for text-based blocks, or a brief AI-generated
   * description for photo/diagram blocks (e.g. "Bar chart showing rainfall data").
   */
  text: string;
}
