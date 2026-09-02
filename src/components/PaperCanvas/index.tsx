"use client";

import { useState, useEffect, type ReactNode } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import PaperSection from "@/components/PaperSection";
import type {
  PaperSectionData,
  PaperQuestionData,
} from "@/components/PaperSection";
import {
  getSubquestions,
  getTopLevelQuestions,
  sumSectionMarks,
} from "@/lib/paper-questions";
import type { NumberingFormat } from "@/lib/types";

interface SidebarContentItem {
  id: string;
  type: string;
  textContent: string | null;
  imageUrl: string | null;
}

interface PaperCanvasProps {
  paperId: string;
  numberingFormat: NumberingFormat;
  initialSections: PaperSectionData[];
  onSave: (operations: PaperOperation[]) => Promise<void>;
  sidebar?: ReactNode;
}

type PaperOperation =
  | { type: "ADD_SECTION"; title: string; instructions?: string }
  | { type: "UPDATE_SECTION"; sectionId: string; title?: string; instructions?: string }
  | { type: "DELETE_SECTION"; sectionId: string }
  | { type: "REORDER_SECTIONS"; sectionIds: string[] }
  | {
      type: "ADD_QUESTION";
      sectionId: string;
      contentItemId?: string;
      snapshotText?: string;
      snapshotImageUrl?: string;
      marks?: number;
      parentQuestionId?: string | null;
    }
  | { type: "UPDATE_QUESTION"; questionId: string; marks?: number; snapshotText?: string }
  | { type: "DELETE_QUESTION"; questionId: string }
  | {
      type: "REORDER_QUESTIONS";
      sectionId: string;
      questionIds: string[];
      parentQuestionId?: string | null;
    };

function findQuestionInSections(
  sections: PaperSectionData[],
  questionId: string
): { section: PaperSectionData; question: PaperQuestionData } | null {
  for (const section of sections) {
    const question = section.questions.find((q) => q.id === questionId);
    if (question) return { section, question };
  }
  return null;
}

export default function PaperCanvas({
  paperId,
  numberingFormat,
  initialSections,
  onSave,
  sidebar,
}: PaperCanvasProps) {
  const [sections, setSections] = useState<PaperSectionData[]>(initialSections);

  useEffect(() => {
    setSections(initialSections);
  }, [initialSections]);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDropSectionId, setActiveDropSectionId] = useState<string | null>(null);
  const [activeDropParentQuestionId, setActiveDropParentQuestionId] = useState<
    string | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const grandTotal = sections.reduce(
    (sum, section) => sum + sumSectionMarks(section.questions),
    0
  );

  async function persist(operations: PaperOperation[]) {
    setIsSaving(true);
    const snapshot = sections;
    try {
      await onSave(operations);
    } catch (err) {
      setSections(snapshot);
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to save changes. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddSection() {
    const title = `Section ${String.fromCharCode(65 + sections.length)}`;
    const tempId = `temp-${Date.now()}`;
    const newSection: PaperSectionData = {
      id: tempId,
      title,
      instructions: null,
      order: sections.length,
      questions: [],
    };

    setSections((prev) => [...prev, newSection]);
    await persist([{ type: "ADD_SECTION", title }]);
  }

  async function handleUpdateSection(
    sectionId: string,
    updates: { title?: string; instructions?: string }
  ) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              title: updates.title ?? s.title,
              instructions:
                updates.instructions !== undefined
                  ? updates.instructions
                  : s.instructions,
            }
          : s
      )
    );
    await persist([{ type: "UPDATE_SECTION", sectionId, ...updates }]);
  }

  async function handleDeleteSection(sectionId: string) {
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
    await persist([{ type: "DELETE_SECTION", sectionId }]);
  }

  async function handleUpdateQuestionMarks(questionId: string, marks: number) {
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        questions: s.questions.map((q) =>
          q.id === questionId ? { ...q, marks } : q
        ),
      }))
    );
    await persist([{ type: "UPDATE_QUESTION", questionId, marks }]);
  }

  async function handleDeleteQuestion(questionId: string) {
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        questions: s.questions.filter(
          (q) => q.id !== questionId && q.parentQuestionId !== questionId
        ),
      }))
    );
    await persist([{ type: "DELETE_QUESTION", questionId }]);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id;
    if (!overId) {
      setActiveDropSectionId(null);
      setActiveDropParentQuestionId(null);
      return;
    }

    const overData = event.over?.data?.current as
      | { droppableSection?: string; droppableParentQuestion?: string }
      | undefined;

    if (overData?.droppableParentQuestion) {
      setActiveDropParentQuestionId(overData.droppableParentQuestion);
      const parent = findQuestionInSections(
        sections,
        overData.droppableParentQuestion
      );
      setActiveDropSectionId(parent?.section.id ?? null);
      return;
    }

    setActiveDropParentQuestionId(null);

    if (overData?.droppableSection) {
      setActiveDropSectionId(overData.droppableSection);
      return;
    }

    const hit = findQuestionInSections(sections, String(overId));
    if (hit) {
      setActiveDropSectionId(hit.section.id);
      if (!hit.question.parentQuestionId) {
        setActiveDropParentQuestionId(hit.question.id);
      }
    } else {
      setActiveDropSectionId(null);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    setActiveDropSectionId(null);
    setActiveDropParentQuestionId(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith("sidebar-")) {
      const contentItemId = activeId.replace("sidebar-", "");
      const overData = over?.data?.current as
        | { droppableSection?: string; droppableParentQuestion?: string }
        | undefined;

      let parentQuestionId = overData?.droppableParentQuestion ?? null;
      let targetSectionId = overData?.droppableSection ?? null;

      if (parentQuestionId && !targetSectionId) {
        targetSectionId =
          findQuestionInSections(sections, parentQuestionId)?.section.id ?? null;
      }

      const hit = findQuestionInSections(sections, overId);
      const isSectionDrop = overId.startsWith("section-drop-");

      if (hit && !isSectionDrop) {
        targetSectionId = hit.section.id;
        if (hit.question.parentQuestionId) {
          parentQuestionId = hit.question.parentQuestionId;
        } else if (!parentQuestionId) {
          parentQuestionId = hit.question.id;
        }
      } else if (isSectionDrop && overData?.droppableSection) {
        targetSectionId = overData.droppableSection;
        parentQuestionId = null;
      }

      if (!targetSectionId) {
        toast.error("Drop onto a section or question to add a content item.");
        return;
      }

      await handleSidebarDrop(
        contentItemId,
        active,
        targetSectionId,
        parentQuestionId
      );
      return;
    }

    const activeHit = findQuestionInSections(sections, activeId);
    const overHit = findQuestionInSections(sections, overId);
    if (!activeHit || !overHit) return;

    const activeParentId = activeHit.question.parentQuestionId ?? null;
    const overParentId = overHit.question.parentQuestionId ?? null;
    if (activeParentId !== overParentId) return;
    if (activeHit.section.id !== overHit.section.id) return;

    const siblings = activeHit.section.questions
      .filter((q) => (q.parentQuestionId ?? null) === activeParentId)
      .sort((a, b) => a.order - b.order);

    const oldIndex = siblings.findIndex((q) => q.id === activeId);
    const newIndex = siblings.findIndex((q) => q.id === overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reordered = arrayMove(siblings, oldIndex, newIndex);
    const reorderedIds = new Set(reordered.map((q) => q.id));

    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== activeHit.section.id) return s;
        const others = s.questions.filter((q) => !reorderedIds.has(q.id));
        return {
          ...s,
          questions: [
            ...others,
            ...reordered.map((q, index) => ({ ...q, order: index })),
          ],
        };
      })
    );

    await persist([
      {
        type: "REORDER_QUESTIONS",
        sectionId: activeHit.section.id,
        questionIds: reordered.map((q) => q.id),
        parentQuestionId: activeParentId,
      },
    ]);
  }

  async function handleSidebarDrop(
    contentItemId: string,
    active: DragEndEvent["active"],
    targetSectionId: string,
    parentQuestionId: string | null
  ) {
    const alreadyAdded = sections.some((s) =>
      s.questions.some((q) => q.contentItemId === contentItemId)
    );

    if (alreadyAdded) {
      toast.warning(
        "This item is already in the paper. Each content item can only appear once."
      );
      return;
    }

    if (targetSectionId.startsWith("temp-")) {
      toast.error(
        "This section is still saving. Please wait a moment and try again."
      );
      return;
    }

    if (parentQuestionId?.startsWith("temp-")) {
      toast.error(
        "The parent question is still saving. Please wait before adding subquestions."
      );
      return;
    }

    if (isSaving) {
      toast.error("Please wait for the current save to finish.");
      return;
    }

    const sidebarItem = active.data.current?.sidebarItem as
      | SidebarContentItem
      | undefined;

    const section = sections.find((s) => s.id === targetSectionId);
    const siblingCount = section
      ? parentQuestionId
        ? getSubquestions(section.questions, parentQuestionId).length
        : getTopLevelQuestions(section.questions).length
      : 0;

    const newQuestion: PaperQuestionData = {
      id: `temp-${Date.now()}`,
      sectionId: targetSectionId,
      contentItemId,
      snapshotText: sidebarItem?.textContent ?? null,
      snapshotImageUrl: sidebarItem?.imageUrl ?? null,
      marks: 0,
      order: siblingCount,
      parentQuestionId,
      type: sidebarItem?.type,
    };

    setSections((prev) =>
      prev.map((s) =>
        s.id === targetSectionId
          ? { ...s, questions: [...s.questions, newQuestion] }
          : s
      )
    );

    await persist([
      {
        type: "ADD_QUESTION",
        sectionId: targetSectionId,
        contentItemId,
        snapshotText: sidebarItem?.textContent ?? undefined,
        snapshotImageUrl: sidebarItem?.imageUrl ?? undefined,
        marks: 0,
        parentQuestionId,
      },
    ]);
  }

  const canvasContent = (
    <div className="flex flex-col h-full flex-1 min-w-0">
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-zinc-400" />
            <span className="text-sm text-zinc-600">
              {sections.length} section{sections.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="text-sm font-semibold text-zinc-900">
            Total:{" "}
            <span className="text-blue-600">{grandTotal} marks</span>
          </div>
          {isSaving && (
            <span className="text-xs text-zinc-400 animate-pulse">Saving…</span>
          )}
        </div>
        <Button size="sm" onClick={handleAddSection} disabled={isSaving}>
          <Plus className="h-4 w-4 mr-1" />
          Add Section
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center gap-3">
            <div className="rounded-full bg-zinc-100 p-5">
              <Plus className="h-8 w-8 text-zinc-300" />
            </div>
            <p className="font-medium text-zinc-600">No sections yet</p>
            <p className="text-sm text-zinc-400">
              Click &ldquo;Add Section&rdquo; to create the first section of your paper.
            </p>
          </div>
        ) : (
          sections.map((section) => (
            <PaperSection
              key={section.id}
              section={section}
              numberingFormat={numberingFormat}
              onUpdateSection={handleUpdateSection}
              onDeleteSection={handleDeleteSection}
              onUpdateQuestionMarks={handleUpdateQuestionMarks}
              onDeleteQuestion={handleDeleteQuestion}
              isDropTarget={activeDropSectionId === section.id}
              activeDropParentQuestionId={activeDropParentQuestionId}
            />
          ))
        )}
      </div>
    </div>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full w-full overflow-hidden">
        {sidebar}
        {canvasContent}
      </div>
      <DragOverlay>
        {activeDragId?.startsWith("sidebar-") ? (
          <div className="rounded border bg-white px-3 py-2 text-sm shadow-lg opacity-90 max-w-xs">
            Adding content…
          </div>
        ) : activeDragId ? (
          <div className="rounded border bg-white px-3 py-2 text-sm shadow-lg opacity-80">
            Moving question…
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
