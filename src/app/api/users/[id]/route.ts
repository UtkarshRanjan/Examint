import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLES, type Role } from "@/lib/roles";

/**
 * PATCH /api/users/[id]
 *
 * Updates a user's role. Developer-only.
 *
 * Request body (JSON): { role: string }  — must be one of ROLES.
 *
 * Guards:
 * - Only a Developer may call this endpoint (403 otherwise).
 * - `role` must be one of the known ROLES (400 otherwise).
 * - The target user must exist (404 otherwise).
 * - Demoting the last remaining DEVELOPER account is rejected (400), so
 *   the app can never end up with zero Developers able to manage roles.
 *
 * Response: { user: { id, name, email, role, createdAt } }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  if (session.user.role !== "DEVELOPER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { role?: string };
  const newRole = body.role;

  if (!newRole || !(ROLES as string[]).includes(newRole)) {
    return NextResponse.json(
      { error: `Role must be one of: ${ROLES.join(", ")}` },
      { status: 400 }
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, role: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (targetUser.role === "DEVELOPER" && newRole !== "DEVELOPER") {
    const developerCount = await prisma.user.count({
      where: { role: "DEVELOPER" },
    });
    if (developerCount <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last remaining Developer account." },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { role: newRole as Role },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user: updated });
}
