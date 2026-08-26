import { NextRequest, NextResponse } from "next/server";
import {
  buildDataFromBody,
  getModelDelegate,
  isValidModel,
} from "@/lib/db-management";
import { requireDeveloper } from "@/lib/require-developer";

/**
 * GET /api/database/[model]/[id]
 *
 * Fetches a single row by id. Developer-only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { model: string; id: string } }
) {
  const denied = await requireDeveloper();
  if (denied) return denied;

  const { model, id } = params;
  if (!isValidModel(model)) {
    return NextResponse.json({ error: "Invalid model." }, { status: 400 });
  }

  const delegate = getModelDelegate(model);

  try {
    const row = await delegate.findUnique({ where: { id } });
    if (!row) {
      return NextResponse.json({ error: "Row not found." }, { status: 404 });
    }
    return NextResponse.json({ row });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load row.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/database/[model]/[id]
 *
 * Updates an existing row. Developer-only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { model: string; id: string } }
) {
  const denied = await requireDeveloper();
  if (denied) return denied;

  const { model, id } = params;
  if (!isValidModel(model)) {
    return NextResponse.json({ error: "Invalid model." }, { status: 400 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const data = buildDataFromBody(model, body, "update");
  const delegate = getModelDelegate(model);

  try {
    const row = await delegate.update({ where: { id }, data });
    return NextResponse.json({ row });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update row.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/database/[model]/[id]
 *
 * Deletes a single row. Developer-only.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { model: string; id: string } }
) {
  const denied = await requireDeveloper();
  if (denied) return denied;

  const { model, id } = params;
  if (!isValidModel(model)) {
    return NextResponse.json({ error: "Invalid model." }, { status: 400 });
  }

  const delegate = getModelDelegate(model);

  try {
    await delegate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete row.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
