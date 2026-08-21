import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Examint — Authentication Middleware
 *
 * Protects all application routes under the `(app)` route group and all
 * API routes (except the auth and upload-serve endpoints).
 *
 * How it works:
 * - `withAuth` from next-auth/middleware checks for a valid session token
 *   (the JWT cookie set at login).
 * - If the token is missing or expired, the user is redirected to `/login`.
 * - The `authorized` callback below returns `true` only when a valid token
 *   is present — any request without a token fails the check and triggers
 *   the redirect to `pages.signIn`.
 *
 * Routes NOT protected (matcher excludes these):
 *   /login         — the sign-in page itself
 *   /signup        — the registration page
 *   /api/auth/**   — NextAuth's own endpoints (session, CSRF, etc.)
 *   /_next/**      — Next.js static assets
 *   /favicon.ico   — browser icon
 */
export default withAuth(
  function middleware() {
    // The middleware function body runs only when `authorized` returns true.
    // We don't need to do anything extra here — simply passing through is fine.
    return NextResponse.next();
  },
  {
    callbacks: {
      /**
       * Returns true if the request has a valid NextAuth session token.
       * A missing or invalid token returns false → NextAuth redirects to
       * the page configured in `pages.signIn` (i.e. `/login`).
       *
       * @param token - The decoded JWT payload from the session cookie,
       *   or null if no session exists.
       */
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
);

/**
 * Route matcher configuration.
 * The middleware runs on every request EXCEPT those matching these patterns.
 *
 * Excluded:
 * - /login and /signup (auth pages must be publicly accessible)
 * - /api/auth/** (NextAuth's internal endpoints)
 * - Next.js internals (_next/static, _next/image) and favicon
 */
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - /login, /signup (public auth pages)
     * - /api/auth/... (NextAuth handler)
     * - /_next/... (Next.js internals)
     * - /favicon.ico
     */
    "/((?!login|signup|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
