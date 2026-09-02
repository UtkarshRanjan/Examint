"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
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
import { Input } from "@/components/ui/input";
import { CONTENT_TYPE_LABELS, formatQuestionLabel, formatSubquestionLabel } from "@/lib/types";
import type { ContentItemType, NumberingFormat } from "@/lib/types";
import {
  getSubquestions,
  getTopLevelQuestions,
  sumSectionMarks,
} from "@/lib/paper-questions";
import { cn } from "@/lib/utils";

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
  parentQuestionId?: string | null;
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

interface PaperSectionProps {
  section: PaperSectionData;
  numberingFormat: NumberingFormat;
  onUpdateSection: (
    sectionId: string,
    updates: { title?: string; instructions?: string }
  ) => void;
  onDeleteSection: (sectionId: string) => void;
  onUpdateQuestionMarks: (questionId: string, marks: number) => void;
  onDeleteQuestion: (questionId: string) => void;
  isDropTarget?: boolean;
  activeDropParentQuestionId?: string | null;
}

function QuestionContentPreview({ question }: { question: PaperQuestionData }) {
  const typeInfo =
    CONTENT_TYPE_LABELS[(question.type as ContentItemType) ?? "other"] ??
    CONTENT_TYPE_LABELS.other;

  return (
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
  );
}

function MarksInput({
  marks,
  onUpdateMarks,
}: {
  marks: number;
  onUpdateMarks: (marks: number) => void;
}) {
  const [localMarks, setLocalMarks] = useState(String(marks));

  function commitMarks() {
    const parsed = parseInt(localMarks, 10);
    const clamped = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setLocalMarks(String(clamped));
    onUpdateMarks(clamped);
  }

  return (
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
  );
}

function SortableSubquestion({
  question,
  subIndex,
  onUpdateMarks,
  onDelete,
}: {
  question: PaperQuestionData;
  subIndex: number;
  onUpdateMarks: (marks: number) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-2 rounded border bg-white p-2 text-sm ml-6",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 cursor-grab text-zinc-300 hover:text-zinc-500 active:cursor-grabbing touch-none"
        aria-label="Drag to reorder subquestion"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="font-medium text-zinc-500 w-10 shrink-0 mt-0.5">
        {formatSubquestionLabel(subIndex)}
      </span>
      <QuestionContentPreview question={question} />
      <MarksInput marks={question.marks} onUpdateMarks={onUpdateMarks} />
      <button
        onClick={onDelete}
        className="text-zinc-300 hover:text-red-500 mt-0.5 transition-colors"
        aria-label="Remove subquestion"
        title="Remove subquestion"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TopLevelQuestion({
  question,
  questionNumber,
  numberingFormat,
  allQuestions,
  isDropTarget,
  onUpdateQuestionMarks,
  onDeleteQuestion,
}: {
  question: PaperQuestionData;
  questionNumber: number;
  numberingFormat: NumberingFormat;
  allQuestions: PaperQuestionData[];
  isDropTarget: boolean;
  onUpdateQuestionMarks: (questionId: string, marks: number) => void;
  onDeleteQuestion: (questionId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: question.id });

  const { setNodeRef: setSubDropRef } = useDroppable({
    id: `question-drop-${question.id}`,
    data: { droppableParentQuestion: question.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const subquestions = getSubquestions(allQuestions, question.id);
  const subTotal = subquestions.reduce((sum, q) => sum + (q.marks || 0), 0);
  const label = formatQuestionLabel(questionNumber, numberingFormat);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded border bg-white",
        isDragging && "opacity-50 shadow-lg",
        isDropTarget && "ring-2 ring-blue-400"
      )}
    >
      <div className="flex items-start gap-2 p-2 text-sm">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab text-zinc-300 hover:text-zinc-500 active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="font-medium text-zinc-500 shrink-0 mt-0.5 min-w-[2rem]">
          {label}
        </span>
        <QuestionContentPreview question={question} />
        {subquestions.length === 0 && (
          <MarksInput
            marks={question.marks}
            onUpdateMarks={(marks) => onUpdateQuestionMarks(question.id, marks)}
          />
        )}
        <button
          onClick={() => onDeleteQuestion(question.id)}
          className="text-zinc-300 hover:text-red-500 mt-0.5 transition-colors shrink-0"
          aria-label="Remove question"
          title="Remove question"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        ref={setSubDropRef}
        className={cn(
          "px-2 pb-2 space-y-1.5",
          subquestions.length === 0 &&
            "mx-2 mb-2 rounded border-2 border-dashed border-zinc-200 py-3"
        )}
      >
        {subquestions.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center">
            Drag content here to add subquestions
          </p>
        ) : (
          <SortableContext
            items={subquestions.map((q) => q.id)}
            strategy={verticalListSortingStrategy}
          >
            {subquestions.map((sub, idx) => (
              <SortableSubquestion
                key={sub.id}
                question={sub}
                subIndex={idx + 1}
                onUpdateMarks={(marks) => onUpdateQuestionMarks(sub.id, marks)}
                onDelete={() => onDeleteQuestion(sub.id)}
              />
            ))}
          </SortableContext>
        )}
        {subquestions.length > 0 && (
          <div className="flex justify-end pr-2 pt-1">
            <span className="text-xs font-medium text-zinc-600">
              Total: {subTotal} mark{subTotal !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaperSection({
  section,
  numberingFormat,
  onUpdateSection,
  onDeleteSection,
  onUpdateQuestionMarks,
  onDeleteQuestion,
  isDropTarget = false,
  activeDropParentQuestionId = null,
}: PaperSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(section.title);
  const [instructionsInput, setInstructionsInput] = useState(
    section.instructions ?? ""
  );

  const sectionMarks = sumSectionMarks(section.questions);
  const topLevelQuestions = getTopLevelQuestions(section.questions);
  const topLevelIds = topLevelQuestions.map((q) => q.id);

  const { setNodeRef: setDropRef } = useDroppable({
    id: `section-drop-${section.id}`,
    data: { droppableSection: section.id },
  });

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
      <div className="flex items-center gap-2 px-3 py-2">
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

        <span className="shrink-0 text-xs font-medium text-zinc-600 bg-white border rounded-full px-2 py-0.5">
          {sectionMarks} mk
        </span>

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

      {!isCollapsed && (
        <div ref={setDropRef} className="px-3 pb-3 space-y-1.5">
          {topLevelQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-center rounded border-2 border-dashed border-zinc-200">
              <Plus className="h-5 w-5 text-zinc-300 mb-1" />
              <p className="text-xs text-zinc-400">
                Drag questions here from the sidebar
              </p>
            </div>
          ) : (
            <SortableContext
              items={topLevelIds}
              strategy={verticalListSortingStrategy}
            >
              {topLevelQuestions.map((q, idx) => (
                <TopLevelQuestion
                  key={q.id}
                  question={q}
                  questionNumber={idx + 1}
                  numberingFormat={numberingFormat}
                  allQuestions={section.questions}
                  isDropTarget={activeDropParentQuestionId === q.id}
                  onUpdateQuestionMarks={onUpdateQuestionMarks}
                  onDeleteQuestion={onDeleteQuestion}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}
