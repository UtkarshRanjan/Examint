"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Upload, ImagePlus, Loader2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ImageCropEditor from "@/components/ImageCropEditor";
import ExtractReview from "@/components/ExtractReview";
import type { GeminiExtractedBlock } from "@/lib/types";

/**
 * Upload & Extract Page — /upload
 *
 * The core content ingestion flow for Examint:
 *
 *   Step 1 — Select images:
 *     Teacher drags and drops or clicks to select one or more image files.
 *
 *   Step 2 — Crop each image:
 *     For each selected image, the ImageCropEditor modal opens.
 *     Teacher drags crop rectangle, zooms, optionally rotates.
 *     "Confirm Crop" → produces a Blob; "Skip" uses the original file.
 *     Multiple images are processed in sequence (one crop modal at a time).
 *
 *   Step 3 — Extract:
 *     The cropped Blob is uploaded to /api/extract via FormData.
 *     /api/extract resizes it with sharp and sends it to Gemini Vision.
 *     A loading spinner is shown during Gemini processing (5–15 seconds).
 *
 *   Step 4 — Review:
 *     Side-by-side view: uploaded image (left) + extracted blocks (right).
 *     Teacher can edit text, change category, check/uncheck blocks.
 *     "Save Selected" posts to /api/content to store the blocks.
 *
 * State machine: "select" → "cropping" → "extracting" → "reviewing" → "select"
 */

/** The current step in the upload-extract workflow. */
type UploadStep = "select" | "cropping" | "extracting" | "reviewing";

/** The result of a successful extraction, held during the review step. */
interface ExtractionResult {
  imageUrl: string;
  blocks: GeminiExtractedBlock[];
}

/** Accepted image MIME types for the file input. */
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

export default function UploadPage() {
  const [step, setStep] = useState<UploadStep>("select");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [croppedBlobs, setCroppedBlobs] = useState<Blob[]>([]);
  const [extractionResult, setExtractionResult] =
    useState<ExtractionResult | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Validates and queues selected files for processing.
   * Filters out files that are not accepted image types or over 10 MB.
   *
   * @param files - The FileList from the file input or drop event.
   */
  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast.error(`"${file.name}" is not a supported image type (JPEG/PNG/WebP).`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`"${file.name}" exceeds the 10 MB file size limit.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setPendingFiles(validFiles);
    setCurrentFileIndex(0);
    setCroppedBlobs([]);
    setStep("cropping");
  }

  /**
   * Drag-and-drop event handlers for the drop zone.
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFilesSelected(e.dataTransfer.files);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Called by ImageCropEditor when the teacher confirms the crop.
   * Stores the Blob and advances to the next file or starts extraction.
   *
   * @param blob - The cropped image Blob from the Canvas API.
   */
  function handleCropConfirm(blob: Blob) {
    const updatedBlobs = [...croppedBlobs, blob];
    setCroppedBlobs(updatedBlobs);
    advanceToNextFileOrExtract(updatedBlobs);
  }

  /**
   * Called by ImageCropEditor when the teacher clicks "Skip".
   * Uses the original file (as-is) instead of a cropped version.
   */
  function handleCropSkip() {
    const originalFile = pendingFiles[currentFileIndex];
    const updatedBlobs = [...croppedBlobs, originalFile];
    setCroppedBlobs(updatedBlobs);
    advanceToNextFileOrExtract(updatedBlobs);
  }

  /**
   * Advances to the crop editor for the next file, or triggers extraction
   * if all files have been cropped.
   *
   * @param blobs - The accumulated array of Blobs (one per processed file).
   */
  function advanceToNextFileOrExtract(blobs: Blob[]) {
    const nextIndex = currentFileIndex + 1;
    if (nextIndex < pendingFiles.length) {
      setCurrentFileIndex(nextIndex);
    } else {
      // All files cropped — proceed to extraction with the first (or only) blob.
      // For simplicity: we extract one image at a time. If multiple images were
      // selected, they are extracted sequentially (one review per image).
      extractImage(blobs[0]);
    }
  }

  /**
   * Uploads the given Blob to /api/extract and processes the Gemini response.
   * Transitions the UI to "extracting" during the API call, then "reviewing" on success.
   *
   * @param blob - The cropped/original image Blob to upload and extract.
   */
  async function extractImage(blob: Blob) {
    setStep("extracting");
    setExtractError(null);

    try {
      const formData = new FormData();
      formData.append("image", blob, "upload.jpg");

      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as {
        imageUrl?: string;
        blocks?: GeminiExtractedBlock[];
        error?: string;
      };

      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Extraction failed. Please try again.");
      }

      if (!data.imageUrl || !data.blocks) {
        throw new Error("Invalid response from server. Please try again.");
      }

      setExtractionResult({ imageUrl: data.imageUrl, blocks: data.blocks });
      setStep("reviewing");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Extraction failed. Please retry.";
      setExtractError(message);
      toast.error(message);
      setStep("select"); // Let the user try again
    }
  }

  /**
   * Saves the teacher-selected blocks to the Content Bank via POST /api/content.
   * Called by ExtractReview's "Save Selected" button.
   *
   * @param selectedBlocks - The blocks checked by the teacher (after editing).
   */
  async function handleSaveBlocks(selectedBlocks: GeminiExtractedBlock[]) {
    if (!extractionResult) return;

    const response = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: selectedBlocks,
        sourceImageUrl: extractionResult.imageUrl,
      }),
    });

    const data = (await response.json()) as { message?: string; error?: string };

    if (!response.ok) {
      toast.error(data.error ?? "Failed to save blocks.");
      throw new Error(data.error ?? "Save failed");
    }

    toast.success(
      `${selectedBlocks.length} block${selectedBlocks.length !== 1 ? "s" : ""} saved to your Content Bank!`
    );

    // Reset to the select step for the next upload.
    setStep("select");
    setExtractionResult(null);
    setPendingFiles([]);
    setCroppedBlobs([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /**
   * Resets the workflow back to the image selection step.
   * Called by the "Cancel" button in the cropping/extracting/reviewing steps.
   */
  function handleReset() {
    setStep("select");
    setPendingFiles([]);
    setCroppedBlobs([]);
    setExtractionResult(null);
    setExtractError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Upload & Extract</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Upload a photo of your textbook, handout, or question paper. Gemini AI
          will extract the content for your bank.
        </p>
      </div>

      {/* ── Step: Select / Drop zone ── */}
      {step === "select" && (
        <div className="space-y-4">
          {extractError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Extraction failed:</strong> {extractError}
              </div>
            </div>
          )}

          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
              cursor-pointer transition-colors p-12 text-center
              ${isDragging
                ? "border-zinc-900 bg-zinc-50"
                : "border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50"
              }
            `}
          >
            <div className="rounded-full bg-zinc-100 p-4">
              <ImagePlus className="h-8 w-8 text-zinc-400" />
            </div>
            <div>
              <p className="font-medium text-zinc-700">
                {isDragging ? "Drop the image here" : "Drag & drop or click to upload"}
              </p>
              <p className="text-sm text-zinc-400 mt-1">
                JPEG, PNG, or WebP · Max 10 MB · One or more images
              </p>
            </div>
            <Button variant="outline" size="sm" tabIndex={-1}>
              <Upload className="h-4 w-4 mr-1.5" />
              Browse files
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
        </div>
      )}

      {/* ── Step: Cropping ── */}
      {step === "cropping" && pendingFiles[currentFileIndex] && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              Cropping image {currentFileIndex + 1} of {pendingFiles.length}
            </p>
            <button
              onClick={handleReset}
              className="text-zinc-400 hover:text-zinc-700"
              aria-label="Cancel upload"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <ImageCropEditor
            imageFile={pendingFiles[currentFileIndex]}
            onConfirm={handleCropConfirm}
            onSkip={handleCropSkip}
            onClose={handleReset}
          />
        </div>
      )}

      {/* ── Step: Extracting (loading state) ── */}
      {step === "extracting" && (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Loader2 className="h-10 w-10 animate-spin text-zinc-400" />
          <div className="text-center">
            <p className="font-medium text-zinc-700">
              Extracting content with Gemini AI…
            </p>
            <p className="text-sm text-zinc-400 mt-1">
              This typically takes 5–15 seconds. Please wait.
            </p>
          </div>
        </div>
      )}

      {/* ── Step: Reviewing extraction results ── */}
      {step === "reviewing" && extractionResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-zinc-900">Review extracted content</h2>
              <p className="text-sm text-zinc-500">
                Edit categories and text as needed, then save the blocks you want.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <X className="h-4 w-4 mr-1" />
              Start over
            </Button>
          </div>

          <ExtractReview
            croppedImageUrl={extractionResult.imageUrl}
            extractedBlocks={extractionResult.blocks}
            onSave={handleSaveBlocks}
            onRetry={() => {
              // Re-extract the same image without re-uploading.
              if (croppedBlobs.length > 0) {
                extractImage(croppedBlobs[0]);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
