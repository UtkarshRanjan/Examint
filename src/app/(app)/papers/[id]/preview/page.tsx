"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PaperPreview from "@/components/PaperPreview";
import type { PaperHeaderConfig, PaperFooterConfig, NumberingFormat } from "@/lib/types";
import { DEFAULT_HEADER_CONFIG, DEFAULT_FOOTER_CONFIG } from "@/lib/types";

/**
 * Full paper data shape returned by GET /api/papers/[id].
 */
interface FullPaper {
  id: string;
  title: string;
  numberingFormat: string;
  headerConfig: string;
  footerConfig: string;
  sections: Array<{
    id: string;
    title: string;
    instructions: string | null;
    order: number;
    questions: Array<{
      id: string;
      snapshotText: string | null;
      snapshotImageUrl: string | null;
      marks: number;
      order: number;
      type?: string;
    }>;
  }>;
}

/**
 * Paper Preview Page — /papers/[id]/preview
 *
 * Full-screen A4-style preview of the question paper draft.
 *
 * Layout:
 * - Sticky top bar: "← Back to Editor" | paper title | "Export DOCX" button.
 * - White A4 page(s) centered on a gray background (like a PDF viewer).
 * - Full paper content: header, title, instructions, sections, questions, footer.
 *
 * Inline editing:
 * - Click any question text → inline textarea appears (saves on blur/confirm).
 * - Click any marks value → inline number input (saves on blur/confirm).
 * - Changes are saved immediately to the DB via PATCH /api/papers/[id].
 *
 * Structural changes (reorder, add/remove questions, sections):
 * - Teacher clicks "Back to Editor" to return to /papers/[id].
 *
 * "Export DOCX":
 * - Available directly from the preview page — no need to go back to editor.
 */
export default function PaperPreviewPage({
  params,
}: {
  params: { id: string };
}) {
  const paperId = params.id;
  const [paper, setPaper] = useState<FullPaper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  /** Fetches the full paper data from the API. */
  useEffect(() => {
    async function loadPaper() {
      try {
        const res = await fetch(`/api/papers/${paperId}`);
        if (!res.ok) throw new Error("Paper not found.");
        const data = (await res.json()) as { paper: FullPaper };
        setPaper(data.paper);
      } catch {
        toast.error("Failed to load paper preview.");
      } finally {
        setIsLoading(false);
      }
    }
    loadPaper();
  }, [paperId]);

  /**
   * Saves an inline question edit (text or marks) via PATCH /api/papers/[id].
   * Updates the local state optimistically for instant feedback.
   *
   * @param questionId - The question being updated.
   * @param updates    - The fields to update.
   */
  async function handleUpdateQuestion(
    questionId: string,
    updates: { snapshotText?: string; marks?: number }
  ) {
    // Optimistic local state update.
    setPaper((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) => ({
          ...s,
          questions: s.questions.map((q) =>
            q.id === questionId
              ? {
                  ...q,
                  snapshotText: updates.snapshotText ?? q.snapshotText,
                  marks: updates.marks ?? q.marks,
                }
              : q
          ),
        })),
      };
    });

    // Persist to the server.
    const res = await fetch(`/api/papers/${paperId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operations: [
          {
            type: "UPDATE_QUESTION",
            questionId,
            ...updates,
          },
        ],
      }),
    });

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      toast.error(data.error ?? "Failed to save changes.");
      throw new Error(data.error ?? "Save failed");
    }

    toast.success("Changes saved.");
  }

  /**
   * Exports the paper as a DOCX file by fetching /api/export.
   * Triggers a browser download when the response arrives.
   */
  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await fetch(`/api/export?paperId=${paperId}`);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Export failed.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${paper?.title ?? "paper"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("DOCX exported successfully!");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Export failed. Please try again."
      );
    } finally {
      setIsExporting(false);
    }
  }

  if (isLoading || !paper) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
      </div>
    );
  }

  const headerConfig: PaperHeaderConfig = {
    ...DEFAULT_HEADER_CONFIG,
    ...JSON.parse(paper.headerConfig || "{}"),
  };
  const footerConfig: PaperFooterConfig = {
    ...DEFAULT_FOOTER_CONFIG,
    ...JSON.parse(paper.footerConfig || "{}"),
  };

  return (
    <div className="min-h-screen bg-zinc-200">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="flex items-center justify-between px-4 h-12">
          {/* Back to editor */}
          <Link href={`/papers/${paperId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Editor
            </Button>
          </Link>

          {/* Paper title */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-700 hidden sm:block">
              Preview:
            </span>
            <span className="text-sm font-semibold text-zinc-900 truncate max-w-xs">
              {paper.title}
            </span>
          </div>

          {/* Export DOCX */}
          <Button size="sm" onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1.5" />
            )}
            {isExporting ? "Exporting…" : "Export DOCX"}
          </Button>
        </div>

        {/* Editing tip */}
        <div className="border-t bg-amber-50 px-4 py-1.5 text-xs text-amber-700 text-center">
          <strong>Preview mode:</strong> Click any question text or marks to
          edit inline. For structural changes (reorder, add/remove), use{" "}
          <Link
            href={`/papers/${paperId}`}
            className="underline font-medium"
          >
            Back to Editor
          </Link>
          .
        </div>
      </div>

      {/* A4 Paper preview */}
      <PaperPreview
        title={paper.title}
        headerConfig={headerConfig}
        footerConfig={footerConfig}
        numberingFormat={paper.numberingFormat as NumberingFormat}
        sections={paper.sections}
        onUpdateQuestion={handleUpdateQuestion}
      />
    </div>
  );
}
