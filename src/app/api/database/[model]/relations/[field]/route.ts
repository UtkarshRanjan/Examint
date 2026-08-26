import { NextRequest, NextResponse } from "next/server";
import { getRelationOptions, isValidModel } from "@/lib/db-management";
import { requireDeveloper } from "@/lib/require-developer";

/**
 * GET /api/database/[model]/relations/[field]
 *
 * Returns parent-row options for a foreign-key field. Developer-only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { model: string; field: string } }
) {
  const denied = await requireDeveloper();
  if (denied) return denied;

  const { model, field } = params;
  if (!isValidModel(model)) {
    return NextResponse.json({ error: "Invalid model." }, { status: 400 });
  }

  try {
    const options = await getRelationOptions(model, field);
    return NextResponse.json({ options });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load options.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
