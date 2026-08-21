import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildDocx } from "@/lib/docx-builder";

/**
 * GET /api/export?paperId=<id>
 *
 * Generates and streams a DOCX file for the specified QuestionPaper.
 *
 * Process:
 * 1. Authenticates the request.
 * 2. Loads the paper with all sections and questions from the database.
 * 3. Verifies the paper belongs to the authenticated teacher.
 * 4. Calls `buildDocx()` from lib/docx-builder.ts to generate the DOCX buffer.
 * 5. Streams the buffer to the client as a file download.
 *
 * The filename in the Content-Disposition header is derived from the paper title.
 * Special characters are stripped to avoid filename issues on Windows/macOS.
 *
 * Response headers:
 *   Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
 *   Content-Disposition: attachment; filename="<sanitized-title>.docx"
 *
 * Error responses:
 *   400 — Missing paperId parameter
 *   401 — Not authenticated
 *   403 — Paper does not belong to the authenticated teacher
 *   404 — Paper not found
 *   500 — DOCX generation error
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const paperId = searchParams.get("paperId");

  if (!paperId) {
    return NextResponse.json(
      { error: "Missing required query parameter: paperId" },
      { status: 400 }
    );
  }

  // Load the full paper with nested sections and questions.
  const paper = await prisma.questionPaper.findUnique({
    where: { id: paperId },
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

  if (paper.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    // Generate the DOCX file as a Buffer.
    const docxBuffer = await buildDocx({ paper, sections: paper.sections });

    // Sanitize the paper title for use as a filename.
    // Removes characters that are illegal in Windows filenames.
    const safeTitle = paper.title
      .replace(/[<>:"/\\|?*]/g, "")
      .trim()
      .slice(0, 100) || "question-paper";

    // Copy the Buffer bytes into a plain ArrayBuffer (not SharedArrayBuffer)
    // so TypeScript accepts it as a valid BlobPart for NextResponse.
    const ab: ArrayBuffer = new ArrayBuffer(docxBuffer.length);
    new Uint8Array(ab).set(docxBuffer);
    const blob = new Blob([ab], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeTitle}.docx"`,
        "Content-Length": String(docxBuffer.length),
      },
    });
  } catch (error) {
    console.error("[/api/export] DOCX generation error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate DOCX.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
