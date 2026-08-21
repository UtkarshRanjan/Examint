import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/auth/signup
 *
 * Creates a new teacher account.
 *
 * Request body (JSON):
 *   { name: string, email: string, password: string }
 *
 * Validations:
 *   - All three fields are required.
 *   - Email must be a valid format.
 *   - Password must be at least 8 characters.
 *   - Email must not already be registered.
 *
 * On success:
 *   201 { message: "Account created" }
 *
 * On failure:
 *   400 { error: "Validation message" }
 *   409 { error: "Email already registered" }
 *   500 { error: "Internal server error" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = body as {
      name?: string;
      email?: string;
      password?: string;
    };

    // --- Input validation ---
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    if (!email?.trim()) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    // Basic email format check.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // --- Duplicate email check ---
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "This email is already registered. Please log in instead." },
        { status: 409 }
      );
    }

    // --- Hash the password ---
    // bcrypt cost factor 12: strong security while staying under ~300ms on
    // a typical school server. Higher values add security but slow down logins.
    const passwordHash = await bcrypt.hash(password, 12);

    // --- Create the user ---
    await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
      },
    });

    return NextResponse.json(
      { message: "Account created successfully. You can now log in." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[/api/auth/signup] Error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
