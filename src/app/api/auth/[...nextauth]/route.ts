import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * NextAuth.js Route Handler
 *
 * This catch-all route handles all NextAuth authentication endpoints:
 *   GET  /api/auth/signin        — shows the sign-in page (redirects to /login)
 *   POST /api/auth/signin/credentials — processes login form submission
 *   GET  /api/auth/signout       — signs out the user
 *   GET  /api/auth/session       — returns the current session JSON
 *   GET  /api/auth/csrf          — returns the CSRF token
 *   GET  /api/auth/providers     — returns enabled auth providers
 *
 * The `authOptions` configuration is imported from `lib/auth.ts` so it can
 * also be used in `getServerSession(authOptions)` calls throughout the app.
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
