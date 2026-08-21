import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { PaperHeaderConfig, PaperFooterConfig } from "@/lib/types";
import { DEFAULT_HEADER_CONFIG, DEFAULT_FOOTER_CONFIG } from "@/lib/types";

/**
 * GET /api/papers
 *
 * Returns all QuestionPaper rows for the authenticated teacher.
 * Includes section count and total marks per paper (computed server-side).
 *
 * Response: { papers: PaperSummary[] }
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const papers = await prisma.questionPaper.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      numberingFormat: true,
      headerConfig: true,
      createdAt: true,
      sections: {
        select: {
          id: true,
          questions: {
            select: { marks: true },
          },
        },
      },
    },
  });

  // Compute summary data for the papers list table.
  const summaries = papers.map((paper) => {
    const totalMarks = paper.sections
      .flatMap((s) => s.questions)
      .reduce((sum, q) => sum + (q.marks || 0), 0);

    const headerConfig: Partial<PaperHeaderConfig> = JSON.parse(
      paper.headerConfig || "{}"
    );

    return {
      id: paper.id,
      title: paper.title,
      subject: headerConfig.subject ?? "",
      date: headerConfig.date ?? "",
      sectionsCount: paper.sections.length,
      totalMarks,
      createdAt: paper.createdAt,
    };
  });

  return NextResponse.json({ papers: summaries });
}

/**
 * POST /api/papers
 *
 * Creates a new QuestionPaper with default header/footer config.
 *
 * Request body:
 *   { title: string }
 *
 * Response: { paper: { id, title, ... } }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json() as { title?: string };

  if (!body.title?.trim()) {
    return NextResponse.json(
      { error: "Paper title is required." },
      { status: 400 }
    );
  }

  const paper = await prisma.questionPaper.create({
    data: {
      userId: session.user.id,
      title: body.title.trim(),
      headerConfig: JSON.stringify(DEFAULT_HEADER_CONFIG),
      footerConfig: JSON.stringify(DEFAULT_FOOTER_CONFIG),
    },
  });

  return NextResponse.json({ paper }, { status: 201 });
}
