"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Save, RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTENT_TYPE_LABELS, CONTENT_ITEM_TYPES } from "@/lib/types";
import type { ContentItemType, GeminiExtractedBlock } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A single extracted block with user-editable fields and a selection checkbox.
 */
interface EditableBlock extends GeminiExtractedBlock {
  /** Whether this block is checked for inclusion in the Content Bank save. */
  selected: boolean;
  /** Unique index within the current extraction result (for React key). */
  id: number;
}

/**
 * Props for the ExtractReview component.
 */
interface ExtractReviewProps {
  /** URL of the cropped image shown on the left side of the review panel. */
  croppedImageUrl: string;
  /** The list of content blocks extracted by the Gemini API. */
  extractedBlocks: GeminiExtractedBlock[];
  /**
   * Called when the teacher clicks "Save Selected".
   * Receives only the checked blocks (with edited type and text).
   * Returns a Promise; the component shows a loading state during the save.
   */
  onSave: (selectedBlocks: GeminiExtractedBlock[]) => Promise<void>;
  /**
   * Called when the teacher clicks "Re-extract" — triggers a new Gemini call
   * for the same image (useful when the first extraction result is poor).
   */
  onRetry: () => void;
}

/**
 * ExtractReview — Side-by-side review UI for extracted content blocks.
 *
 * Layout:
 *   Left: The cropped image that was uploaded and processed.
 *   Right: A list of extracted blocks, each with:
 *     - A checkbox (include/exclude from save)
 *     - A category dropdown (change type)
 *     - An editable textarea (edit extracted text)
 *
 * The teacher reviews the blocks, adjusts any that are wrong, unchecks
 * unwanted items, and clicks "Save Selected" to store them as ContentItem rows.
 *
 * "Select All" / "Deselect All" shortcuts are provided for efficiency.
 */
export default function ExtractReview({
  croppedImageUrl,
  extractedBlocks,
  onSave,
  onRetry,
}: ExtractReviewProps) {
  // Initialise blocks with all selected by default and assign stable IDs.
  const [blocks, setBlocks] = useState<EditableBlock[]>(() =>
    extractedBlocks.map((b, i) => ({ ...b, selected: true, id: i }))
  );
  const [isSaving, setIsSaving] = useState(false);

  /** Count of currently selected blocks. */
  const selectedCount = blocks.filter((b) => b.selected).length;

  /**
   * Toggles the selected state of a single block by its ID.
   * @param id - The block's index ID.
   */
  function toggleBlock(id: number) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, selected: !b.selected } : b))
    );
  }

  /**
   * Selects or deselects all blocks at once.
   * @param selected - true = select all, false = deselect all.
   */
  function setAllSelected(selected: boolean) {
    setBlocks((prev) => prev.map((b) => ({ ...b, selected })));
  }

  /**
   * Updates the text content of a specific block (inline editing).
   * @param id - The block's index ID.
   * @param text - The new text value from the textarea.
   */
  function updateBlockText(id: number, text: string) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, text } : b))
    );
  }

  /**
   * Updates the content type/category of a specific block.
   * @param id - The block's index ID.
   * @param type - The new ContentItemType.
   */
  function updateBlockType(id: number, type: ContentItemType) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, type } : b))
    );
  }

  /**
   * Handles the "Save Selected" button click.
   * Filters to selected blocks, strips the UI-only fields, and calls onSave.
   */
  async function handleSave() {
    const selected = blocks
      .filter((b) => b.selected)
      .map(({ type, text }) => ({ type, text }));

    if (selected.length === 0) {
      toast.error("Please select at least one block to save.");
      return;
    }

    setIsSaving(true);
    try {
      await onSave(selected);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* ── Left: Cropped image ── */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-zinc-700">Uploaded image</h3>
        <div className="rounded-lg border overflow-hidden bg-zinc-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={croppedImageUrl}
            alt="Uploaded image for extraction"
            className="w-full h-auto object-contain max-h-[500px]"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="w-full"
          disabled={isSaving}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Re-extract with Gemini
        </Button>
      </div>

      {/* ── Right: Extracted blocks ── */}
      <div className="space-y-3">
        {/* Header row with select-all controls */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-700">
            Extracted blocks{" "}
            <span className="text-zinc-400 font-normal">
              ({selectedCount}/{blocks.length} selected)
            </span>
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setAllSelected(true)}
              className="text-xs text-zinc-500 hover:text-zinc-900 underline"
            >
              Select all
            </button>
            <span className="text-zinc-300">|</span>
            <button
              onClick={() => setAllSelected(false)}
              className="text-xs text-zinc-500 hover:text-zinc-900 underline"
            >
              Deselect all
            </button>
          </div>
        </div>

        {/* Block list */}
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {blocks.map((block) => {
            const typeInfo = CONTENT_TYPE_LABELS[block.type];
            return (
              <div
                key={block.id}
                className={cn(
                  "rounded-lg border p-3 space-y-2 transition-colors",
                  block.selected ? "border-zinc-300 bg-white" : "border-zinc-100 bg-zinc-50 opacity-60"
                )}
              >
                {/* Top row: checkbox + category dropdown */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={block.selected}
                    onChange={() => toggleBlock(block.id)}
                    className="h-4 w-4 accent-zinc-900 cursor-pointer"
                    aria-label={`Include block ${block.id + 1}`}
                  />

                  {/* Category selector */}
                  <div className="relative flex-shrink-0">
                    <select
                      value={block.type}
                      onChange={(e) =>
                        updateBlockType(block.id, e.target.value as ContentItemType)
                      }
                      className={cn(
                        "appearance-none text-xs font-medium rounded-full px-2.5 py-0.5 pr-6 cursor-pointer border-0 outline-none",
                        typeInfo.color
                      )}
                      aria-label="Content type"
                    >
                      {CONTENT_ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {CONTENT_TYPE_LABELS[t].label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1 top-0.5 h-3 w-3 pointer-events-none text-current opacity-70" />
                  </div>
                </div>

                {/* Editable text area */}
                <textarea
                  value={block.text}
                  onChange={(e) => updateBlockText(block.id, e.target.value)}
                  className="w-full text-sm text-zinc-800 rounded-md border border-transparent bg-transparent resize-none focus:outline-none focus:border-zinc-300 focus:bg-white p-1 transition-colors min-h-[60px]"
                  placeholder="(empty block — uncheck to skip)"
                  disabled={!block.selected}
                  rows={Math.max(2, Math.ceil(block.text.length / 80))}
                />
              </div>
            );
          })}
        </div>

        {/* Save button */}
        <Button
          onClick={handleSave}
          disabled={selectedCount === 0 || isSaving}
          className="w-full"
        >
          <Save className="h-4 w-4 mr-1.5" />
          {isSaving
            ? "Saving…"
            : `Save ${selectedCount} block${selectedCount !== 1 ? "s" : ""} to Content Bank`}
        </Button>
      </div>
    </div>
  );
}
