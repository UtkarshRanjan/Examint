"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { CONTENT_TYPE_LABELS } from "@/lib/types";
import type { ContentItemType, PaperHeaderConfig, PaperFooterConfig, NumberingFormat } from "@/lib/types";
import { formatQuestionLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A single question displayed in the preview.
 */
interface PreviewQuestion {
  id: string;
  snapshotText: string | null;
  snapshotImageUrl: string | null;
  marks: number;
  order: number;
  type?: string;
}

/**
 * A section displayed in the preview.
 */
interface PreviewSection {
  id: string;
  title: string;
  instructions: string | null;
  order: number;
  questions: PreviewQuestion[];
}

/**
 * Props for the PaperPreview component.
 */
interface PaperPreviewProps {
  title: string;
  headerConfig: PaperHeaderConfig;
  footerConfig: PaperFooterConfig;
  numberingFormat: NumberingFormat;
  sections: PreviewSection[];
  /**
   * Called when the teacher saves an inline text/marks edit.
   * @param questionId - The question being edited.
   * @param updates    - The updated fields.
   */
  onUpdateQuestion: (
    questionId: string,
    updates: { snapshotText?: string; marks?: number }
  ) => Promise<void>;
}

/**
 * PaperPreview — A4-style paper preview component.
 *
 * Renders an approximation of the final DOCX output in HTML, styled to
 * resemble an A4 page with proper margins and typography.
 *
 * Features:
 * - A4 white pages on a gray background (like a PDF viewer).
 * - Header: school name, subject, class, date, logo, instructions.
 * - Sections with numbered questions and marks.
 * - Embedded image thumbnails for photo/diagram question types.
 * - Footer: signature line, custom text.
 *
 * Inline editing:
 * - Click any question text → inline textarea appears.
 * - Click any marks value → inline number input.
 * - "Save" (check icon) / "Cancel" (X icon) buttons.
 * - Changes are auto-saved to the DB via onUpdateQuestion.
 *
 * This component is purely presentational — it does NOT handle navigation
 * ("Back to Editor", "Export DOCX" are in the parent preview page).
 */
export default function PaperPreview({
  title,
  headerConfig,
  footerConfig,
  numberingFormat,
  sections,
  onUpdateQuestion,
}: PaperPreviewProps) {
  // Track which question is currently being edited (only one at a time).
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editMarks, setEditMarks] = useState(0);
  const [editingField, setEditingField] = useState<"text" | "marks" | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Starts inline text editing for a question.
   *
   * @param question - The question to edit.
   */
  function startEditText(question: PreviewQuestion) {
    setEditingQuestionId(question.id);
    setEditText(question.snapshotText ?? "");
    setEditMarks(question.marks);
    setEditingField("text");
  }

  /**
   * Starts inline marks editing for a question.
   *
   * @param question - The question to edit.
   */
  function startEditMarks(question: PreviewQuestion) {
    setEditingQuestionId(question.id);
    setEditText(question.snapshotText ?? "");
    setEditMarks(question.marks);
    setEditingField("marks");
  }

  /**
   * Commits the inline edit by calling onUpdateQuestion with the changed values.
   * Reverts the edit UI on success or failure.
   */
  async function commitEdit() {
    if (!editingQuestionId) return;
    setIsSaving(true);
    try {
      await onUpdateQuestion(editingQuestionId, {
        snapshotText: editText,
        marks: editMarks,
      });
      cancelEdit();
    } catch {
      // Error toast shown by parent; keep editing state open so teacher can retry.
    } finally {
      setIsSaving(false);
    }
  }

  /** Cancels the current inline edit without saving. */
  function cancelEdit() {
    setEditingQuestionId(null);
    setEditText("");
    setEditMarks(0);
    setEditingField(null);
  }

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col items-center gap-8 py-8 px-4">
      {/* A4 Page */}
      <div
        className="bg-white shadow-xl w-full"
        style={{
          maxWidth: "794px", // A4 width at 96 DPI
          minHeight: "1123px", // A4 height at 96 DPI
          padding: "72px 80px", // ~1 inch margins
          fontFamily: "Georgia, serif",
          fontSize: "13px",
          lineHeight: "1.6",
          position: "relative",
        }}
      >
        {/* ── Header ── */}
        {(headerConfig.schoolName ||
          headerConfig.subject ||
          headerConfig.logoUrl) && (
          <div
            style={{
              borderBottom: "2px solid #000",
              paddingBottom: "12px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            {/* Logo */}
            {headerConfig.logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={headerConfig.logoUrl}
                alt="School logo"
                style={{ height: "64px", width: "64px", objectFit: "contain" }}
              />
            )}

            {/* School details */}
            <div style={{ flex: 1, textAlign: "center" }}>
              {headerConfig.schoolName && (
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: "bold",
                    marginBottom: "4px",
                  }}
                >
                  {headerConfig.schoolName}
                </div>
              )}
              <div style={{ fontSize: "12px", color: "#444" }}>
                {[
                  headerConfig.subject,
                  headerConfig.className,
                  headerConfig.date,
                ]
                  .filter(Boolean)
                  .join("  |  ")}
              </div>
            </div>
          </div>
        )}

        {/* Paper title */}
        <h1
          style={{
            textAlign: "center",
            fontSize: "18px",
            fontWeight: "bold",
            marginBottom: "8px",
          }}
        >
          {title}
        </h1>

        {/* Global instructions */}
        {headerConfig.instructions && (
          <p
            style={{
              textAlign: "center",
              fontStyle: "italic",
              fontSize: "12px",
              color: "#555",
              marginBottom: "20px",
            }}
          >
            {headerConfig.instructions}
          </p>
        )}

        {/* ── Sections ── */}
        {sortedSections.map((section) => {
          const sortedQuestions = [...section.questions].sort(
            (a, b) => a.order - b.order
          );

          return (
            <div key={section.id} style={{ marginBottom: "24px" }}>
              {/* Section title */}
              <div
                style={{
                  fontWeight: "bold",
                  textDecoration: "underline",
                  fontSize: "13px",
                  marginBottom: "4px",
                }}
              >
                {section.title}
              </div>

              {/* Section instructions */}
              {section.instructions && (
                <div
                  style={{
                    fontStyle: "italic",
                    fontSize: "12px",
                    color: "#555",
                    marginBottom: "8px",
                  }}
                >
                  {section.instructions}
                </div>
              )}

              {/* Questions */}
              <div style={{ paddingLeft: "8px" }}>
                {sortedQuestions.map((question, qIdx) => {
                  const label = formatQuestionLabel(qIdx + 1, numberingFormat);
                  const isEditing = editingQuestionId === question.id;
                  const typeInfo =
                    CONTENT_TYPE_LABELS[
                      (question.type as ContentItemType) ?? "other"
                    ] ?? CONTENT_TYPE_LABELS.other;

                  return (
                    <div
                      key={question.id}
                      style={{ marginBottom: "12px", display: "flex", gap: "8px" }}
                    >
                      {/* Question number */}
                      <span
                        style={{
                          fontWeight: "bold",
                          minWidth: "32px",
                          flexShrink: 0,
                        }}
                      >
                        {label}
                      </span>

                      {/* Question content */}
                      <div style={{ flex: 1 }}>
                        {/* Type chip (only in preview, not in DOCX) */}
                        <span
                          className={cn(
                            "text-xs font-medium rounded-full px-1.5 py-0.5 mr-2",
                            typeInfo.color
                          )}
                          style={{ fontSize: "10px" }}
                        >
                          {typeInfo.label}
                        </span>

                        {/* Inline text edit */}
                        {isEditing && editingField === "text" ? (
                          <div className="mt-1">
                            <textarea
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={3}
                              className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 resize-none"
                              onKeyDown={(e) => {
                                if (e.key === "Escape") cancelEdit();
                              }}
                            />
                            <div className="flex items-center gap-1 mt-1">
                              <button
                                onClick={commitEdit}
                                disabled={isSaving}
                                className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 border border-green-300 rounded px-2 py-0.5"
                              >
                                <Check className="h-3 w-3" />
                                {isSaving ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded px-2 py-0.5"
                              >
                                <X className="h-3 w-3" />
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span
                            onClick={() => startEditText(question)}
                            title="Click to edit question text"
                            className="cursor-text hover:bg-yellow-50 rounded px-0.5 transition-colors"
                          >
                            {question.snapshotText || (
                              <em style={{ color: "#999" }}>
                                {question.snapshotImageUrl
                                  ? "[Image question]"
                                  : "(empty)"}
                              </em>
                            )}
                          </span>
                        )}

                        {/* Image thumbnail */}
                        {question.snapshotImageUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={question.snapshotImageUrl}
                            alt="Question image"
                            style={{
                              display: "block",
                              maxWidth: "400px",
                              maxHeight: "200px",
                              objectFit: "contain",
                              marginTop: "8px",
                              border: "1px solid #eee",
                              borderRadius: "4px",
                            }}
                          />
                        )}
                      </div>

                      {/* Marks (inline editable) */}
                      <div style={{ flexShrink: 0, minWidth: "64px", textAlign: "right" }}>
                        {isEditing && editingField === "marks" ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              type="number"
                              min={0}
                              value={editMarks}
                              onChange={(e) =>
                                setEditMarks(
                                  Math.max(0, parseInt(e.target.value, 10) || 0)
                                )
                              }
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit();
                                if (e.key === "Escape") cancelEdit();
                              }}
                              className="w-14 rounded border border-zinc-300 px-1 py-0.5 text-center text-sm focus:outline-none"
                            />
                            <span className="text-xs text-zinc-500">mk</span>
                          </div>
                        ) : (
                          <span
                            onClick={() => startEditMarks(question)}
                            title="Click to edit marks"
                            className="cursor-pointer hover:bg-yellow-50 rounded px-1 font-medium transition-colors"
                            style={{ fontSize: "12px", color: "#333" }}
                          >
                            [{question.marks} mk]
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* ── Footer ── */}
        <div
          style={{
            borderTop: "1px solid #ccc",
            marginTop: "32px",
            paddingTop: "12px",
          }}
        >
          {footerConfig.signatureLine && (
            <div style={{ marginBottom: "8px", fontSize: "12px" }}>
              {footerConfig.signatureLine}: ___________________________
            </div>
          )}
          {footerConfig.customText && (
            <div
              style={{
                fontSize: "11px",
                color: "#666",
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              {footerConfig.customText}
            </div>
          )}
          {footerConfig.showPageNumbers && (
            <div
              style={{
                fontSize: "11px",
                color: "#999",
                textAlign: "center",
                marginTop: "4px",
              }}
            >
              Page 1
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
