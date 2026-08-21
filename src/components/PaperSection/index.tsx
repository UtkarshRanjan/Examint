"use client";

import { useState } from "react";
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Trash2,
  ChevronDown,
  ChevronUp,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTENT_TYPE_LABELS } from "@/lib/types";
import type { ContentItemType } from "@/lib/types";
import { cn, sumMarks } from "@/lib/utils";

/**
 * A question within a paper section.
 */
export interface PaperQuestionData {
  id: string;
  sectionId: string;
  contentItemId: string | null;
  snapshotText: string | null;
  snapshotImageUrl: string | null;
  marks: number;
  order: number;
  /** Denormalised type for display (from the source ContentItem, cached). */
  type?: string;
}

/**
 * A section within the paper canvas.
 */
export interface PaperSectionData {
  id: string;
  title: string;
  instructions: string | null;
  order: number;
  questions: PaperQuestionData[];
}

/**
 * Props for the PaperSection component.
 */
interface PaperSectionProps {
  section: PaperSectionData;
  /** Called when the section title or instructions are edited. */
  onUpdateSection: (
    sectionId: string,
    updates: { title?: string; instructions?: string }
  ) => void;
  /** Called when the section is deleted. */
  onDeleteSection: (sectionId: string) => void;
  /** Called when a question's marks value is changed. */
  onUpdateQuestionMarks: (questionId: string, marks: number) => void;
  /** Called when a question is removed from the section. */
  onDeleteQuestion: (questionId: string) => void;
  /**
   * Whether this section is currently the active drop target
   * (a content item is being dragged over it from the sidebar).
   */
  isDropTarget?: boolean;
}

/**
 * A single sortable question row within a PaperSection.
 * Uses @dnd-kit's `useSortable` for within-section drag-to-reorder.
 */
function SortableQuestion({
  question,
  questionNumber,
  onUpdateMarks,
  onDelete,
}: {
  question: PaperQuestionData;
  questionNumber: number;
  onUpdateMarks: (marks: number) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [localMarks, setLocalMarks] = useState(String(question.marks));
  const typeInfo =
    CONTENT_TYPE_LABELS[(question.type as ContentItemType) ?? "other"] ??
    CONTENT_TYPE_LABELS.other;

  /**
   * Commits the marks value on blur.
   * Parses the input value and calls onUpdateMarks with the clamped result.
   */
  function commitMarks() {
    const parsed = parseInt(localMarks, 10);
    const clamped = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setLocalMarks(String(clamped));
    onUpdateMarks(clamped);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-2 rounded border bg-white p-2 text-sm",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 cursor-grab text-zinc-300 hover:text-zinc-500 active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Question number */}
      <span className="font-medium text-zinc-500 w-6 text-right shrink-0 mt-0.5">
        {questionNumber}.
      </span>

      {/* Content preview */}
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "text-xs font-medium rounded-full px-1.5 py-0.5 mr-1",
            typeInfo.color
          )}
        >
          {typeInfo.label}
        </span>
        <span className="text-zinc-700 line-clamp-2">
          {question.snapshotText ||
            (question.snapshotImageUrl ? "[Image]" : "(empty)")}
        </span>
      </div>

      {/* Marks input */}
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          min={0}
          value={localMarks}
          onChange={(e) => setLocalMarks(e.target.value)}
          onBlur={commitMarks}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitMarks();
          }}
          className="w-14 rounded border border-zinc-200 px-1.5 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-zinc-400"
          aria-label="Marks"
          title="Marks for this question"
        />
        <span className="text-xs text-zinc-400">mk</span>
      </div>

      {/* Delete question button */}
      <button
        onClick={onDelete}
        className="text-zinc-300 hover:text-red-500 mt-0.5 transition-colors"
        aria-label="Remove question"
        title="Remove question"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * PaperSection — A single section block in the Paper Editor's right panel.
 *
 * Features:
 * - Inline editable section title and instructions (click to edit, blur to save).
 * - Collapsible question list (collapse button in header).
 * - A droppable zone indicator (highlighted border) when a content item is
 *   being dragged from the sidebar over this section.
 * - Section marks subtotal shown in the section header.
 * - "Delete Section" button removes the section and all its questions.
 * - Each question is a sortable row via @dnd-kit.
 */
export default function PaperSection({
  section,
  onUpdateSection,
  onDeleteSection,
  onUpdateQuestionMarks,
  onDeleteQuestion,
  isDropTarget = false,
}: PaperSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(section.title);
  const [instructionsInput, setInstructionsInput] = useState(
    section.instructions ?? ""
  );

  const sectionMarks = sumMarks(section.questions);
  const questionIds = section.questions.map((q) => q.id);

  /**
   * Saves the title and instructions after the user finishes editing.
   * Only sends an update if the values have actually changed.
   */
  function commitSectionEdit() {
    setEditingTitle(false);
    const updates: { title?: string; instructions?: string } = {};
    if (titleInput.trim() !== section.title)
      updates.title = titleInput.trim() || section.title;
    if (instructionsInput !== (section.instructions ?? ""))
      updates.instructions = instructionsInput;
    if (Object.keys(updates).length > 0) {
      onUpdateSection(section.id, updates);
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border-2 transition-colors",
        isDropTarget
          ? "border-blue-400 bg-blue-50"
          : "border-zinc-200 bg-zinc-50"
      )}
      data-section-id={section.id}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Collapse toggle */}
        <button
          onClick={() => setIsCollapsed((v) => !v)}
          className="text-zinc-400 hover:text-zinc-700 transition-colors"
          aria-label={isCollapsed ? "Expand section" : "Collapse section"}
        >
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </button>

        {/* Section title (inline editable) */}
        {editingTitle ? (
          <div className="flex-1 space-y-1">
            <Input
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={commitSectionEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSectionEdit();
                if (e.key === "Escape") {
                  setTitleInput(section.title);
                  setEditingTitle(false);
                }
              }}
              className="h-7 text-sm font-medium"
              autoFocus
            />
            <Input
              value={instructionsInput}
              onChange={(e) => setInstructionsInput(e.target.value)}
              onBlur={commitSectionEdit}
              placeholder="Instructions (optional)"
              className="h-6 text-xs"
            />
          </div>
        ) : (
          <div
            className="flex-1 cursor-text"
            onClick={() => setEditingTitle(true)}
            title="Click to edit section title"
          >
            <p className="font-medium text-zinc-900 text-sm">{section.title}</p>
            {section.instructions && (
              <p className="text-xs text-zinc-500 italic">{section.instructions}</p>
            )}
          </div>
        )}

        {/* Section marks total */}
        <span className="shrink-0 text-xs font-medium text-zinc-600 bg-white border rounded-full px-2 py-0.5">
          {sectionMarks} mk
        </span>

        {/* Delete section */}
        <button
          onClick={() => {
            if (
              confirm(
                `Delete section "${section.title}" and all its questions?`
              )
            ) {
              onDeleteSection(section.id);
            }
          }}
          className="text-zinc-300 hover:text-red-500 transition-colors shrink-0"
          title="Delete section"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Questions list */}
      {!isCollapsed && (
        <div className="px-3 pb-3 space-y-1.5">
          {section.questions.length === 0 ? (
            /* Empty drop zone hint */
            <div className="flex flex-col items-center justify-center py-4 text-center rounded border-2 border-dashed border-zinc-200">
              <Plus className="h-5 w-5 text-zinc-300 mb-1" />
              <p className="text-xs text-zinc-400">
                Drag questions here from the sidebar
              </p>
            </div>
          ) : (
            <SortableContext
              items={questionIds}
              strategy={verticalListSortingStrategy}
            >
              {section.questions.map((q, idx) => (
                <SortableQuestion
                  key={q.id}
                  question={q}
                  questionNumber={idx + 1}
                  onUpdateMarks={(marks) => onUpdateQuestionMarks(q.id, marks)}
                  onDelete={() => onDeleteQuestion(q.id)}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}
