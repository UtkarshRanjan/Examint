import { NextRequest, NextResponse } from "next/server";
import {
  buildDataFromBody,
  getDisplayFields,
  getModelDelegate,
  isValidModel,
} from "@/lib/db-management";
import { requireDeveloper } from "@/lib/require-developer";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /api/database/[model]
 *
 * Lists paginated rows for a Prisma model. Developer-only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { model: string } }
) {
  const denied = await requireDeveloper();
  if (denied) return denied;

  const { model } = params;
  if (!isValidModel(model)) {
    return NextResponse.json({ error: "Invalid model." }, { status: 400 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10))
  );
  const skip = (page - 1) * limit;

  const delegate = getModelDelegate(model);
  const idField = getDisplayFields(model).find((f) => f.isId)?.name ?? "id";

  try {
    const [rows, total] = await Promise.all([
      delegate.findMany({
        skip,
        take: limit,
        orderBy: { [idField]: "asc" },
      }),
      delegate.count(),
    ]);

    return NextResponse.json({ rows, total, page, limit });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load rows.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/database/[model]
 *
 * Inserts a new row. Developer-only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { model: string } }
) {
  const denied = await requireDeveloper();
  if (denied) return denied;

  const { model } = params;
  if (!isValidModel(model)) {
    return NextResponse.json({ error: "Invalid model." }, { status: 400 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const data = buildDataFromBody(model, body, "create");
  const delegate = getModelDelegate(model);

  try {
    const row = await delegate.create({ data });
    return NextResponse.json({ row });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create row.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/database/[model]
 *
 * Truncates all rows in a model. Developer-only.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { model: string } }
) {
  const denied = await requireDeveloper();
  if (denied) return denied;

  const { model } = params;
  if (!isValidModel(model)) {
    return NextResponse.json({ error: "Invalid model." }, { status: 400 });
  }

  const delegate = getModelDelegate(model);

  try {
    const result = await delegate.deleteMany({});
    return NextResponse.json({ count: result.count });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to truncate table.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
