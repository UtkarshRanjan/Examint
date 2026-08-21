"use client";

import { useState } from "react";
import { toast } from "sonner";
import { X, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NUMBERING_FORMATS } from "@/lib/types";
import type { PaperHeaderConfig, PaperFooterConfig, NumberingFormat } from "@/lib/types";
import { DEFAULT_HEADER_CONFIG, DEFAULT_FOOTER_CONFIG } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Props for the HeaderFooterEditor drawer.
 */
interface HeaderFooterEditorProps {
  /** Current header configuration (parsed from JSON). */
  headerConfig: Partial<PaperHeaderConfig>;
  /** Current footer configuration (parsed from JSON). */
  footerConfig: Partial<PaperFooterConfig>;
  /** The paper's current numbering format. */
  numberingFormat: string;
  /**
   * Called when the teacher saves changes.
   * Receives the full updated header and footer configs.
   */
  onSave: (headerConfig: PaperHeaderConfig, footerConfig: PaperFooterConfig) => Promise<void>;
  /** Called to close the drawer without saving. */
  onClose: () => void;
}

/**
 * HeaderFooterEditor — Slide-out drawer for configuring paper header and footer.
 *
 * Fields:
 * Header:
 *   - School name
 *   - Subject
 *   - Class / Grade
 *   - Exam date
 *   - Logo upload (uploaded to /api/uploads path)
 *   - General instructions
 *   - Question numbering format (radio buttons)
 *
 * Footer:
 *   - Page numbers toggle
 *   - Signature line label
 *   - Custom footer text
 *
 * The drawer slides in from the right side of the screen as a fixed overlay.
 * Changes are only saved when the teacher clicks "Save settings" — there is no
 * auto-save here to avoid excessive API calls while the teacher types.
 */
export default function HeaderFooterEditor({
  headerConfig,
  footerConfig,
  numberingFormat,
  onSave,
  onClose,
}: HeaderFooterEditorProps) {
  // Merge incoming config with defaults (handles partially empty configs).
  const [header, setHeader] = useState<PaperHeaderConfig>({
    ...DEFAULT_HEADER_CONFIG,
    ...headerConfig,
  });
  const [footer, setFooter] = useState<PaperFooterConfig>({
    ...DEFAULT_FOOTER_CONFIG,
    ...footerConfig,
  });
  const [selectedFormat, setSelectedFormat] = useState<NumberingFormat>(
    numberingFormat as NumberingFormat
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  /**
   * Updates a single field in the header config state.
   *
   * @param field - The header config field to update.
   * @param value - The new value for that field.
   */
  function updateHeader(field: keyof PaperHeaderConfig, value: string) {
    setHeader((prev) => ({ ...prev, [field]: value }));
  }

  /**
   * Updates a single field in the footer config state.
   *
   * @param field - The footer config field to update.
   * @param value - The new value for that field.
   */
  function updateFooter(
    field: keyof PaperFooterConfig,
    value: string | boolean
  ) {
    setFooter((prev) => ({ ...prev, [field]: value }));
  }

  /**
   * Uploads the selected logo image to the server and stores its URL in
   * the header config. The logo is uploaded as a FormData POST to /api/extract
   * (reusing the image upload pipeline) but with a special `type=logo` flag.
   *
   * @param file - The logo image file selected by the teacher.
   */
  async function handleLogoUpload(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo file must be under 2 MB.");
      return;
    }

    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("image", file, file.name);

      const res = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Logo upload failed.");
      }

      const data = (await res.json()) as { imageUrl?: string; error?: string };
      if (data.imageUrl) {
        updateHeader("logoUrl", data.imageUrl);
        toast.success("Logo uploaded successfully.");
      }
    } catch {
      toast.error("Failed to upload logo. Please try again.");
    } finally {
      setIsUploadingLogo(false);
    }
  }

  /**
   * Saves the current header and footer config to the server.
   * Calls the onSave callback with the full config objects.
   */
  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave(header, footer);
      onClose();
    } catch {
      toast.error("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    /* Drawer overlay */
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <div className="relative bg-white w-full max-w-md h-full flex flex-col shadow-2xl">
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-zinc-900">Header & Footer Settings</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {/* ── Header Section ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">
              Paper Header
            </h3>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="schoolName">School / Institution name</Label>
                <Input
                  id="schoolName"
                  value={header.schoolName}
                  onChange={(e) => updateHeader("schoolName", e.target.value)}
                  placeholder="e.g. Delhi Public School"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    value={header.subject}
                    onChange={(e) => updateHeader("subject", e.target.value)}
                    placeholder="e.g. Mathematics"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="className">Class / Grade</Label>
                  <Input
                    id="className"
                    value={header.className}
                    onChange={(e) => updateHeader("className", e.target.value)}
                    placeholder="e.g. Class X"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="date">Exam date</Label>
                <Input
                  id="date"
                  value={header.date}
                  onChange={(e) => updateHeader("date", e.target.value)}
                  placeholder="e.g. 20 August 2026"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="instructions">General instructions</Label>
                <textarea
                  id="instructions"
                  value={header.instructions}
                  onChange={(e) => updateHeader("instructions", e.target.value)}
                  placeholder="e.g. Answer all questions. Each question carries marks as indicated."
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>

              {/* Logo upload */}
              <div className="space-y-1.5">
                <Label>School logo</Label>
                <div className="flex items-center gap-3">
                  {header.logoUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={header.logoUrl}
                      alt="School logo"
                      className="h-12 w-12 object-contain rounded border"
                    />
                  )}
                  <label className="cursor-pointer">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-zinc-200 hover:bg-zinc-50 transition-colors",
                        isUploadingLogo && "opacity-50 pointer-events-none"
                      )}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {isUploadingLogo ? "Uploading…" : header.logoUrl ? "Replace logo" : "Upload logo"}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(file);
                      }}
                    />
                  </label>
                  {header.logoUrl && (
                    <button
                      onClick={() => updateHeader("logoUrl", "")}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-xs text-zinc-400">JPEG/PNG/WebP · max 2 MB</p>
              </div>
            </div>
          </div>

          {/* ── Numbering Format ── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">
              Question Numbering
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {NUMBERING_FORMATS.map((fmt) => (
                <label
                  key={fmt.value}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-colors",
                    selectedFormat === fmt.value
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-200 hover:border-zinc-400"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="numberingFormat"
                      value={fmt.value}
                      checked={selectedFormat === fmt.value}
                      onChange={() => setSelectedFormat(fmt.value)}
                      className="accent-zinc-900"
                    />
                    <span className="text-sm font-medium text-zinc-700">
                      {fmt.label}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-400 pl-5">
                    {fmt.example}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* ── Footer Section ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">
              Paper Footer
            </h3>

            {/* Page numbers toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-700">
                  Show page numbers
                </p>
                <p className="text-xs text-zinc-400">
                  Adds &ldquo;Page X of Y&rdquo; to each page footer
                </p>
              </div>
              <button
                onClick={() =>
                  updateFooter("showPageNumbers", !footer.showPageNumbers)
                }
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  footer.showPageNumbers ? "bg-zinc-900" : "bg-zinc-200"
                )}
                role="switch"
                aria-checked={footer.showPageNumbers}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow",
                    footer.showPageNumbers ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="signatureLine">Signature line label</Label>
              <Input
                id="signatureLine"
                value={footer.signatureLine}
                onChange={(e) => updateFooter("signatureLine", e.target.value)}
                placeholder="e.g. Teacher's Signature (leave blank to omit)"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customText">Custom footer text</Label>
              <Input
                id="customText"
                value={footer.customText}
                onChange={(e) => updateFooter("customText", e.target.value)}
                placeholder="e.g. School motto or additional note"
              />
            </div>
          </div>
        </div>

        {/* Drawer footer: Save button */}
        <div className="shrink-0 border-t px-4 py-3 flex justify-end gap-2 bg-white">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-1.5" />
            {isSaving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
