import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/papers/[id]
 *
 * Returns a single QuestionPaper with its full sections and questions.
 * Used by the Paper Editor and Paper Preview pages.
 *
 * Response: { paper: FullPaper }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const paper = await prisma.questionPaper.findUnique({
    where: { id: params.id },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          questions: {
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (!paper) {
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });
  }

  // Only the owning teacher can access their papers.
  if (paper.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({ paper });
}

/**
 * PATCH /api/papers/[id]
 *
 * Updates top-level paper fields: title, numberingFormat, headerConfig, footerConfig.
 * Also handles section/question mutations (add, reorder, update marks, delete)
 * passed in a structured `operations` array for atomic updates.
 *
 * Request body — all fields optional:
 *   {
 *     title?: string,
 *     numberingFormat?: string,
 *     headerConfig?: object,   // Full PaperHeaderConfig
 *     footerConfig?: object,   // Full PaperFooterConfig
 *     operations?: PaperOperation[]
 *   }
 *
 * PaperOperation types:
 *   ADD_SECTION        { type, title, instructions? }
 *   UPDATE_SECTION     { type, sectionId, title?, instructions? }
 *   DELETE_SECTION     { type, sectionId }
 *   REORDER_SECTIONS   { type, sectionIds: string[] }  — new order
 *   ADD_QUESTION       { type, sectionId, contentItemId, snapshotText, snapshotImageUrl, marks, order }
 *   UPDATE_QUESTION    { type, questionId, marks?, snapshotText? }
 *   DELETE_QUESTION    { type, questionId }
 *   REORDER_QUESTIONS  { type, sectionId, questionIds: string[] }
 *
 * Response: { paper: FullPaper }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Verify ownership.
  const existing = await prisma.questionPaper.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });
  }

  if (existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await request.json() as {
    title?: string;
    numberingFormat?: string;
    headerConfig?: object;
    footerConfig?: object;
    operations?: PaperOperation[];
  };

  // Build the top-level paper update payload.
  const paperUpdateData: Record<string, unknown> = {};
  if (body.title !== undefined) paperUpdateData.title = body.title.trim();
  if (body.numberingFormat !== undefined)
    paperUpdateData.numberingFormat = body.numberingFormat;
  if (body.headerConfig !== undefined)
    paperUpdateData.headerConfig = JSON.stringify(body.headerConfig);
  if (body.footerConfig !== undefined)
    paperUpdateData.footerConfig = JSON.stringify(body.footerConfig);

  // Execute all operations in sequence within a transaction.
  try {
    await prisma.$transaction(async (tx) => {
      // Apply paper-level updates if any.
      if (Object.keys(paperUpdateData).length > 0) {
        await tx.questionPaper.update({
          where: { id: params.id },
          data: paperUpdateData,
        });
      }

      // Process each operation in order.
      for (const op of body.operations ?? []) {
        await applyOperation(tx, params.id, op);
      }
    });
  } catch (error) {
    console.error("PATCH /api/papers/[id] failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to save paper changes.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Return the fully updated paper.
  const updatedPaper = await prisma.questionPaper.findUnique({
    where: { id: params.id },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { questions: { orderBy: { order: "asc" } } },
      },
    },
  });

  return NextResponse.json({ paper: updatedPaper });
}

/**
 * DELETE /api/papers/[id]
 *
 * Permanently deletes a QuestionPaper and all its sections and questions
 * (via CASCADE in the Prisma schema).
 *
 * Response: 204 No Content
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const existing = await prisma.questionPaper.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });
  }

  if (existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await prisma.questionPaper.delete({ where: { id: params.id } });

  return new NextResponse(null, { status: 204 });
}

// =============================================================================
// Paper Operation Types & Handler
// =============================================================================

/** Union type for all supported paper mutation operations. */
type PaperOperation =
  | { type: "ADD_SECTION"; title: string; instructions?: string }
  | {
      type: "UPDATE_SECTION";
      sectionId: string;
      title?: string;
      instructions?: string;
    }
  | { type: "DELETE_SECTION"; sectionId: string }
  | { type: "REORDER_SECTIONS"; sectionIds: string[] }
  | {
      type: "ADD_QUESTION";
      sectionId: string;
      contentItemId?: string;
      snapshotText?: string;
      snapshotImageUrl?: string;
      marks?: number;
      order?: number;
      parentQuestionId?: string | null;
    }
  | {
      type: "UPDATE_QUESTION";
      questionId: string;
      marks?: number;
      snapshotText?: string;
    }
  | { type: "DELETE_QUESTION"; questionId: string }
  | {
      type: "REORDER_QUESTIONS";
      sectionId: string;
      questionIds: string[];
      parentQuestionId?: string | null;
    };

/**
 * Applies a single PaperOperation within an active Prisma transaction.
 *
 * @param tx     - The active Prisma transaction client.
 * @param paperId - The paper being mutated (for ownership-scoped queries).
 * @param op     - The operation to apply.
 */
async function applyOperation(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  paperId: string,
  op: PaperOperation
) {
  switch (op.type) {
    case "ADD_SECTION": {
      // Determine the next order value by counting existing sections.
      const sectionCount = await tx.paperSection.count({
        where: { paperId },
      });
      await tx.paperSection.create({
        data: {
          paperId,
          title: op.title,
          instructions: op.instructions ?? null,
          order: sectionCount,
        },
      });
      break;
    }

    case "UPDATE_SECTION": {
      await tx.paperSection.update({
        where: { id: op.sectionId },
        data: {
          ...(op.title !== undefined ? { title: op.title } : {}),
          ...(op.instructions !== undefined
            ? { instructions: op.instructions }
            : {}),
        },
      });
      break;
    }

    case "DELETE_SECTION": {
      await tx.paperSection.delete({ where: { id: op.sectionId } });
      break;
    }

    case "REORDER_SECTIONS": {
      // Update each section's order to match the new array index.
      await Promise.all(
        op.sectionIds.map((sectionId, index) =>
          tx.paperSection.update({
            where: { id: sectionId },
            data: { order: index },
          })
        )
      );
      break;
    }

    case "ADD_QUESTION": {
      if (op.sectionId.startsWith("temp-")) {
        throw new Error(
          "This section is still saving. Please wait a moment and try again."
        );
      }

      if (op.parentQuestionId) {
        if (op.parentQuestionId.startsWith("temp-")) {
          throw new Error(
            "The parent question is still saving. Please wait a moment before adding subquestions."
          );
        }

        const parent = await tx.paperQuestion.findFirst({
          where: { id: op.parentQuestionId, sectionId: op.sectionId },
          select: { id: true, parentQuestionId: true },
        });

        if (!parent) {
          throw new Error("Parent question not found in this section.");
        }

        if (parent.parentQuestionId) {
          throw new Error(
            "Subquestions can only be added under top-level questions."
          );
        }
      }

      // Determine the next order value among siblings (same section + parent).
      const questionCount = await tx.paperQuestion.count({
        where: {
          sectionId: op.sectionId,
          parentQuestionId: op.parentQuestionId ?? null,
        },
      });
      await tx.paperQuestion.create({
        data: {
          sectionId: op.sectionId,
          contentItemId: op.contentItemId ?? null,
          snapshotText: op.snapshotText ?? null,
          snapshotImageUrl: op.snapshotImageUrl ?? null,
          marks: op.marks ?? 0,
          order: op.order ?? questionCount,
          parentQuestionId: op.parentQuestionId ?? null,
        },
      });
      break;
    }

    case "UPDATE_QUESTION": {
      await tx.paperQuestion.update({
        where: { id: op.questionId },
        data: {
          ...(op.marks !== undefined ? { marks: op.marks } : {}),
          ...(op.snapshotText !== undefined
            ? { snapshotText: op.snapshotText }
            : {}),
        },
      });
      break;
    }

    case "DELETE_QUESTION": {
      await tx.paperQuestion.delete({ where: { id: op.questionId } });
      break;
    }

    case "REORDER_QUESTIONS": {
      await Promise.all(
        op.questionIds.map((qId, index) =>
          tx.paperQuestion.update({
            where: { id: qId },
            data: { order: index },
          })
        )
      );
      break;
    }
  }
}
