"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Loader2, Library, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ContentCard from "@/components/ContentCard";
import { CONTENT_ITEM_TYPES, CONTENT_TYPE_LABELS } from "@/lib/types";
import type { ContentItemType } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Data shape for a content item returned by the API.
 */
interface ContentItem {
  id: string;
  type: string;
  textContent: string | null;
  imageUrl: string | null;
  createdAt: string;
}

/**
 * API response shape from GET /api/content.
 */
interface ContentApiResponse {
  items: ContentItem[];
  total: number;
  page: number;
  totalPages: number;
}

/** Number of items per page — matches the API default. */
const PAGE_SIZE = 20;

/**
 * Content Bank Page — /content
 *
 * Displays all ContentItem rows for the authenticated teacher in a paginated grid.
 *
 * Features:
 * - Category filter chips (All + one per ContentItemType) at the top.
 * - Full-text keyword search input (debounced 400ms to avoid excessive API calls).
 * - Paginated grid (20 items per page) with Previous/Next navigation.
 * - Each item rendered as a ContentCard with inline edit and delete.
 * - URL search params are used for filter/search/page so the browser back
 *   button works and pages can be bookmarked.
 *
 * Data fetching: client-side (useEffect) — avoids server-component complexity
 * for the interactive filter/search/pagination controls.
 */
export default function ContentPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read initial state from URL params.
  const initialType = (searchParams?.get("type") as ContentItemType) ?? null;
  const initialSearch = searchParams?.get("search") ?? "";
  const initialPage = parseInt(searchParams?.get("page") ?? "1", 10);

  const [activeType, setActiveType] = useState<ContentItemType | null>(initialType);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [page, setPage] = useState(initialPage);

  const [items, setItems] = useState<ContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Debounces the search input — waits 400ms after the last keystroke before
   * applying the search to avoid an API call on every character.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1); // Reset to first page on new search
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /**
   * Fetches content items from the API whenever filter, search, or page changes.
   */
  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (activeType) params.set("type", activeType);
      if (debouncedSearch) params.set("search", debouncedSearch);

      const response = await fetch(`/api/content?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load content.");

      const data = (await response.json()) as ContentApiResponse;
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast.error("Failed to load content bank. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  }, [page, activeType, debouncedSearch]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  /**
   * Updates the URL search params to reflect the current filter/search/page
   * state, enabling bookmarkable URLs and browser back-button navigation.
   */
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeType) params.set("type", activeType);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (page > 1) params.set("page", String(page));
    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, {
      scroll: false,
    });
  }, [activeType, debouncedSearch, page, pathname, router]);

  /**
   * Handles clicking a category filter chip.
   * Clicking the active filter again clears it (shows "All").
   *
   * @param type - The category to filter by, or null for "All".
   */
  function handleTypeFilter(type: ContentItemType | null) {
    setActiveType(type);
    setPage(1);
  }

  /**
   * Removes a deleted item from the local list without re-fetching.
   * Called by ContentCard's onDelete callback.
   *
   * @param id - The ID of the deleted ContentItem.
   */
  function handleItemDelete(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
  }

  /**
   * Updates a single item in the local list after an inline edit save.
   * Called by ContentCard's onUpdate callback.
   *
   * @param updated - The updated ContentItem returned by the API.
   */
  function handleItemUpdate(updated: ContentItem) {
    setItems((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Content Bank</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            {isLoading ? "Loading…" : `${total} item${total !== 1 ? "s" : ""} in your bank`}
          </p>
        </div>
        <Link href="/upload">
          <Button size="sm">
            <Upload className="h-4 w-4 mr-1.5" />
            Upload more
          </Button>
        </Link>
      </div>

      {/* ── Filters & Search ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Category filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {/* "All" chip */}
          <button
            onClick={() => handleTypeFilter(null)}
            className={cn(
              "text-xs font-medium rounded-full px-3 py-1 transition-colors border",
              activeType === null
                ? "bg-zinc-900 text-white border-zinc-900"
                : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
            )}
          >
            All
          </button>

          {CONTENT_ITEM_TYPES.map((type) => {
            const info = CONTENT_TYPE_LABELS[type];
            return (
              <button
                key={type}
                onClick={() => handleTypeFilter(type)}
                className={cn(
                  "text-xs font-medium rounded-full px-3 py-1 transition-colors border",
                  activeType === type
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : `${info.color} border-transparent hover:border-current`
                )}
              >
                {info.label}
              </button>
            );
          })}
        </div>

        {/* Search input */}
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search content…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* ── Content Grid ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
        </div>
      ) : items.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="rounded-full bg-zinc-100 p-6">
            <Library className="h-10 w-10 text-zinc-300" />
          </div>
          <div>
            <p className="font-medium text-zinc-700">
              {debouncedSearch || activeType
                ? "No items match your filters"
                : "Your Content Bank is empty"}
            </p>
            <p className="text-sm text-zinc-400 mt-1">
              {debouncedSearch || activeType
                ? "Try clearing the search or changing the category filter."
                : "Upload images to extract and save content here."}
            </p>
          </div>
          {!debouncedSearch && !activeType && (
            <Link href="/upload">
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-1.5" />
                Upload your first image
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              onDelete={handleItemDelete}
              onUpdate={handleItemUpdate}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-zinc-500">
            Page {page} of {totalPages} · {total} items
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
