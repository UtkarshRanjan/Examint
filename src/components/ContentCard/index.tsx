"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Check, X, ChevronDown } from "lucide-react";
import { CONTENT_TYPE_LABELS, CONTENT_ITEM_TYPES } from "@/lib/types";
import type { ContentItemType } from "@/lib/types";
import { cn, truncate, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Data shape for a content item displayed in the card.
 * Matches the fields returned by GET /api/content.
 */
interface ContentItem {
  id: string;
  type: string;
  textContent: string | null;
  imageUrl: string | null;
  createdAt: string;
}

/**
 * Props for the ContentCard component.
 */
interface ContentCardProps {
  item: ContentItem;
  /** Called when the item is deleted — removes it from the parent's list. */
  onDelete: (id: string) => void;
  /** Called when the item is updated — refreshes the item in the parent's list. */
  onUpdate: (updatedItem: ContentItem) => void;
}

/**
 * ContentCard — Displays a single ContentItem in the Content Bank grid.
 *
 * Features:
 * - Color-coded category chip (maps to CONTENT_TYPE_LABELS colors).
 * - Truncated text preview (expandable on inline edit).
 * - Image thumbnail for photo/diagram types.
 * - Inline edit mode: click the pencil icon to edit text and category.
 *   Saves immediately on "Save" or on Enter (Shift+Enter for newlines).
 *   Cancels on Escape key or "Cancel".
 * - Delete button with a confirmation toast (undo not supported at this stage).
 *
 * All API calls go to /api/content/[id] (PATCH for edit, DELETE for delete).
 */
export default function ContentCard({
  item,
  onDelete,
  onUpdate,
}: ContentCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.textContent ?? "");
  const [editType, setEditType] = useState<ContentItemType>(
    item.type as ContentItemType
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const typeInfo = CONTENT_TYPE_LABELS[item.type as ContentItemType] ??
    CONTENT_TYPE_LABELS.other;

  /**
   * Activates inline edit mode and initialises the edit state to current values.
   */
  function startEditing() {
    setEditText(item.textContent ?? "");
    setEditType(item.type as ContentItemType);
    setIsEditing(true);
  }

  /**
   * Cancels inline editing without saving changes.
   */
  function cancelEditing() {
    setIsEditing(false);
  }

  /**
   * Saves the edited text and/or type to the server via PATCH /api/content/[id].
   * On success, calls onUpdate() to refresh the item in the parent list.
   */
  async function saveEdit() {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/content/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          textContent: editText.trim(),
          type: editType,
        }),
      });

      const data = (await response.json()) as {
        item?: ContentItem;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save changes.");
      }

      if (data.item) {
        onUpdate(data.item);
      }
      setIsEditing(false);
      toast.success("Content item updated.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save changes."
      );
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Deletes the item via DELETE /api/content/[id].
   * On success, calls onDelete() to remove it from the parent's list.
   */
  async function handleDelete() {
    if (!confirm("Delete this content item? This cannot be undone.")) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/content/${item.id}`, {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 204) {
        throw new Error("Failed to delete item.");
      }

      onDelete(item.id);
      toast.success("Content item deleted.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete item."
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md flex flex-col",
        isDeleting && "opacity-50 pointer-events-none"
      )}
    >
      {/* Card header: type chip + action buttons */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        {/* Category chip (or editable dropdown in edit mode) */}
        {isEditing ? (
          <div className="relative">
            <select
              value={editType}
              onChange={(e) => setEditType(e.target.value as ContentItemType)}
              className={cn(
                "appearance-none text-xs font-medium rounded-full px-2.5 py-0.5 pr-6 cursor-pointer border-0 outline-none",
                CONTENT_TYPE_LABELS[editType].color
              )}
            >
              {CONTENT_ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CONTENT_TYPE_LABELS[t].label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-1 top-0.5 h-3 w-3 pointer-events-none text-current opacity-70" />
          </div>
        ) : (
          <span
            className={cn(
              "text-xs font-medium rounded-full px-2.5 py-0.5",
              typeInfo.color
            )}
          >
            {typeInfo.label}
          </span>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={saveEdit}
                disabled={isSaving}
              >
                <Check className="h-3.5 w-3.5" />
                <span className="ml-1 text-xs">{isSaving ? "Saving…" : "Save"}</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-zinc-400 hover:text-zinc-700"
                onClick={cancelEditing}
                disabled={isSaving}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-700"
                onClick={startEditing}
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-zinc-400 hover:text-red-600"
                onClick={handleDelete}
                title="Delete"
                disabled={isDeleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Card body: image thumbnail or text content */}
      <div className="flex-1 px-3 pb-3">
        {item.imageUrl && (item.type === "photo" || item.type === "diagram") ? (
          <div className="mb-2 rounded overflow-hidden bg-zinc-50 border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.textContent ?? "Image content"}
              className="w-full h-32 object-cover"
            />
          </div>
        ) : null}

        {isEditing ? (
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full text-sm text-zinc-800 rounded border border-zinc-200 p-2 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-300 min-h-[80px]"
            placeholder="Enter content text…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                saveEdit();
              }
              if (e.key === "Escape") {
                cancelEditing();
              }
            }}
            autoFocus
          />
        ) : (
          <p className="text-sm text-zinc-700 leading-relaxed">
            {item.textContent
              ? truncate(item.textContent, 200)
              : <span className="text-zinc-400 italic">No text content</span>}
          </p>
        )}
      </div>

      {/* Card footer: date */}
      <div className="px-3 pb-3">
        <p className="text-xs text-zinc-400">{formatDate(item.createdAt)}</p>
      </div>
    </div>
  );
}
