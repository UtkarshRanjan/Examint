/**
 * Examint — Role Definitions & Page Access Control
 *
 * Single source of truth for the four account roles and which app pages
 * each one may see/reach. Every layer that needs to make an access
 * decision — the auth session, `middleware.ts`, `AppNav`, the `/users`
 * page guard, and the `/api/users` routes — imports from this file so
 * they can never drift out of sync with each other.
 *
 * Roles are stored as a plain string column on `User` (see
 * `prisma/schema.prisma`), not a native Prisma enum, because SQLite's
 * Prisma connector does not support enums.
 */

/** The four account roles Examint recognises. */
export type Role = "ADMINISTRATOR" | "DEVELOPER" | "TEACHER" | "MANAGEMENT";

/** All valid `Role` values, for validation and building role pickers. */
export const ROLES: Role[] = [
  "ADMINISTRATOR",
  "DEVELOPER",
  "TEACHER",
  "MANAGEMENT",
];

/** Human-readable display label for each role. */
export const ROLE_LABELS: Record<Role, string> = {
  ADMINISTRATOR: "Administrator",
  DEVELOPER: "Developer",
  TEACHER: "Teacher",
  MANAGEMENT: "Management",
};

/**
 * Path prefixes each role may access. `"/"` matches only the exact
 * dashboard route; every other prefix also matches its sub-routes (e.g.
 * `"/papers"` covers `/papers/abc123` and `/papers/abc123/preview`).
 *
 * - DEVELOPER: everything, plus the exclusive User Management page.
 * - ADMINISTRATOR / TEACHER: the full day-to-day feature set.
 * - MANAGEMENT: oversight only — no Upload or Content Bank, since
 *   management accounts don't create content.
 */
export const PAGE_ACCESS: Record<Role, string[]> = {
  DEVELOPER: ["/", "/upload", "/content", "/papers", "/settings", "/users"],
  ADMINISTRATOR: ["/", "/upload", "/content", "/papers", "/settings"],
  TEACHER: ["/", "/upload", "/content", "/papers", "/settings"],
  MANAGEMENT: ["/", "/papers", "/settings"],
};

/**
 * Returns true if `value` is one of the known `Role` strings.
 * Used to validate untrusted input (e.g. request bodies) before it's
 * cast to `Role`.
 */
export function isValidRole(value: string): value is Role {
  return (ROLES as string[]).includes(value);
}

/**
 * Returns true if `role` is allowed to access `pathname`.
 *
 * @param role - The account's current role.
 * @param pathname - The request path, e.g. `/papers/abc123`.
 */
export function canAccessPath(role: Role, pathname: string): boolean {
  const allowedPrefixes = PAGE_ACCESS[role];
  return allowedPrefixes.some((prefix) =>
    prefix === "/"
      ? pathname === "/"
      : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
