"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  useDraggable,
} from "@dnd-kit/core";
import {
  Loader2,
  Search,
  Eye,
  Download,
  Settings2,
  GripVertical,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PaperCanvas from "@/components/PaperCanvas";
import HeaderFooterEditor from "@/components/HeaderFooterEditor";
import { CONTENT_TYPE_LABELS } from "@/lib/types";
import type { ContentItemType } from "@/lib/types";
import type { PaperSectionData } from "@/components/PaperSection";
import { cn, truncate } from "@/lib/utils";

/**
 * A content item from the sidebar.
 */
interface SidebarItem {
  id: string;
  type: string;
  textContent: string | null;
  imageUrl: string | null;
}

/**
 * Full paper data as returned by GET /api/papers/[id].
 */
interface FullPaper {
  id: string;
  title: string;
  numberingFormat: string;
  headerConfig: string;
  footerConfig: string;
  sections: PaperSectionData[];
}

/**
 * A draggable sidebar item — wraps a content item card with @dnd-kit's
 * `useDraggable` hook so it can be dragged into a paper section.
 *
 * The draggable ID uses a "sidebar-" prefix so PaperCanvas can distinguish
 * sidebar drops from within-section reorders.
 */
function DraggableSidebarItem({ item }: { item: SidebarItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-${item.id}`,
    data: { sidebarItem: item },
  });

  const typeInfo =
    CONTENT_TYPE_LABELS[(item.type as ContentItemType) ?? "other"] ??
    CONTENT_TYPE_LABELS.other;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-start gap-2 rounded border bg-white p-2 cursor-grab select-none transition-shadow hover:shadow-sm active:cursor-grabbing",
        isDragging && "opacity-40 shadow-lg ring-1 ring-blue-400"
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4 text-zinc-300 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "text-xs font-medium rounded-full px-1.5 py-0.5 mr-1",
            typeInfo.color
          )}
        >
          {typeInfo.label}
        </span>
        <span className="text-xs text-zinc-700">
          {truncate(item.textContent ?? "(image)", 100)}
        </span>
      </div>
    </div>
  );
}

/**
 * Paper Editor Page — /papers/[id]
 *
 * Two-panel layout:
 * - Left panel (sidebar): Searchable, paginated Content Bank.
 *   Items can be dragged into paper sections on the right.
 * - Right panel (canvas): PaperCanvas with sections and questions.
 *
 * Features:
 * - "Configure Header/Footer" button → opens HeaderFooterEditor drawer.
 * - "Preview Draft" button → navigates to /papers/[id]/preview.
 * - "Export DOCX" button → triggers /api/export download.
 * - All mutations flow through PaperCanvas and are saved via PATCH /api/papers/[id].
 */
export default function PaperEditorPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const paperId = params.id;

  // Paper data state
  const [paper, setPaper] = useState<FullPaper | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sidebar state
  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([]);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarPage, setSidebarPage] = useState(1);
  const [sidebarTotalPages, setSidebarTotalPages] = useState(1);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Header/Footer drawer state
  const [showHeaderFooter, setShowHeaderFooter] = useState(false);

  // DOCX export state
  const [isExporting, setIsExporting] = useState(false);

  /** Fetches the paper data from the API on mount. */
  useEffect(() => {
    async function loadPaper() {
      try {
        const res = await fetch(`/api/papers/${paperId}`);
        if (!res.ok) throw new Error("Paper not found.");
        const data = (await res.json()) as { paper: FullPaper };
        setPaper(data.paper);
      } catch {
        toast.error("Failed to load paper. Redirecting to papers list.");
        router.push("/papers");
      } finally {
        setIsLoading(false);
      }
    }
    loadPaper();
  }, [paperId, router]);

  /**
   * Fetches content bank items for the sidebar.
   * Re-fetches when search query or page number changes.
   */
  const fetchSidebarItems = useCallback(async () => {
    setSidebarLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(sidebarPage),
        limit: "15",
      });
      if (sidebarSearch.trim()) params.set("search", sidebarSearch.trim());

      const res = await fetch(`/api/content?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load content.");

      const data = (await res.json()) as {
        items: SidebarItem[];
        totalPages: number;
      };
      setSidebarItems(data.items);
      setSidebarTotalPages(data.totalPages);
    } catch {
      toast.error("Failed to load content bank.");
    } finally {
      setSidebarLoading(false);
    }
  }, [sidebarPage, sidebarSearch]);

  useEffect(() => {
    fetchSidebarItems();
  }, [fetchSidebarItems]);

  // Debounce sidebar search input.
  const [rawSearch, setRawSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSidebarSearch(rawSearch);
      setSidebarPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [rawSearch]);

  /**
   * Saves a list of paper operations to the server via PATCH /api/papers/[id].
   * Called by PaperCanvas whenever a section or question is mutated.
   * Reloads the paper after save to get server-assigned IDs for new items.
   *
   * @param operations - The list of operations to apply.
   */
  async function handleSaveOperations(
    operations: Parameters<
      React.ComponentProps<typeof PaperCanvas>["onSave"]
    >[0]
  ) {
    const res = await fetch(`/api/papers/${paperId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations }),
    });

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Save failed.");
    }

    // Reload to get the server's canonical state (real IDs for new items).
    const data = (await res.json()) as { paper: FullPaper };
    setPaper(data.paper);
  }

  /**
   * Saves header/footer config changes from the HeaderFooterEditor drawer.
   *
   * @param headerConfig - Updated header configuration object.
   * @param footerConfig - Updated footer configuration object.
   */
  async function handleSaveHeaderFooter(
    headerConfig: object,
    footerConfig: object
  ) {
    const res = await fetch(`/api/papers/${paperId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headerConfig, footerConfig }),
    });

    if (!res.ok) throw new Error("Failed to save header/footer config.");

    const data = (await res.json()) as { paper: FullPaper };
    setPaper(data.paper);
    toast.success("Header & footer settings saved.");
  }

  /**
   * Triggers the DOCX export by fetching /api/export and downloading the file.
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
        err instanceof Error ? err.message : "DOCX export failed. Please try again."
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

  return (
    <div className="flex flex-col h-[calc(100vh-56px-48px)]">
      {/* Editor toolbar */}
      <div className="border-b bg-white px-4 py-2 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/papers" className="text-zinc-400 hover:text-zinc-700">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h1
            className="font-semibold text-zinc-900 truncate max-w-xs"
            title={paper.title}
          >
            {paper.title}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHeaderFooter(true)}
          >
            <Settings2 className="h-4 w-4 mr-1.5" />
            Header/Footer
          </Button>
          <Link href={`/papers/${paperId}/preview`}>
            <Button variant="outline" size="sm">
              <Eye className="h-4 w-4 mr-1.5" />
              Preview
            </Button>
          </Link>
          <Button size="sm" onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1.5" />
            )}
            {isExporting ? "Exporting…" : "Export DOCX"}
          </Button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Content Bank Sidebar ── */}
        <div
          className={cn(
            "border-r bg-zinc-50 flex flex-col transition-all duration-200 shrink-0",
            sidebarCollapsed ? "w-10" : "w-72"
          )}
        >
          {/* Sidebar collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="flex items-center justify-center h-10 border-b hover:bg-zinc-100 transition-colors shrink-0"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            ) : (
              <div className="flex items-center gap-2 w-full px-3">
                <ChevronLeft className="h-4 w-4 text-zinc-400" />
                <span className="text-xs font-medium text-zinc-600">
                  Content Bank
                </span>
              </div>
            )}
          </button>

          {!sidebarCollapsed && (
            <>
              {/* Search */}
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-zinc-400" />
                  <Input
                    placeholder="Search…"
                    value={rawSearch}
                    onChange={(e) => setRawSearch(e.target.value)}
                    className="pl-7 h-8 text-xs"
                  />
                </div>
              </div>

              {/* Items list */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {sidebarLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
                  </div>
                ) : sidebarItems.length === 0 ? (
                  <p className="text-xs text-zinc-400 text-center py-8">
                    No items found.{" "}
                    <Link href="/upload" className="underline">
                      Upload more →
                    </Link>
                  </p>
                ) : (
                  sidebarItems.map((item) => (
                    <DraggableSidebarItem key={item.id} item={item} />
                  ))
                )}
              </div>

              {/* Sidebar pagination */}
              {sidebarTotalPages > 1 && (
                <div className="border-t p-2 flex items-center justify-between">
                  <button
                    onClick={() => setSidebarPage((p) => Math.max(1, p - 1))}
                    disabled={sidebarPage <= 1}
                    className="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-40"
                  >
                    ‹ Prev
                  </button>
                  <span className="text-xs text-zinc-400">
                    {sidebarPage}/{sidebarTotalPages}
                  </span>
                  <button
                    onClick={() =>
                      setSidebarPage((p) =>
                        Math.min(sidebarTotalPages, p + 1)
                      )
                    }
                    disabled={sidebarPage >= sidebarTotalPages}
                    className="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-40"
                  >
                    Next ›
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right: Paper Canvas ── */}
        <div className="flex-1 overflow-hidden">
          <PaperCanvas
            paperId={paperId}
            initialSections={paper.sections}
            onSave={handleSaveOperations}
          />
        </div>
      </div>

      {/* Header/Footer drawer */}
      {showHeaderFooter && (
        <HeaderFooterEditor
          headerConfig={JSON.parse(paper.headerConfig || "{}")}
          footerConfig={JSON.parse(paper.footerConfig || "{}")}
          numberingFormat={paper.numberingFormat}
          onSave={handleSaveHeaderFooter}
          onClose={() => setShowHeaderFooter(false)}
        />
      )}
    </div>
  );
}
