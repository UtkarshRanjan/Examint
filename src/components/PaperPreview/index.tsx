"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import type { PaperHeaderConfig, PaperFooterConfig, NumberingFormat } from "@/lib/types";
import { formatQuestionLabel, formatSubquestionLabel } from "@/lib/types";
import {
  getSubquestions,
  getTopLevelQuestions,
} from "@/lib/paper-questions";

interface PreviewQuestion {
  id: string;
  snapshotText: string | null;
  snapshotImageUrl: string | null;
  marks: number;
  order: number;
  parentQuestionId?: string | null;
}

interface PreviewSection {
  id: string;
  title: string;
  instructions: string | null;
  order: number;
  questions: PreviewQuestion[];
}

interface PaperPreviewProps {
  title: string;
  headerConfig: PaperHeaderConfig;
  footerConfig: PaperFooterConfig;
  numberingFormat: NumberingFormat;
  sections: PreviewSection[];
  onUpdateQuestion: (
    questionId: string,
    updates: { snapshotText?: string; marks?: number }
  ) => Promise<void>;
  onUpdateTitle: (title: string) => Promise<void>;
  onUpdateHeader: (updates: Partial<PaperHeaderConfig>) => Promise<void>;
  onUpdateFooter: (updates: Partial<PaperFooterConfig>) => Promise<void>;
  onUpdateSection: (
    sectionId: string,
    updates: { title?: string; instructions?: string }
  ) => Promise<void>;
}

const editableHover =
  "cursor-text hover:bg-yellow-50 rounded px-0.5 transition-colors";

interface EditableTextProps {
  editKey: string;
  value: string;
  placeholder: string;
  editingKey: string | null;
  editValue: string;
  isSaving: boolean;
  onStart: (key: string, value: string) => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  multiline?: boolean;
  style?: CSSProperties;
  className?: string;
}

function EditableText({
  editKey,
  value,
  placeholder,
  editingKey,
  editValue,
  isSaving,
  onStart,
  onChange,
  onSave,
  onCancel,
  multiline = false,
  style,
  className,
}: EditableTextProps) {
  const isEditing = editingKey === editKey;

  if (isEditing) {
    return (
      <div className={className}>
        {multiline ? (
          <textarea
            autoFocus
            value={editValue}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
          />
        ) : (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") onCancel();
            }}
          />
        )}
        <EditActions onSave={onSave} onCancel={onCancel} isSaving={isSaving} />
      </div>
    );
  }

  return (
    <span
      onClick={() => onStart(editKey, value)}
      title="Click to edit"
      className={`${editableHover} ${className ?? ""}`}
      style={style}
    >
      {value || <em style={{ color: "#999" }}>{placeholder}</em>}
    </span>
  );
}

function EditActions({
  onSave,
  onCancel,
  isSaving,
}: {
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="flex items-center gap-1 mt-1">
      <button
        onClick={onSave}
        disabled={isSaving}
        className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 border border-green-300 rounded px-2 py-0.5"
      >
        <Check className="h-3 w-3" />
        {isSaving ? "Saving…" : "Save"}
      </button>
      <button
        onClick={onCancel}
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded px-2 py-0.5"
      >
        <X className="h-3 w-3" />
        Cancel
      </button>
    </div>
  );
}

export default function PaperPreview({
  title,
  headerConfig,
  footerConfig,
  numberingFormat,
  sections,
  onUpdateQuestion,
  onUpdateTitle,
  onUpdateHeader,
  onUpdateFooter,
  onUpdateSection,
}: PaperPreviewProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function startEdit(key: string, value: string) {
    setEditingKey(key);
    setEditValue(value);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditValue("");
  }

  async function commitEdit() {
    if (!editingKey) return;
    setIsSaving(true);
    try {
      if (editingKey === "title") {
        await onUpdateTitle(editValue.trim());
      } else if (editingKey.startsWith("header:")) {
        const field = editingKey.replace("header:", "") as keyof PaperHeaderConfig;
        await onUpdateHeader({ [field]: editValue });
      } else if (editingKey.startsWith("section:")) {
        const [, sectionId, field] = editingKey.split(":");
        if (field === "title" || field === "instructions") {
          await onUpdateSection(sectionId, { [field]: editValue });
        }
      } else if (editingKey.startsWith("footer:")) {
        const field = editingKey.replace("footer:", "") as keyof PaperFooterConfig;
        await onUpdateFooter({ [field]: editValue });
      } else if (editingKey.endsWith(":text")) {
        const questionId = editingKey.replace(":text", "").replace("question:", "");
        await onUpdateQuestion(questionId, { snapshotText: editValue });
      } else if (editingKey.endsWith(":marks")) {
        const questionId = editingKey.replace(":marks", "").replace("question:", "");
        const marks = Math.max(0, parseInt(editValue, 10) || 0);
        await onUpdateQuestion(questionId, { marks });
      }
      cancelEdit();
    } catch {
      // Parent shows error toast; keep editor open.
    } finally {
      setIsSaving(false);
    }
  }

  const editableProps = {
    editingKey,
    editValue,
    isSaving,
    onStart: startEdit,
    onChange: setEditValue,
    onSave: commitEdit,
    onCancel: cancelEdit,
  };

  function renderQuestionRow(
    question: PreviewQuestion,
    label: string,
    options: { indent?: boolean; showMarks?: boolean } = {}
  ) {
    const { indent = false, showMarks = true } = options;
    const textKey = `question:${question.id}:text`;
    const marksKey = `question:${question.id}:marks`;
    const isEditingText = editingKey === textKey;
    const isEditingMarks = editingKey === marksKey;

    return (
      <div
        key={question.id}
        style={{
          marginBottom: "12px",
          display: "flex",
          gap: "8px",
          paddingLeft: indent ? "24px" : undefined,
        }}
      >
        <span
          style={{
            fontWeight: "bold",
            minWidth: "32px",
            flexShrink: 0,
          }}
        >
          {label}
        </span>

        <div style={{ flex: 1 }}>
          {isEditingText ? (
            <div className="mt-1">
              <textarea
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={3}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Escape") cancelEdit();
                }}
              />
              <EditActions
                onSave={commitEdit}
                onCancel={cancelEdit}
                isSaving={isSaving}
              />
            </div>
          ) : (
            <span
              onClick={() => startEdit(textKey, question.snapshotText ?? "")}
              title="Click to edit question text"
              className={editableHover}
            >
              {question.snapshotText || (
                <em style={{ color: "#999" }}>
                  {question.snapshotImageUrl ? "[Image question]" : "(empty)"}
                </em>
              )}
            </span>
          )}

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

        {showMarks && (
          <div style={{ flexShrink: 0, minWidth: "64px", textAlign: "right" }}>
            {isEditingMarks ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  type="number"
                  min={0}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  className="w-14 rounded border border-zinc-300 px-1 py-0.5 text-center text-sm focus:outline-none"
                />
                <span className="text-xs text-zinc-500">mk</span>
                <EditActions
                  onSave={commitEdit}
                  onCancel={cancelEdit}
                  isSaving={isSaving}
                />
              </div>
            ) : (
              <span
                onClick={() => startEdit(marksKey, String(question.marks))}
                title="Click to edit marks"
                className={`cursor-pointer ${editableHover} font-medium`}
                style={{ fontSize: "12px", color: "#333" }}
              >
                [{question.marks} mk]
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderMetaLine(parts: ReactNode[]) {
    return (
      <div style={{ fontSize: "12px", color: "#444" }}>
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 && "  |  "}
            {part}
          </span>
        ))}
      </div>
    );
  }

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col items-center gap-8 py-8 px-4">
      <div
        className="bg-white shadow-xl w-full"
        style={{
          maxWidth: "794px",
          minHeight: "1123px",
          padding: "72px 80px",
          fontFamily: "Georgia, serif",
          fontSize: "13px",
          lineHeight: "1.6",
          position: "relative",
        }}
      >
        {/* Header */}
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
          {headerConfig.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={headerConfig.logoUrl}
              alt="School logo"
              style={{ height: "64px", width: "64px", objectFit: "contain" }}
            />
          )}

          <div style={{ flex: 1, textAlign: "center" }}>
            <EditableText
              editKey="header:schoolName"
              value={headerConfig.schoolName}
              placeholder="Click to add school name"
              style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "4px", display: "block" }}
              {...editableProps}
            />
            {renderMetaLine([
              <EditableText
                key="subject"
                editKey="header:subject"
                value={headerConfig.subject}
                placeholder="Subject"
                {...editableProps}
              />,
              <EditableText
                key="class"
                editKey="header:className"
                value={headerConfig.className}
                placeholder="Class"
                {...editableProps}
              />,
              <EditableText
                key="date"
                editKey="header:date"
                value={headerConfig.date}
                placeholder="Date"
                {...editableProps}
              />,
            ])}
          </div>
        </div>

        {/* Paper title */}
        <h1
          style={{
            textAlign: "center",
            fontSize: "18px",
            fontWeight: "bold",
            marginBottom: "8px",
          }}
        >
          <EditableText
            editKey="title"
            value={title}
            placeholder="Click to add paper title"
            style={{ fontWeight: "bold" }}
            {...editableProps}
          />
        </h1>

        {/* Global instructions */}
        <p
          style={{
            textAlign: "center",
            fontStyle: "italic",
            fontSize: "12px",
            color: "#555",
            marginBottom: "20px",
          }}
        >
          <EditableText
            editKey="header:instructions"
            value={headerConfig.instructions}
            placeholder="Click to add instructions"
            multiline
            {...editableProps}
          />
        </p>

        {/* Sections */}
        {sortedSections.map((section) => {
          const topLevelQuestions = getTopLevelQuestions(section.questions);

          return (
            <div key={section.id} style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontWeight: "bold",
                  textDecoration: "underline",
                  fontSize: "13px",
                  marginBottom: "4px",
                }}
              >
                <EditableText
                  editKey={`section:${section.id}:title`}
                  value={section.title}
                  placeholder="Section title"
                  {...editableProps}
                />
              </div>

              <div
                style={{
                  fontStyle: "italic",
                  fontSize: "12px",
                  color: "#555",
                  marginBottom: "8px",
                }}
              >
                <EditableText
                  editKey={`section:${section.id}:instructions`}
                  value={section.instructions ?? ""}
                  placeholder="Click to add section instructions"
                  multiline
                  {...editableProps}
                />
              </div>

              <div style={{ paddingLeft: "8px" }}>
                {topLevelQuestions.map((question, qIdx) => {
                  const label = formatQuestionLabel(qIdx + 1, numberingFormat);
                  const subquestions = getSubquestions(section.questions, question.id);
                  const subTotal = subquestions.reduce(
                    (sum, sub) => sum + (sub.marks || 0),
                    0
                  );

                  return (
                    <div key={question.id} style={{ marginBottom: "16px" }}>
                      {renderQuestionRow(question, label, {
                        showMarks: subquestions.length === 0,
                      })}
                      {subquestions.map((sub, subIdx) =>
                        renderQuestionRow(
                          sub,
                          formatSubquestionLabel(subIdx + 1),
                          { indent: true }
                        )
                      )}
                      {subquestions.length > 0 && (
                        <div
                          style={{
                            textAlign: "right",
                            fontSize: "12px",
                            fontWeight: "bold",
                            paddingRight: "8px",
                            marginTop: "4px",
                          }}
                        >
                          Total: {subTotal} mark{subTotal !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div
          style={{
            borderTop: "1px solid #ccc",
            marginTop: "32px",
            paddingTop: "12px",
          }}
        >
          <div style={{ marginBottom: "8px", fontSize: "12px" }}>
            <EditableText
              editKey="footer:signatureLine"
              value={footerConfig.signatureLine}
              placeholder="Signature line label"
              {...editableProps}
            />
            : ___________________________
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "#666",
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            <EditableText
              editKey="footer:customText"
              value={footerConfig.customText}
              placeholder="Click to add footer text"
              multiline
              {...editableProps}
            />
          </div>
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
