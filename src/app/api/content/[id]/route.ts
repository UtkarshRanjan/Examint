import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CONTENT_ITEM_TYPES } from "@/lib/types";
import type { ContentItemType } from "@/lib/types";

/**
 * PATCH /api/content/[id]
 *
 * Updates the text content or type/category of a single ContentItem.
 * Only the owning teacher can update their own items.
 *
 * Request body (JSON) — all fields optional:
 *   { textContent?: string, type?: ContentItemType }
 *
 * Response: { item: UpdatedContentItem }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json() as {
    textContent?: string;
    type?: string;
  };

  // Verify the item belongs to the authenticated teacher.
  const existing = await prisma.contentItem.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  if (existing.userId !== session.user.id) {
    return NextResponse.json(
      { error: "You do not have permission to edit this item." },
      { status: 403 }
    );
  }

  // Build the update payload — only update fields that were sent.
  const updateData: { textContent?: string; type?: string } = {};

  if (body.textContent !== undefined) {
    updateData.textContent = body.textContent.trim();
  }

  if (body.type !== undefined) {
    if (!(CONTENT_ITEM_TYPES as string[]).includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid type: ${body.type}` },
        { status: 400 }
      );
    }
    updateData.type = body.type as ContentItemType;
  }

  const updated = await prisma.contentItem.update({
    where: { id: params.id },
    data: updateData,
    select: {
      id: true,
      type: true,
      textContent: true,
      imageUrl: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ item: updated });
}

/**
 * DELETE /api/content/[id]
 *
 * Permanently deletes a ContentItem.
 * Only the owning teacher can delete their own items.
 *
 * Note: If the deleted ContentItem is referenced by PaperQuestion rows,
 * the `contentItemId` field on those rows is set to null (via `onDelete: SetNull`
 * in the Prisma schema), but the `snapshotText` and `snapshotImageUrl` are
 * preserved — so paper content is unaffected.
 *
 * Response: 204 No Content on success.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Verify ownership before deleting.
  const existing = await prisma.contentItem.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  if (existing.userId !== session.user.id) {
    return NextResponse.json(
      { error: "You do not have permission to delete this item." },
      { status: 403 }
    );
  }

  await prisma.contentItem.delete({ where: { id: params.id } });

  return new NextResponse(null, { status: 204 });
}
