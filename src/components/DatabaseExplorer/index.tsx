"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { FieldMeta, ModelMeta } from "@/lib/db-management";
import { truncate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import RowFormDialog from "@/components/DatabaseExplorer/RowFormDialog";

interface ListResponse {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

const PAGE_SIZE = 20;

function formatCellValue(field: FieldMeta, value: unknown): string {
  if (value == null) return "—";
  if (field.type === "Boolean") return value ? "true" : "false";
  if (field.type === "DateTime") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return truncate(text, 80);
}

/**
 * DatabaseExplorer — Developer-only Prisma table browser and editor.
 */
export default function DatabaseExplorer() {
  const [models, setModels] = useState<ModelMeta[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelMeta | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isTruncating, setIsTruncating] = useState(false);

  const displayFields = selectedModel
    ? selectedModel.fields.filter(
        (f) => (f.kind === "scalar" || f.kind === "enum") && !f.isList
      )
    : [];
  const idField = displayFields.find((f) => f.isId)?.name ?? "id";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadRows = useCallback(async (modelName: string, pageNum: number) => {
    setIsLoadingRows(true);
    try {
      const res = await fetch(
        `/api/database/${modelName}?page=${pageNum}&limit=${PAGE_SIZE}`
      );
      if (!res.ok) throw new Error("Failed to load rows.");
      const data = (await res.json()) as ListResponse;
      setRows(data.rows);
      setTotal(data.total);
      setPage(data.page);
    } catch {
      toast.error("Failed to load table data. Please refresh.");
    } finally {
      setIsLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    async function loadModels() {
      try {
        const res = await fetch("/api/database/models");
        if (!res.ok) throw new Error("Failed to load models.");
        const data = (await res.json()) as { models: ModelMeta[] };
        setModels(data.models);
        if (data.models.length > 0) {
          setSelectedModel(data.models[0]);
        }
      } catch {
        toast.error("Failed to load database models.");
      } finally {
        setIsLoadingModels(false);
      }
    }
    loadModels();
  }, []);

  useEffect(() => {
    if (selectedModel) {
      loadRows(selectedModel.name, 1);
    }
  }, [selectedModel, loadRows]);

  function handleSelectModel(model: ModelMeta) {
    setSelectedModel(model);
    setPage(1);
  }

  function openCreateDialog() {
    setDialogMode("create");
    setEditingRow(null);
    setDialogOpen(true);
  }

  function openEditDialog(row: Record<string, unknown>) {
    setDialogMode("edit");
    setEditingRow(row);
    setDialogOpen(true);
  }

  async function handleDeleteRow(row: Record<string, unknown>) {
    if (!selectedModel) return;
    const rowId = String(row[idField]);
    if (
      !window.confirm(
        `Delete row ${rowId} from ${selectedModel.name}? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingId(rowId);
    try {
      const res = await fetch(`/api/database/${selectedModel.name}/${rowId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete row.");
        return;
      }
      toast.success("Row deleted.");
      await loadRows(selectedModel.name, page);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleTruncate() {
    if (!selectedModel) return;
    if (
      !window.confirm(
        `Truncate all rows in ${selectedModel.name}? This cannot be undone.`
      )
    ) {
      return;
    }

    setIsTruncating(true);
    try {
      const res = await fetch(`/api/database/${selectedModel.name}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string; count?: number };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to truncate table.");
        return;
      }
      toast.success(`Deleted ${data.count ?? 0} row(s).`);
      await loadRows(selectedModel.name, 1);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsTruncating(false);
    }
  }

  if (isLoadingModels) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Model sidebar */}
      <aside className="w-full lg:w-56 shrink-0">
        <h2 className="text-sm font-semibold text-zinc-700 mb-2">Tables</h2>
        <nav className="rounded-lg border bg-white shadow-sm overflow-hidden">
          {models.map((model) => (
            <button
              key={model.name}
              type="button"
              onClick={() => handleSelectModel(model)}
              className={`w-full text-left px-4 py-2.5 text-sm border-b last:border-b-0 transition-colors ${
                selectedModel?.name === model.name
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {model.name}
            </button>
          ))}
        </nav>
      </aside>

      {/* Data table */}
      <div className="flex-1 min-w-0 space-y-4">
        {selectedModel && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {selectedModel.name}
                </h2>
                <p className="text-sm text-zinc-500">
                  {total} row{total === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={openCreateDialog}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Insert row
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleTruncate}
                  disabled={isTruncating || total === 0}
                >
                  {isTruncating ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1.5" />
                  )}
                  Truncate table
                </Button>
              </div>
            </div>

            {isLoadingRows ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-lg border bg-white p-8 text-center text-zinc-500 text-sm">
                No rows in this table.
              </div>
            ) : (
              <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
                <table className="w-full text-sm min-w-max">
                  <thead>
                    <tr className="border-b bg-zinc-50 text-left">
                      {displayFields.map((field) => (
                        <th
                          key={field.name}
                          className="px-3 py-2.5 font-medium text-zinc-600 whitespace-nowrap"
                        >
                          {field.name}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 font-medium text-zinc-600">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {rows.map((row) => {
                      const rowId = String(row[idField]);
                      return (
                        <tr
                          key={rowId}
                          className="hover:bg-zinc-50 transition-colors"
                        >
                          {displayFields.map((field) => (
                            <td
                              key={field.name}
                              className="px-3 py-2.5 text-zinc-700 max-w-[220px] truncate"
                              title={String(row[field.name] ?? "")}
                            >
                              {formatCellValue(field, row[field.name])}
                            </td>
                          ))}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8"
                                onClick={() => openEditDialog(row)}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-red-600 hover:text-red-700"
                                disabled={deletingId === rowId}
                                onClick={() => handleDeleteRow(row)}
                              >
                                {deletingId === rowId ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || isLoadingRows}
                    onClick={() =>
                      selectedModel && loadRows(selectedModel.name, page - 1)
                    }
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || isLoadingRows}
                    onClick={() =>
                      selectedModel && loadRows(selectedModel.name, page + 1)
                    }
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <RowFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        model={selectedModel}
        mode={dialogMode}
        initialRow={editingRow}
        onSaved={() => {
          if (selectedModel) {
            loadRows(selectedModel.name, page);
          }
        }}
      />
    </div>
  );
}
