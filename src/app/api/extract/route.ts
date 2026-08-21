import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { IncomingMessage } from "http";
import formidable, { type File as FormidableFile } from "formidable";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encrypt";
import { extractContentFromImage } from "@/lib/gemini";
import type { GeminiExtractedBlock } from "@/lib/types";

/**
 * /api/extract — Image Upload + Gemini Content Extraction
 *
 * Accepts a multipart/form-data POST request containing an image file.
 * Processes the image through the following pipeline:
 *   1. Authenticate the request (NextAuth session required).
 *   2. Parse the multipart upload with `formidable`.
 *   3. Validate file type (JPEG/PNG/WebP) and size (max 10 MB).
 *   4. Resize the image to a maximum 1200px width using `sharp` (bandwidth/quota optimisation).
 *   5. Write the resized image to `uploads/<userId>/` with a UUID filename.
 *   6. Encode the resized image as base64 for the Gemini API.
 *   7. Call the Gemini Vision API with the teacher's own encrypted API key.
 *   8. Return the extracted blocks as JSON.
 *
 * The route handler must disable Next.js's built-in body parser because
 * `formidable` handles the raw stream directly.
 */

/** Maximum allowed file size in bytes (10 MB). */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum image width after server-side resize (sharp). */
const MAX_IMAGE_WIDTH = 1200;

/** Allowed MIME types for uploaded images. */
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * Disable Next.js body parser for this route so formidable can
 * read the raw multipart stream from the request.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Converts a Next.js NextRequest into a Node.js IncomingMessage-compatible
 * object that formidable can parse.
 *
 * Next.js App Router uses the Fetch API (Request/Response), while formidable
 * expects a Node.js IncomingMessage (http.IncomingMessage). This adapter
 * reads the request body as a Buffer and wraps it in a readable stream.
 *
 * @param request - The Next.js App Router request object.
 * @returns A fake IncomingMessage with the headers and body stream.
 */
async function toNodeRequest(request: NextRequest): Promise<IncomingMessage> {
  const arrayBuffer = await request.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { Readable } = await import("stream");
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);

  // Cast to IncomingMessage — formidable only reads headers and body stream.
  const nodeReq = Object.assign(readable, {
    headers: Object.fromEntries(request.headers.entries()),
    method: request.method,
    url: request.url,
  }) as unknown as IncomingMessage;

  return nodeReq;
}

/**
 * Parses a multipart form upload using formidable.
 *
 * @param nodeReq - The Node.js IncomingMessage-compatible request stream.
 * @returns A Promise resolving to the parsed file (first file in the "image" field).
 * @throws Error if no file is found in the upload.
 */
async function parseUpload(
  nodeReq: IncomingMessage
): Promise<FormidableFile> {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
      keepExtensions: true,
      multiples: false,
    });

    form.parse(nodeReq, (err, _fields, files) => {
      if (err) {
        reject(new Error(`Upload parsing failed: ${err.message}`));
        return;
      }

      const fileField = files.image;
      const file = Array.isArray(fileField) ? fileField[0] : fileField;

      if (!file) {
        reject(new Error("No image file found in the upload. Use the field name 'image'."));
        return;
      }

      resolve(file);
    });
  });
}

/**
 * POST /api/extract
 *
 * Handles the image upload → resize → Gemini extraction pipeline.
 *
 * Expected FormData fields:
 *   image: File (JPEG/PNG/WebP, max 10 MB)
 *
 * Success response (200):
 *   {
 *     imageUrl: string,          // Relative URL to the saved image
 *     blocks: GeminiExtractedBlock[]  // Extracted content blocks
 *   }
 *
 * Error responses:
 *   400 — Missing file, wrong type, or file too large
 *   401 — Not authenticated
 *   402 — Gemini API key not configured
 *   500 — Server error (resize, disk write, or Gemini failure)
 */
export async function POST(request: NextRequest) {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const userId = session.user.id;

  // 2. Retrieve and decrypt the teacher's Gemini API key.
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { geminiApiKey: true },
  });

  const geminiApiKey = userRecord?.geminiApiKey
    ? decrypt(userRecord.geminiApiKey)
    : "";

  if (!geminiApiKey) {
    return NextResponse.json(
      {
        error:
          "Gemini API key not configured. Please add your key in Settings before uploading.",
      },
      { status: 402 }
    );
  }

  try {
    // 3. Parse the multipart upload.
    const nodeReq = await toNodeRequest(request);
    const uploadedFile = await parseUpload(nodeReq);

    // 4. Validate MIME type.
    const mimeType = uploadedFile.mimetype as AllowedMimeType | null;
    if (!mimeType || !(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${mimeType ?? "unknown"}. Only JPEG, PNG, and WebP are accepted.`,
        },
        { status: 400 }
      );
    }

    // 5. Resize the image with sharp (max 1200px width).
    const inputBuffer = fs.readFileSync(uploadedFile.filepath);
    const resizedBuffer = await sharp(inputBuffer)
      .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
      .toBuffer();

    // 6. Write the resized image to uploads/<userId>/
    const userUploadDir = path.join(process.cwd(), "uploads", userId);
    fs.mkdirSync(userUploadDir, { recursive: true });

    const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const filename = `${uuidv4()}.${ext}`;
    const savedFilePath = path.join(userUploadDir, filename);
    fs.writeFileSync(savedFilePath, resizedBuffer);

    // Clean up the temp file created by formidable.
    fs.unlinkSync(uploadedFile.filepath);

    // Relative URL to serve the image via /api/uploads/[...path]
    const imageUrl = `/api/uploads/${userId}/${filename}`;

    // 7. Encode the resized image as base64 for Gemini.
    const base64Image = resizedBuffer.toString("base64");

    // 8. Call Gemini Vision API.
    const blocks: GeminiExtractedBlock[] = await extractContentFromImage(
      base64Image,
      mimeType,
      geminiApiKey
    );

    return NextResponse.json({ imageUrl, blocks });
  } catch (error) {
    console.error("[/api/extract] Error:", error);
    const message = error instanceof Error ? error.message : "Extraction failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
