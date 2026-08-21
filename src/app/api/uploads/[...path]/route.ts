import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import fs from "fs";
import path from "path";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/uploads/[...path]
 *
 * Serves image files stored in the local `uploads/` directory.
 * All requests are authenticated — unauthenticated users cannot access any image.
 *
 * Why a custom route instead of Next.js `public/`?
 * Files in `public/` are served without any authentication, which would expose
 * all teacher uploads to anyone with a direct URL. By routing through this
 * handler, we check the session before serving the file.
 *
 * Path structure:
 *   /api/uploads/<userId>/<filename>
 * Maps to filesystem:
 *   ./uploads/<userId>/<filename>
 *
 * Security:
 * - Path traversal is prevented by resolving the full path and checking
 *   that it starts with the uploads directory root.
 * - Only image MIME types are served (JPEG, PNG, WebP).
 * - Files outside `./uploads/` are rejected with 403.
 *
 * @param request - The incoming Next.js request.
 * @param params  - Catches all path segments after /api/uploads/.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  // Authenticate — images are only accessible to logged-in teachers.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse("Unauthorised", { status: 401 });
  }

  // Reconstruct the file path from the path segments.
  const relativePath = params.path.join("/");
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const filePath = path.resolve(uploadsRoot, relativePath);

  // Security: ensure the resolved path is inside the uploads directory.
  // This prevents path traversal attacks (e.g. /api/uploads/../../etc/passwd).
  if (!filePath.startsWith(uploadsRoot + path.sep)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Check that the file exists.
  if (!fs.existsSync(filePath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Read the file and determine its MIME type from the extension.
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };

  const contentType = mimeTypes[ext];
  if (!contentType) {
    return new NextResponse("Unsupported file type", { status: 415 });
  }

  // Serve the image with appropriate cache headers.
  // `immutable` + 1-year max-age: images are content-addressed by UUID so they
  // never change once created. The browser can cache them aggressively.
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
