import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encrypt";
import { testGeminiApiKey } from "@/lib/gemini";

/**
 * GET /api/settings
 *
 * Returns the current teacher's profile and whether a Gemini API key is set.
 * The actual key value is never returned — only a boolean `hasGeminiKey`.
 * This protects the key even if the response is intercepted.
 *
 * Response body:
 *   { name, email, hasGeminiKey: boolean }
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, geminiApiKey: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    name: user.name,
    email: user.email,
    // Indicate whether a key is stored without revealing the key itself.
    hasGeminiKey: !!user.geminiApiKey,
  });
}

/**
 * PATCH /api/settings
 *
 * Updates one or more settings fields for the current teacher.
 * All fields are optional — send only what you want to change.
 *
 * Request body (JSON) — all fields optional:
 *   {
 *     name?: string,
 *     email?: string,
 *     currentPassword?: string,    // Required when changing password or email
 *     newPassword?: string,
 *     geminiApiKey?: string         // Plain-text key; will be encrypted before storage
 *   }
 *
 * Business rules:
 * - Changing email: requires currentPassword for verification.
 * - Changing password: requires currentPassword + newPassword (min 8 chars).
 * - Changing name: no password required.
 * - Saving Gemini key: encrypts before storing; empty string clears the key.
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json() as {
    name?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
    geminiApiKey?: string;
  };

  // Load the current user record including the password hash for verification.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Build the update payload incrementally.
  const updateData: {
    name?: string;
    email?: string;
    passwordHash?: string;
    geminiApiKey?: string;
  } = {};

  // --- Name change (no password required) ---
  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    }
    updateData.name = body.name.trim();
  }

  // --- Email change (requires current password) ---
  if (body.email !== undefined) {
    if (!body.currentPassword) {
      return NextResponse.json(
        { error: "Current password is required to change your email." },
        { status: 400 }
      );
    }

    const passwordMatch = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 400 }
      );
    }

    const normalizedEmail = body.email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    // Check the new email isn't already taken by another account.
    if (normalizedEmail !== user.email) {
      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: "This email is already registered to another account." },
          { status: 409 }
        );
      }
    }

    updateData.email = normalizedEmail;
  }

  // --- Password change (requires currentPassword + newPassword) ---
  if (body.newPassword !== undefined) {
    if (!body.currentPassword) {
      return NextResponse.json(
        { error: "Current password is required to set a new password." },
        { status: 400 }
      );
    }

    const passwordMatch = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 400 }
      );
    }

    if (body.newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    updateData.passwordHash = await bcrypt.hash(body.newPassword, 12);
  }

  // --- Gemini API key update ---
  if (body.geminiApiKey !== undefined) {
    // Empty string = clear the key. Non-empty = encrypt and store.
    updateData.geminiApiKey = body.geminiApiKey
      ? encrypt(body.geminiApiKey.trim())
      : "";
  }

  // Apply all updates in a single DB write.
  await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
  });

  return NextResponse.json({ message: "Settings saved successfully." });
}

/**
 * POST /api/settings/test-key
 *
 * Tests whether the provided Gemini API key is valid by making a minimal
 * API call. Used by the "Test Key" button on the Settings page.
 *
 * Request body: { apiKey: string }
 * Response: { valid: boolean, error?: string }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const body = await request.json() as { apiKey?: string };

  if (!body.apiKey?.trim()) {
    return NextResponse.json(
      { valid: false, error: "No API key provided." },
      { status: 400 }
    );
  }

  const result = await testGeminiApiKey(body.apiKey.trim());
  return NextResponse.json(result);
}

/**
 * GET /api/settings/gemini-key
 *
 * Returns the decrypted Gemini API key for the current user.
 * This endpoint is called exclusively by server-side API routes (like
 * /api/extract) that need the plaintext key to call Gemini.
 * It is NOT called from the client-side settings page.
 *
 * Response: { apiKey: string } — empty string if no key is set.
 */
export async function getDecryptedGeminiKey(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { geminiApiKey: true },
  });

  if (!user?.geminiApiKey) return "";
  return decrypt(user.geminiApiKey);
}
