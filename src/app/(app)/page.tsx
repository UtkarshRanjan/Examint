"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Library,
  FileText,
  Upload,
  Plus,
  ArrowRight,
  Loader2,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

/**
 * Data fetched for the dashboard.
 */
interface DashboardData {
  totalContentItems: number;
  totalPapers: number;
  recentPapers: Array<{
    id: string;
    title: string;
    subject: string;
    totalMarks: number;
    sectionsCount: number;
    createdAt: string;
  }>;
}

/**
 * Dashboard Page — /
 *
 * The home screen after login. Shows:
 * 1. Stats cards: total content items and total papers.
 * 2. Quick action links: Upload, Content Bank, New Paper, View Papers.
 * 3. Recent papers list (last 5) with direct edit links.
 *
 * Data is fetched client-side from the existing /api/content and /api/papers
 * endpoints (no dedicated dashboard API needed).
 */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        // Fetch content count and papers list in parallel.
        const [contentRes, papersRes] = await Promise.all([
          fetch("/api/content?page=1&limit=1"),
          fetch("/api/papers"),
        ]);

        if (!contentRes.ok || !papersRes.ok)
          throw new Error("Failed to load dashboard data.");

        const contentData = (await contentRes.json()) as { total: number };
        const papersData = (await papersRes.json()) as {
          papers: DashboardData["recentPapers"];
        };

        setData({
          totalContentItems: contentData.total,
          totalPapers: papersData.papers.length,
          recentPapers: papersData.papers.slice(0, 5),
        });
      } catch {
        toast.error("Failed to load dashboard. Please refresh.");
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Welcome to Examint — your question paper workspace.
        </p>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-600">
              Content Items
            </CardTitle>
            <Library className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-zinc-900">
              {data?.totalContentItems ?? 0}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Questions, paragraphs, and images in your bank
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-600">
              Question Papers
            </CardTitle>
            <FileText className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-zinc-900">
              {data?.totalPapers ?? 0}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Papers created and saved in Examint
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Quick Actions ── */}
      <div>
        <h2 className="text-base font-semibold text-zinc-700 mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link href="/upload">
            <button className="w-full flex flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 hover:shadow-sm transition-all">
              <div className="rounded-full bg-blue-50 p-3">
                <Upload className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-zinc-700">
                Upload Image
              </span>
            </button>
          </Link>

          <Link href="/content">
            <button className="w-full flex flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 hover:shadow-sm transition-all">
              <div className="rounded-full bg-green-50 p-3">
                <Library className="h-5 w-5 text-green-600" />
              </div>
              <span className="text-sm font-medium text-zinc-700">
                Content Bank
              </span>
            </button>
          </Link>

          <Link href="/papers">
            <button className="w-full flex flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 hover:shadow-sm transition-all">
              <div className="rounded-full bg-purple-50 p-3">
                <Plus className="h-5 w-5 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-zinc-700">
                New Paper
              </span>
            </button>
          </Link>

          <Link href="/papers">
            <button className="w-full flex flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 hover:shadow-sm transition-all">
              <div className="rounded-full bg-orange-50 p-3">
                <FileText className="h-5 w-5 text-orange-600" />
              </div>
              <span className="text-sm font-medium text-zinc-700">
                All Papers
              </span>
            </button>
          </Link>
        </div>
      </div>

      {/* ── Recent Papers ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-zinc-700">
            Recent Papers
          </h2>
          <Link href="/papers">
            <Button variant="ghost" size="sm" className="text-zinc-500">
              View all
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </div>

        {data?.recentPapers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border-2 border-dashed border-zinc-200 gap-3">
            <div className="rounded-full bg-zinc-100 p-4">
              <BookOpen className="h-6 w-6 text-zinc-300" />
            </div>
            <div>
              <p className="font-medium text-zinc-600">No papers yet</p>
              <p className="text-sm text-zinc-400">
                Create your first question paper to see it here.
              </p>
            </div>
            <Link href="/papers">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Create paper
              </Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-zinc-50 text-left">
                  <th className="px-4 py-2.5 font-medium text-zinc-600">Title</th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 hidden sm:table-cell">
                    Subject
                  </th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 text-center">
                    Marks
                  </th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 hidden md:table-cell">
                    Created
                  </th>
                  <th className="px-4 py-2.5 font-medium text-zinc-600 sr-only">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {(data?.recentPapers ?? []).map((paper) => (
                  <tr key={paper.id} className="hover:bg-zinc-50 transition-colors">
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
                    <td className="px-4 py-3 text-center font-medium text-zinc-900">
                      {paper.totalMarks}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs hidden md:table-cell">
                      {formatDate(paper.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/papers/${paper.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs">
                          Edit
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Getting started tip (shown when bank is empty) */}
      {data !== null && data.totalContentItems === 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-amber-800">
              Getting started
            </CardTitle>
            <CardDescription className="text-amber-700">
              Your Content Bank is empty. Here&apos;s how to get started:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-amber-800">
            <p>
              1.{" "}
              <Link href="/settings" className="font-medium underline">
                Add your Gemini API key
              </Link>{" "}
              in Settings (free from Google AI Studio).
            </p>
            <p>
              2.{" "}
              <Link href="/upload" className="font-medium underline">
                Upload a photo
              </Link>{" "}
              of your textbook or handout to extract content.
            </p>
            <p>
              3. Review the extracted blocks and save them to your Content Bank.
            </p>
            <p>
              4.{" "}
              <Link href="/papers" className="font-medium underline">
                Create a paper
              </Link>{" "}
              and drag questions from your bank to compose it.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
