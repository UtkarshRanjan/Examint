import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ContentItemType, GeminiExtractedBlock } from "@/lib/types";
import { CONTENT_ITEM_TYPES } from "@/lib/types";

/**
 * GET /api/content
 *
 * Returns a paginated list of ContentItem rows for the authenticated teacher.
 *
 * Query parameters:
 *   page    — Page number (1-based, default: 1)
 *   limit   — Items per page (default: 20, max: 50)
 *   type    — Filter by ContentItemType (optional)
 *   search  — Full-text keyword search in textContent (optional)
 *
 * Response:
 *   { items: ContentItem[], total: number, page: number, totalPages: number }
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const typeFilter = searchParams.get("type") as ContentItemType | null;
  const search = searchParams.get("search")?.trim() ?? "";

  const skip = (page - 1) * limit;

  // Build the Prisma where clause.
  const where = {
    userId: session.user.id,
    ...(typeFilter && (CONTENT_ITEM_TYPES as string[]).includes(typeFilter)
      ? { type: typeFilter }
      : {}),
    ...(search
      ? {
          textContent: {
            contains: search, // SQLite: case-insensitive by default for ASCII
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.contentItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        type: true,
        textContent: true,
        imageUrl: true,
        sourceImageUrl: true,
        createdAt: true,
      },
    }),
    prisma.contentItem.count({ where }),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

/**
 * POST /api/content
 *
 * Creates one or more ContentItem rows from Gemini-extracted blocks.
 * Called from the ExtractReview component after the teacher selects blocks to save.
 *
 * Request body:
 *   {
 *     blocks: GeminiExtractedBlock[],   // The selected blocks from ExtractReview
 *     sourceImageUrl: string            // Path to the uploaded image
 *   }
 *
 * Response:
 *   { created: number }  — Number of rows inserted
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json() as {
    blocks?: GeminiExtractedBlock[];
    sourceImageUrl?: string;
  };

  if (!body.blocks || !Array.isArray(body.blocks) || body.blocks.length === 0) {
    return NextResponse.json({ error: "No blocks provided." }, { status: 400 });
  }

  // Build the data array for createMany.
  const data = body.blocks.map((block) => ({
    userId: session.user.id,
    type: (CONTENT_ITEM_TYPES as string[]).includes(block.type) ? block.type : "other",
    textContent: block.text?.trim() || null,
    // For photo/diagram types, the imageUrl points to the extracted image (same as source).
    imageUrl:
      (block.type === "photo" || block.type === "diagram")
        ? (body.sourceImageUrl ?? null)
        : null,
    sourceImageUrl: body.sourceImageUrl ?? null,
  }));

  const result = await prisma.contentItem.createMany({ data });

  return NextResponse.json({ created: result.count }, { status: 201 });
}
