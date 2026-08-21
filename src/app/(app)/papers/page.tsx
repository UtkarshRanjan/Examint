"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, FileText, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, sumMarks } from "@/lib/utils";

/**
 * Summary shape for a paper as returned by GET /api/papers.
 */
interface PaperSummary {
  id: string;
  title: string;
  subject: string;
  date: string;
  sectionsCount: number;
  totalMarks: number;
  createdAt: string;
}

/**
 * Papers List Page — /papers
 *
 * Shows a table of all question papers created by the authenticated teacher.
 *
 * Features:
 * - "New Paper" button — shows an inline title input and creates a paper on submit.
 * - Table with columns: Title, Subject, Date, Sections, Total Marks, Actions.
 * - Edit action: navigates to /papers/[id].
 * - Delete action: deletes with confirmation.
 *
 * Data is fetched client-side from GET /api/papers.
 */
export default function PapersPage() {
  const router = useRouter();
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /** Fetches the papers list from the API on mount. */
  useEffect(() => {
    fetchPapers();
  }, []);

  async function fetchPapers() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/papers");
      if (!res.ok) throw new Error("Failed to load papers.");
      const data = (await res.json()) as { papers: PaperSummary[] };
      setPapers(data.papers);
    } catch {
      toast.error("Failed to load papers. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Creates a new QuestionPaper and navigates to the editor.
   * Triggered by the "Create Paper" form submit.
   */
  async function handleCreatePaper(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error("Please enter a paper title.");
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      const data = (await res.json()) as {
        paper?: { id: string };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to create paper.");
      router.push(`/papers/${data.paper!.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create paper."
      );
      setIsCreating(false);
    }
  }

  /**
   * Deletes a QuestionPaper after user confirmation.
   *
   * @param id - The paper ID to delete.
   * @param title - The paper title (shown in confirmation).
   */
  async function handleDelete(id: string, title: string) {
    if (
      !confirm(
        `Delete "${title}"? This will permanently delete the paper and all its sections and questions.`
      )
    )
      return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/papers/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete.");
      setPapers((prev) => prev.filter((p) => p.id !== id));
      toast.success(`"${title}" deleted.`);
    } catch {
      toast.error("Failed to delete the paper. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Question Papers</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            {isLoading ? "Loading…" : `${papers.length} paper${papers.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {!showCreateForm ? (
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New paper
          </Button>
        ) : (
          <form
            onSubmit={handleCreatePaper}
            className="flex items-center gap-2"
          >
            <Input
              autoFocus
              placeholder="Paper title (e.g. Maths Mid-Term 2026)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-64"
              disabled={isCreating}
            />
            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Creating…" : "Create"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateForm(false);
                setNewTitle("");
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
          </form>
        )}
      </div>

      {/* ── Papers Table ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
        </div>
      ) : papers.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="rounded-full bg-zinc-100 p-6">
            <FileText className="h-10 w-10 text-zinc-300" />
          </div>
          <div>
            <p className="font-medium text-zinc-700">No papers yet</p>
            <p className="text-sm text-zinc-400 mt-1">
              Create your first question paper to get started.
            </p>
          </div>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New paper
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-zinc-50 text-left">
                <th className="px-4 py-3 font-medium text-zinc-600">Title</th>
                <th className="px-4 py-3 font-medium text-zinc-600 hidden sm:table-cell">
                  Subject
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 hidden md:table-cell">
                  Date
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 text-center hidden lg:table-cell">
                  Sections
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 text-center">
                  Marks
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600 hidden md:table-cell">
                  Created
                </th>
                <th className="px-4 py-3 font-medium text-zinc-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {papers.map((paper) => (
                <tr
                  key={paper.id}
                  className="hover:bg-zinc-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/papers/${paper.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {paper.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell">
                    {paper.subject || <span className="text-zinc-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 hidden md:table-cell">
                    {paper.date || <span className="text-zinc-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-zinc-700 hidden lg:table-cell">
                    {paper.sectionsCount}
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-zinc-900">
                    {paper.totalMarks}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs hidden md:table-cell">
                    {formatDate(paper.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link href={`/papers/${paper.id}`}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-700"
                          title="Edit paper"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-zinc-400 hover:text-red-600"
                        title="Delete paper"
                        disabled={deletingId === paper.id}
                        onClick={() => handleDelete(paper.id, paper.title)}
                      >
                        {deletingId === paper.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
