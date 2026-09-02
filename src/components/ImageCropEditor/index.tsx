"use client";

import { useState, useCallback, useRef } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { getCroppedImageBlob } from "@/lib/crop-image";
import { Button } from "@/components/ui/button";
import { X, RotateCw, ZoomIn, ZoomOut, Crop } from "lucide-react";

/**
 * Props for the ImageCropEditor modal component.
 */
interface ImageCropEditorProps {
  /** The image file selected by the teacher to crop. */
  imageFile: File;
  /**
   * Called when the teacher confirms the crop.
   * Receives the cropped image as a Blob (ready for FormData upload).
   */
  onConfirm: (croppedBlob: Blob) => void;
  /**
   * Called when the teacher clicks "Skip" — uses the original file without cropping.
   * Passes the original File wrapped as a Blob.
   */
  onSkip: () => void;
  /** Called when the teacher closes the modal without confirming or skipping. */
  onClose: () => void;
}

/**
 * ImageCropEditor — Modal for cropping/zooming/rotating an uploaded image.
 *
 * Uses `react-easy-crop` to provide an intuitive crop interface.
 * The "Confirm Crop" action uses the browser Canvas API to render the cropped
 * region into a new Blob (no server round-trip; done entirely client-side).
 *
 * The cropped Blob is passed to `onConfirm` and then uploaded to /api/extract
 * via FormData in the parent Upload page.
 *
 * Controls:
 * - Drag to pan the image within the crop frame.
 * - Zoom slider + +/- buttons to zoom in/out.
 * - Rotation buttons to rotate the image in 90° increments.
 * - "Confirm Crop" → runs getCroppedImg() and calls onConfirm(blob).
 * - "Skip" → calls onSkip() with the original image.
 */
export default function ImageCropEditor({
  imageFile,
  onConfirm,
  onSkip,
  onClose,
}: ImageCropEditorProps) {
  // Create an object URL for the selected file so react-easy-crop can render it.
  const [imageSrc] = useState<string>(() => URL.createObjectURL(imageFile));

  // Crop area as a percentage (0–100) of the image dimensions.
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  // Zoom factor: 1 = no zoom, 3 = 3× zoom.
  const [zoom, setZoom] = useState(1);
  // Rotation in degrees (0, 90, 180, 270).
  const [rotation, setRotation] = useState(0);
  // The pixel area of the crop (populated by onCropComplete callback).
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const croppedAreaPixelsRef = useRef<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * react-easy-crop callback: fired whenever the crop area changes.
   * We store the pixel-based crop coordinates for use when rendering the Blob.
   *
   * @param _ - The percentage-based crop area (unused).
   * @param croppedPixels - The exact pixel coordinates of the crop rectangle.
   */
  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    croppedAreaPixelsRef.current = croppedPixels;
    setCroppedAreaPixels(croppedPixels);
  }, []);

  /**
   * Increases zoom by 0.1, capped at 3×.
   */
  function zoomIn() {
    setZoom((z) => Math.min(3, parseFloat((z + 0.1).toFixed(1))));
  }

  /**
   * Decreases zoom by 0.1, floored at 1×.
   */
  function zoomOut() {
    setZoom((z) => Math.max(1, parseFloat((z - 0.1).toFixed(1))));
  }

  /**
   * Rotates the image clockwise by 90°, wrapping at 360°.
   */
  function rotateClockwise() {
    setRotation((r) => (r + 90) % 360);
  }

  /**
   * Renders the crop frame region (including zoom/pan) into a JPEG Blob.
   */
  async function getCroppedBlob(): Promise<Blob> {
    const pixelCrop = croppedAreaPixelsRef.current ?? croppedAreaPixels;
    if (!pixelCrop) {
      throw new Error("No crop area selected.");
    }

    return getCroppedImageBlob(imageSrc, pixelCrop, rotation);
  }

  /**
   * Handles the "Confirm Crop" button click.
   * Renders the cropped Blob and passes it to the parent via onConfirm.
   */
  async function handleConfirm() {
    setIsProcessing(true);
    try {
      const blob = await getCroppedBlob();
      onConfirm(blob);
    } catch (err) {
      console.error("Crop failed:", err);
      alert("Failed to process the crop. Please try again or use Skip.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    /* Modal overlay */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">

        {/* Modal header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h2 className="font-semibold text-zinc-900 flex items-center gap-2">
              <Crop className="h-4 w-4" />
              Crop Image
            </h2>
            <p className="text-xs text-zinc-500">
              {imageFile.name} — drag to pan, zoom in on the area you want, then confirm
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 transition-colors"
            aria-label="Close crop editor"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Crop area — fixed height container */}
        <div className="relative bg-zinc-800" style={{ height: 360 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={undefined} // Free-form crop (no forced aspect ratio)
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Controls */}
        <div className="px-4 py-3 space-y-3 border-t">
          {/* Zoom slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 w-10">Zoom</span>
            <button onClick={zoomOut} className="text-zinc-500 hover:text-zinc-900">
              <ZoomOut className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-zinc-900"
              aria-label="Zoom"
            />
            <button onClick={zoomIn} className="text-zinc-500 hover:text-zinc-900">
              <ZoomIn className="h-4 w-4" />
            </button>
            <span className="text-xs text-zinc-400 w-8">{zoom.toFixed(1)}×</span>
          </div>

          {/* Rotation */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 w-10">Rotate</span>
            <button
              onClick={rotateClockwise}
              className="flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 border rounded px-2 py-1 transition-colors"
            >
              <RotateCw className="h-3.5 w-3.5" />
              90°
            </button>
            <span className="text-xs text-zinc-400">{rotation}° applied</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t bg-zinc-50">
          <Button variant="outline" onClick={onSkip} disabled={isProcessing}>
            Skip (use original)
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing}>
            {isProcessing ? "Processing…" : "Confirm Crop"}
          </Button>
        </div>
      </div>
    </div>
  );
}
