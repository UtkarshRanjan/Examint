import { NextResponse } from "next/server";
import { getModelsMetadata } from "@/lib/db-management";
import { requireDeveloper } from "@/lib/require-developer";

/**
 * GET /api/database/models
 *
 * Returns metadata for every Prisma model. Developer-only.
 */
export async function GET() {
  const denied = await requireDeveloper();
  if (denied) return denied;

  return NextResponse.json({ models: getModelsMetadata() });
}
