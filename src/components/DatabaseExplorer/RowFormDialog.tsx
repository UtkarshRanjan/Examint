"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FieldMeta, ModelMeta } from "@/lib/db-management";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RelationOption {
  id: string;
  label: string;
}

interface RowFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ModelMeta | null;
  mode: "create" | "edit";
  initialRow?: Record<string, unknown> | null;
  onSaved: () => void;
}

function isRelationField(model: ModelMeta, field: FieldMeta): boolean {
  return model.fields.some(
    (f) =>
      f.kind === "object" &&
      f.relationFromFields?.includes(field.name)
  );
}

function formatInitialValue(field: FieldMeta, value: unknown): string {
  if (value == null) return "";
  if (field.type === "DateTime" && value) {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 16);
    }
  }
  if (field.type === "Boolean") {
    return value === true || value === "true" ? "true" : "false";
  }
  return String(value);
}

function isReadOnlyField(field: FieldMeta, mode: "create" | "edit"): boolean {
  if (mode === "edit" && field.isId) return true;
  if (field.isUpdatedAt) return true;
  if (mode === "create" && field.name === "createdAt" && field.hasDefaultValue) {
    return true;
  }
  if (mode === "create" && field.isId && field.hasDefaultValue) return true;
  return false;
}

/**
 * RowFormDialog — insert or edit a single database row.
 */
export default function RowFormDialog({
  open,
  onOpenChange,
  model,
  mode,
  initialRow,
  onSaved,
}: RowFormDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [relationOptions, setRelationOptions] = useState<
    Record<string, RelationOption[]>
  >({});
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const editableFields =
    model?.fields.filter(
      (f) => (f.kind === "scalar" || f.kind === "enum") && !f.isList
    ) ?? [];

  useEffect(() => {
    if (!open || !model) return;

    const activeModel = model;
    const fields = activeModel.fields.filter(
      (f) => (f.kind === "scalar" || f.kind === "enum") && !f.isList
    );

    const nextValues: Record<string, string> = {};
    for (const field of fields) {
      const raw = initialRow?.[field.name];
      nextValues[field.name] = formatInitialValue(field, raw);
    }
    setValues(nextValues);

    async function loadRelationOptions() {
      setIsLoadingOptions(true);
      const optionsMap: Record<string, RelationOption[]> = {};

      try {
        await Promise.all(
          fields
            .filter((field) => isRelationField(activeModel, field))
            .map(async (field) => {
              const res = await fetch(
                `/api/database/${activeModel.name}/relations/${field.name}`
              );
              if (!res.ok) return;
              const data = (await res.json()) as { options: RelationOption[] };
              optionsMap[field.name] = data.options;
            })
        );
        setRelationOptions(optionsMap);
      } catch {
        toast.error("Failed to load relation options.");
      } finally {
        setIsLoadingOptions(false);
      }
    }

    loadRelationOptions();
  }, [open, model, initialRow, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!model) return;

    setIsSaving(true);
    const payload: Record<string, unknown> = {};

    for (const field of editableFields) {
      if (isReadOnlyField(field, mode)) continue;
      const raw = values[field.name];
      if (field.type === "Boolean") {
        payload[field.name] = raw === "true";
      } else if (field.type === "Int" || field.type === "Float") {
        payload[field.name] = raw === "" ? null : Number(raw);
      } else {
        payload[field.name] = raw;
      }
    }

    try {
      const url =
        mode === "create"
          ? `/api/database/${model.name}`
          : `/api/database/${model.name}/${initialRow?.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        toast.error(data.error ?? "Failed to save row.");
        return;
      }

      toast.success(mode === "create" ? "Row inserted." : "Row updated.");
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!model) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Insert row" : "Edit row"} — {model.name}
          </DialogTitle>
          <DialogDescription>
            All fields are shown as stored in the database.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {editableFields.map((field) => {
            const readOnly = isReadOnlyField(field, mode);
            const isRelation = isRelationField(model, field);
            const options = relationOptions[field.name] ?? [];

            return (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={field.name}>
                  {field.name}
                  {field.isRequired && !field.hasDefaultValue ? " *" : ""}
                </Label>

                {readOnly ? (
                  <Input
                    id={field.name}
                    value={values[field.name] ?? ""}
                    readOnly
                    className="bg-zinc-50"
                  />
                ) : field.type === "Boolean" ? (
                  <select
                    id={field.name}
                    value={values[field.name] ?? "false"}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.name]: e.target.value,
                      }))
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : isRelation ? (
                  <select
                    id={field.name}
                    value={values[field.name] ?? ""}
                    disabled={isLoadingOptions}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.name]: e.target.value,
                      }))
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">— null —</option>
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "DateTime" ? (
                  <Input
                    id={field.name}
                    type="datetime-local"
                    value={values[field.name] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.name]: e.target.value,
                      }))
                    }
                  />
                ) : (
                  <Input
                    id={field.name}
                    type={field.type === "Int" || field.type === "Float" ? "number" : "text"}
                    value={values[field.name] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.name]: e.target.value,
                      }))
                    }
                  />
                )}
              </div>
            );
          })}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || isLoadingOptions}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "create" ? "Insert" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
