"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PaperPreview from "@/components/PaperPreview";
import type { PaperHeaderConfig, PaperFooterConfig, NumberingFormat } from "@/lib/types";
import { DEFAULT_HEADER_CONFIG, DEFAULT_FOOTER_CONFIG } from "@/lib/types";

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
      parentQuestionId?: string | null;
    }>;
  }>;
}

export default function PaperPreviewPage({
  params,
}: {
  params: { id: string };
}) {
  const paperId = params.id;
  const [paper, setPaper] = useState<FullPaper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

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

  const persistPaper = useCallback(
    async (
      body: Record<string, unknown>,
      optimistic?: (prev: FullPaper) => FullPaper
    ) => {
      if (!paper) throw new Error("Paper not loaded.");

      const snapshot = paper;
      if (optimistic) setPaper((prev) => (prev ? optimistic(prev) : prev));

      const res = await fetch(`/api/papers/${paperId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setPaper(snapshot);
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Failed to save changes.");
        throw new Error(data.error ?? "Save failed");
      }

      const data = (await res.json()) as { paper: FullPaper };
      setPaper(data.paper);
      toast.success("Changes saved.");
    },
    [paper, paperId]
  );

  async function handleUpdateQuestion(
    questionId: string,
    updates: { snapshotText?: string; marks?: number }
  ) {
    await persistPaper(
      {
        operations: [{ type: "UPDATE_QUESTION", questionId, ...updates }],
      },
      (prev) => ({
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
      })
    );
  }

  async function handleUpdateTitle(title: string) {
    await persistPaper(
      { title },
      (prev) => ({ ...prev, title })
    );
  }

  async function handleUpdateHeader(updates: Partial<PaperHeaderConfig>) {
    const current = {
      ...DEFAULT_HEADER_CONFIG,
      ...JSON.parse(paper?.headerConfig || "{}"),
    };
    const merged = { ...current, ...updates };
    await persistPaper(
      { headerConfig: merged },
      (prev) => ({ ...prev, headerConfig: JSON.stringify(merged) })
    );
  }

  async function handleUpdateFooter(updates: Partial<PaperFooterConfig>) {
    const current = {
      ...DEFAULT_FOOTER_CONFIG,
      ...JSON.parse(paper?.footerConfig || "{}"),
    };
    const merged = { ...current, ...updates };
    await persistPaper(
      { footerConfig: merged },
      (prev) => ({ ...prev, footerConfig: JSON.stringify(merged) })
    );
  }

  async function handleUpdateSection(
    sectionId: string,
    updates: { title?: string; instructions?: string }
  ) {
    await persistPaper(
      {
        operations: [{ type: "UPDATE_SECTION", sectionId, ...updates }],
      },
      (prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
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
        ),
      })
    );
  }

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
      <div className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="flex items-center justify-between px-4 h-12">
          <Link href={`/papers/${paperId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Editor
            </Button>
          </Link>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-700 hidden sm:block">
              Preview:
            </span>
            <span className="text-sm font-semibold text-zinc-900 truncate max-w-xs">
              {paper.title}
            </span>
          </div>

          <Button size="sm" onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1.5" />
            )}
            {isExporting ? "Exporting…" : "Export DOCX"}
          </Button>
        </div>

        <div className="border-t bg-amber-50 px-4 py-1.5 text-xs text-amber-700 text-center">
          <strong>Preview mode:</strong> Click any text to edit inline. For
          reordering or adding questions, use{" "}
          <Link
            href={`/papers/${paperId}`}
            className="underline font-medium"
          >
            Back to Editor
          </Link>
          .
        </div>
      </div>

      <PaperPreview
        title={paper.title}
        headerConfig={headerConfig}
        footerConfig={footerConfig}
        numberingFormat={paper.numberingFormat as NumberingFormat}
        sections={paper.sections}
        onUpdateQuestion={handleUpdateQuestion}
        onUpdateTitle={handleUpdateTitle}
        onUpdateHeader={handleUpdateHeader}
        onUpdateFooter={handleUpdateFooter}
        onUpdateSection={handleUpdateSection}
      />
    </div>
  );
}
