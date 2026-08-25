import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { canAccessPath, type Role } from "@/lib/roles";

/**
 * Examint — Authentication & Role-Based Access Middleware
 *
 * Protects all application routes under the `(app)` route group and all
 * API routes (except the auth and upload-serve endpoints), in two layers:
 *
 * 1. Authentication (via `withAuth`'s `authorized` callback): if no valid
 *    session token exists, redirect to `/login`. Unchanged from before.
 * 2. Role-based page access (in the `middleware` function body below,
 *    which only runs once `authorized` has already returned true): the
 *    signed-in user's role must be allowed to reach the requested path,
 *    per `canAccessPath()` in `src/lib/roles.ts`. If not, redirect to the
 *    Dashboard with `?unauthorized=1` so it can show a toast.
 *
 * The role read here comes directly from the signed JWT cookie (Edge
 * runtime can't query the database). A role change made in User
 * Management takes effect here as soon as the user's session is next
 * read in a Node context (see the `jwt` callback in `src/lib/auth.ts`),
 * which for a logged-in user happens on the very next page load — so at
 * most one request can see a briefly stale role after a change.
 *
 * Routes NOT protected (matcher excludes these):
 *   /login         — the sign-in page itself
 *   /signup        — the registration page
 *   /api/auth/**   — NextAuth's own endpoints (session, CSRF, etc.)
 *   /_next/**      — Next.js static assets
 *   /favicon.ico   — browser icon
 */
export default withAuth(
  function middleware(req) {
    const role: Role = (req.nextauth.token?.role as Role) ?? "TEACHER";
    const { pathname } = req.nextUrl;

    // API routes enforce their own authorization in route handlers; middleware
    // only applies the page-level access map to UI routes.
    if (pathname.startsWith("/api/")) {
      return NextResponse.next();
    }

    if (!canAccessPath(role, pathname)) {
      return NextResponse.redirect(new URL("/?unauthorized=1", req.url));
    }

    return NextResponse.next();
  },
  {
    // Required so Edge middleware can decode the session JWT. Without this,
    // login succeeds (Node API routes read .env at runtime) but protected
    // pages still redirect to /login because middleware sees no token.
    secret: process.env.NEXTAUTH_SECRET,
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
