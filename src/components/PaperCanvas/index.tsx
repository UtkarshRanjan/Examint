"use client";

import { useState } from "react";
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
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { toast } from "sonner";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import PaperSection from "@/components/PaperSection";
import type {
  PaperSectionData,
  PaperQuestionData,
} from "@/components/PaperSection";
import { sumMarks } from "@/lib/utils";

/**
 * Data shape for a content item dragged from the sidebar.
 * The `dnd-item-*` prefix in the draggable ID identifies sidebar items.
 */
interface SidebarContentItem {
  id: string;
  type: string;
  textContent: string | null;
  imageUrl: string | null;
}

/**
 * Props for the PaperCanvas component.
 */
interface PaperCanvasProps {
  paperId: string;
  initialSections: PaperSectionData[];
  /** Called to persist any section/question mutations to the server. */
  onSave: (operations: PaperOperation[]) => Promise<void>;
}

/**
 * Operation types passed to the onSave callback for persistence.
 * Mirrors the server-side PaperOperation union in /api/papers/[id]/route.ts.
 */
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
    }
  | { type: "UPDATE_QUESTION"; questionId: string; marks?: number; snapshotText?: string }
  | { type: "DELETE_QUESTION"; questionId: string }
  | { type: "REORDER_QUESTIONS"; sectionId: string; questionIds: string[] };

/**
 * PaperCanvas — The right panel of the Paper Editor.
 *
 * Manages the live state of all sections and questions in the paper.
 * Handles:
 * - Adding sections via the "Add Section" button.
 * - Deleting / updating sections (title, instructions).
 * - Receiving content items dropped from the sidebar (via DnD).
 * - Duplicate guard: prevents the same ContentItem from being added twice.
 * - Within-section question reordering via @dnd-kit.
 * - Live marks total displayed in the sticky header.
 * - All mutations are saved to the server via the `onSave` callback.
 *
 * @param paperId - The ID of the paper being edited.
 * @param initialSections - The sections loaded from the database.
 * @param onSave - Async callback to persist operations to /api/papers/[id].
 */
export default function PaperCanvas({
  paperId,
  initialSections,
  onSave,
}: PaperCanvasProps) {
  const [sections, setSections] = useState<PaperSectionData[]>(initialSections);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDropSectionId, setActiveDropSectionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Configure DnD sensors. PointerSensor activates after 8px of movement
  // to avoid accidental drags when clicking buttons inside the draggable rows.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  /** Total marks across all sections. */
  const grandTotal = sumMarks(sections.flatMap((s) => s.questions));

  /**
   * Persists a list of operations to the server via the onSave callback.
   * Wraps the call in a loading state; shows an error toast on failure.
   *
   * @param operations - The list of paper operations to apply.
   */
  async function persist(operations: PaperOperation[]) {
    setIsSaving(true);
    try {
      await onSave(operations);
    } catch {
      toast.error("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Adds a new section to the paper.
   * Applies an optimistic local state update, then persists.
   */
  async function handleAddSection() {
    const title = `Section ${String.fromCharCode(65 + sections.length)}`; // A, B, C, …
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

    // Reload sections from server to get the real DB-assigned ID.
    // The parent PaperEditorPage handles re-fetching via onSave.
  }

  /**
   * Updates a section's title and/or instructions.
   * Applies an optimistic local update, then persists.
   *
   * @param sectionId - The section to update.
   * @param updates   - The fields to update.
   */
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

  /**
   * Deletes a section and all its questions.
   *
   * @param sectionId - The section to delete.
   */
  async function handleDeleteSection(sectionId: string) {
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
    await persist([{ type: "DELETE_SECTION", sectionId }]);
  }

  /**
   * Updates the marks value for a single question.
   *
   * @param questionId - The question to update.
   * @param marks      - The new marks value.
   */
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

  /**
   * Removes a question from its section.
   *
   * @param questionId - The question to remove.
   */
  async function handleDeleteQuestion(questionId: string) {
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        questions: s.questions.filter((q) => q.id !== questionId),
      }))
    );
    await persist([{ type: "DELETE_QUESTION", questionId }]);
  }

  // ==========================================================================
  // Drag and Drop handlers
  // ==========================================================================

  /**
   * DragStart handler — tracks which item is being dragged.
   * Sidebar items have IDs prefixed with "sidebar-".
   * Within-section question items use their database question IDs.
   */
  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  /**
   * DragOver handler — tracks which section the drag is hovering over.
   * Used to highlight the drop target section with a blue border.
   *
   * @param event - The DragOverEvent from @dnd-kit.
   */
  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id;
    if (!overId) {
      setActiveDropSectionId(null);
      return;
    }

    // Check if hovering over a section container (data.droppableSection set on
    // the section's DnD droppable zone).
    const overData = event.over?.data?.current as
      | { droppableSection?: string }
      | undefined;

    if (overData?.droppableSection) {
      setActiveDropSectionId(overData.droppableSection);
    } else {
      // Hovering over a question — find which section it belongs to.
      const parentSection = sections.find((s) =>
        s.questions.some((q) => q.id === overId)
      );
      setActiveDropSectionId(parentSection?.id ?? null);
    }
  }

  /**
   * DragEnd handler — processes the drop action.
   *
   * Two cases:
   * 1. Sidebar item dropped onto a section → add it as a new question.
   * 2. Question dropped onto a different position within (or between) sections
   *    → reorder the questions.
   */
  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    setActiveDropSectionId(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Case 1: Item dragged from the sidebar (ID prefixed with "sidebar-").
    if (activeId.startsWith("sidebar-")) {
      const contentItemId = activeId.replace("sidebar-", "");

      // Find the target section from the droppable data or from the question.
      const overData = over?.data?.current as
        | { droppableSection?: string }
        | undefined;

      const targetSectionId =
        overData?.droppableSection ??
        sections.find((s) => s.questions.some((q) => q.id === overId))?.id;

      if (!targetSectionId) {
        toast.error(
          "Drop onto a section or its questions to add a content item."
        );
        return;
      }

      // Duplicate guard: check if this ContentItem is already in any section.
      const alreadyAdded = sections.some((s) =>
        s.questions.some((q) => q.contentItemId === contentItemId)
      );

      if (alreadyAdded) {
        toast.warning(
          "This item is already in the paper. Each content item can only appear once."
        );
        return;
      }

      // Get the content item data from the sidebar item's drag data.
      const sidebarItem = active.data.current?.sidebarItem as
        | SidebarContentItem
        | undefined;

      const newQuestion: PaperQuestionData = {
        id: `temp-${Date.now()}`,
        sectionId: targetSectionId,
        contentItemId,
        snapshotText: sidebarItem?.textContent ?? null,
        snapshotImageUrl: sidebarItem?.imageUrl ?? null,
        marks: 0,
        order: sections.find((s) => s.id === targetSectionId)?.questions.length ?? 0,
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
        },
      ]);

      return;
    }

    // Case 2: Within-section or between-section question reorder.
    const sourceSection = sections.find((s) =>
      s.questions.some((q) => q.id === activeId)
    );
    const targetSection = sections.find((s) =>
      s.questions.some((q) => q.id === overId)
    );

    if (!sourceSection) return;

    if (sourceSection.id === targetSection?.id || !targetSection) {
      // Same section — reorder within it.
      const sectionToReorder = sourceSection;
      const oldIndex = sectionToReorder.questions.findIndex(
        (q) => q.id === activeId
      );
      const newIndex = sectionToReorder.questions.findIndex(
        (q) => q.id === overId
      );
      if (oldIndex === newIndex) return;

      const reordered = arrayMove(sectionToReorder.questions, oldIndex, newIndex);

      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionToReorder.id
            ? { ...s, questions: reordered }
            : s
        )
      );

      await persist([
        {
          type: "REORDER_QUESTIONS",
          sectionId: sectionToReorder.id,
          questionIds: reordered.map((q) => q.id),
        },
      ]);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header: paper stats + add section */}
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

      {/* Scrollable sections area */}
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {sections.map((section) => (
              <PaperSection
                key={section.id}
                section={section}
                onUpdateSection={handleUpdateSection}
                onDeleteSection={handleDeleteSection}
                onUpdateQuestionMarks={handleUpdateQuestionMarks}
                onDeleteQuestion={handleDeleteQuestion}
                isDropTarget={activeDropSectionId === section.id}
              />
            ))}
            <DragOverlay>
              {activeDragId && !activeDragId.startsWith("sidebar-") && (
                <div className="rounded border bg-white px-3 py-2 text-sm shadow-lg opacity-80">
                  Moving question…
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}
