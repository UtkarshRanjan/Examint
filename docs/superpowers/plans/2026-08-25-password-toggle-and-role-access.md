# Password Toggle & Role-Based Page Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a show/hide password toggle to Login and Signup, and a four-role (`ADMINISTRATOR` / `DEVELOPER` / `TEACHER` / `MANAGEMENT`) access-control system that gates which pages each signed-in user can see and reach, managed from a new Developer-only User Management page.

**Architecture:** A reusable `PasswordInput` wraps the existing `Input` with a `lucide-react` eye icon toggle. Roles are a plain string column on `User` (SQLite has no native enum support), with a single shared `src/lib/roles.ts` module defining the role list, display labels, and the page-access map — consumed identically by `middleware.ts` (route-level enforcement), `AppNav` (nav-link visibility), the `/users` page (defense-in-depth guard), and the new `/api/users` endpoints (server-side authorization). NextAuth's `authorize`/`jwt`/`session` callbacks carry the role from DB → JWT → session.

**Tech Stack:** Next.js 13 (App Router), NextAuth.js 4 (Credentials + JWT sessions), Prisma 5 + SQLite, Tailwind CSS, lucide-react icons, sonner toasts.

## Global Constraints

- No automated test framework exists in this repo (no Jest/Vitest, no `*.test.ts` files, no `test` script in `package.json`). Do not introduce one for this feature. Verify logic/type files with `npx tsc --noEmit` and verify integrated behavior manually via the dev server (browser clicks) and `curl`/PowerShell `Invoke-WebRequest` against API routes, matching how this codebase has always been verified.
- Roles are stored as a `String` column, never a Prisma `enum` — SQLite's Prisma connector does not support native enums (see `ContentItem.type`, which follows the same convention).
- Valid roles are exactly: `ADMINISTRATOR`, `DEVELOPER`, `TEACHER`, `MANAGEMENT`. New self-registered accounts always default to `TEACHER`.
- The shared access map lives in exactly one file, `src/lib/roles.ts` — middleware, nav, pages, and API routes must all import from it, never redefine it.
- Follow existing code conventions: JSDoc-style block comments above exported functions/components/routes (see any existing file in `src/lib` or `src/app/api` for the house style), `cn()` for class merging, `toast` from `sonner` for user feedback, native `<select>` elements for dropdowns (there is no Radix Select wrapper in this codebase — see `src/components/ContentCard/index.tsx` for the existing pattern), and PowerShell-compatible commands (`;` not `&&` to chain, since the target shell is Windows PowerShell).
- Never include a `Co-authored-by: Cursor <cursoragent@cursor.com>` trailer in any commit (project rule in `.cursor/rules/git-commit-conventions.mdc`).

## File Structure

| File | Action | Responsibility |
|------|--------|-----------------|
| `src/components/ui/password-input.tsx` | Create | Drop-in `Input` replacement with an eye-icon show/hide toggle |
| `src/app/(auth)/login/page.tsx` | Modify | Use `PasswordInput` for the password field |
| `src/app/(auth)/signup/page.tsx` | Modify | Use `PasswordInput` for password + confirm password |
| `prisma/schema.prisma` | Modify | Add `role String @default("TEACHER")` to `User` |
| `prisma/migrations/<timestamp>_add_user_role/migration.sql` | Generate | Migration adding the `role` column |
| `src/lib/roles.ts` | Create | `Role` type, `ROLES`, `ROLE_LABELS`, `PAGE_ACCESS`, `canAccessPath()` — single source of truth |
| `scripts/set-user-role.mjs` | Create | CLI to set any user's role directly (bootstraps the first Developer) |
| `src/lib/auth.ts` | Modify | Carry `role` through `authorize()` → `jwt()` → `session()`; module augmentation |
| `src/middleware.ts` | Modify | Enforce `canAccessPath()` for every request, redirect disallowed paths |
| `src/app/(app)/page.tsx` | Modify | Show a toast when redirected here via `?unauthorized=1` |
| `src/components/AppNav/index.tsx` | Modify | Filter nav links by role; add Developer-only "User Management" link |
| `src/app/api/users/route.ts` | Create | `GET` — list all users (Developer-only) |
| `src/app/api/users/[id]/route.ts` | Create | `PATCH` — change a user's role (Developer-only, last-Developer guard) |
| `src/components/UserRoleTable/index.tsx` | Create | Client table: lists users, role dropdown per row, calls the API |
| `src/app/(app)/users/page.tsx` | Create | Server page: Developer-only guard + renders `UserRoleTable` |
| `README.md` | Modify | Document roles, the new page, and the promotion script |

---

### Task 1: Password visibility toggle component

**Files:**
- Create: `src/components/ui/password-input.tsx`

**Interfaces:**
- Consumes: `Input` and `InputProps` from `src/components/ui/input.tsx`; `cn` from `src/lib/utils.ts`; `Eye`, `EyeOff` from `lucide-react`.
- Produces: `PasswordInput` (React `forwardRef` component) and `PasswordInputProps` type, for Tasks 2 and 3.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "@/components/ui/input";

/**
 * Password input props — identical to Input's, minus `type` (which this
 * component controls internally to toggle between hidden and visible text).
 */
export type PasswordInputProps = Omit<InputProps, "type">;

/**
 * Password field with a show/hide (eye icon) toggle.
 *
 * Renders as `type="password"` by default. Clicking the eye icon flips it
 * to `type="text"` so the user can proofread what they typed before
 * submitting — most useful on Login and Signup forms.
 *
 * Drop-in replacement for `Input` wherever a password is collected: same
 * props, same ref forwarding, just without a `type` prop to set.
 */
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);

    return (
      <div className="relative">
        <Input
          type={showPassword ? "text" : "password"}
          className={cn("pr-10", className)}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400 hover:text-zinc-600 focus-visible:outline-none focus-visible:text-zinc-600"
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `password-input.tsx`.

- [ ] **Step 3: Commit**

```powershell
git add src/components/ui/password-input.tsx
git commit -m "Add PasswordInput component with show/hide toggle"
```

---

### Task 2: Wire the toggle into the Login page

**Files:**
- Modify: `src/app/(auth)/login/page.tsx:1-19` (imports), `:118-131` (password field)

**Interfaces:**
- Consumes: `PasswordInput` from Task 1.

- [ ] **Step 1: Import `PasswordInput`**

In `src/app/(auth)/login/page.tsx`, add the import alongside the existing `Input` import:

```tsx
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
```

- [ ] **Step 2: Replace the password field**

Replace:

```tsx
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={isLoading}
              />
```

with:

```tsx
              <PasswordInput
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={isLoading}
              />
```

- [ ] **Step 3: Manually verify**

Run: `npm run dev`
Open `http://localhost:3000/login`, type a password, click the eye icon, and confirm the text becomes visible, then click again to re-hide it. Confirm signing in still works.

- [ ] **Step 4: Commit**

```powershell
git add "src/app/(auth)/login/page.tsx"
git commit -m "Use PasswordInput on the login form"
```

---

### Task 3: Wire the toggle into the Signup page

**Files:**
- Modify: `src/app/(auth)/signup/page.tsx:1-17` (imports), `:144-172` (password + confirm password fields)

**Interfaces:**
- Consumes: `PasswordInput` from Task 1.

- [ ] **Step 1: Import `PasswordInput`**

```tsx
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
```

- [ ] **Step 2: Replace both password fields**

Replace:

```tsx
            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                disabled={isLoading}
              />
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                disabled={isLoading}
              />
            </div>
```

with:

```tsx
            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                disabled={isLoading}
              />
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <PasswordInput
                id="confirmPassword"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                disabled={isLoading}
              />
            </div>
```

- [ ] **Step 3: Manually verify**

Open `http://localhost:3000/signup`, type into both password fields, toggle each eye icon independently, and confirm each toggles its own field only. Confirm signup still succeeds.

- [ ] **Step 4: Commit**

```powershell
git add "src/app/(auth)/signup/page.tsx"
git commit -m "Use PasswordInput on the signup form"
```

---

### Task 4: Add the `role` column to the database

**Files:**
- Modify: `prisma/schema.prisma:29-40` (the `User` model)
- Generate: `prisma/migrations/<timestamp>_add_user_role/migration.sql`

**Interfaces:**
- Produces: `User.role: string` (default `"TEACHER"`), consumed by Tasks 5–13 via the regenerated Prisma Client.

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, replace:

```prisma
model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  geminiApiKey String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  contentItems ContentItem[]
  papers       QuestionPaper[]
}
```

with:

```prisma
model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  geminiApiKey String?
  // One of: ADMINISTRATOR | DEVELOPER | TEACHER | MANAGEMENT.
  // Not a native Prisma enum — SQLite's connector doesn't support them
  // (same convention as ContentItem.type). Validated in application code
  // via `ROLES` in src/lib/roles.ts. All self-registered accounts default
  // to TEACHER; only a DEVELOPER can promote/demote via User Management.
  role         String   @default("TEACHER")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  contentItems ContentItem[]
  papers       QuestionPaper[]
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_user_role`
Expected: output ending in `Your database is now in sync with your schema.` and a new folder `prisma/migrations/<timestamp>_add_user_role/` containing a `migration.sql` with `ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'TEACHER';`. This also regenerates the Prisma Client, so `prisma.user.*` calls now know about `role`.

- [ ] **Step 3: Verify existing rows backfilled correctly**

Run: `npx prisma studio`
Open the `User` table in the browser UI it opens and confirm every existing row now shows `role = TEACHER`. Close Prisma Studio (Ctrl+C in the terminal) when done.

- [ ] **Step 4: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations
git commit -m "Add role column to User model"
```

---

### Task 5: Shared role definitions and access map

**Files:**
- Create: `src/lib/roles.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `type Role`, `ROLES: Role[]`, `ROLE_LABELS: Record<Role, string>`, `PAGE_ACCESS: Record<Role, string[]>`, `canAccessPath(role: Role, pathname: string): boolean`, `isValidRole(value: string): value is Role` — consumed by Tasks 6, 7, 8, 9, 10, 12, 13.

- [ ] **Step 1: Create the module**

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `roles.ts`.

- [ ] **Step 3: Commit**

```powershell
git add src/lib/roles.ts
git commit -m "Add shared role definitions and page access map"
```

---

### Task 6: Bootstrap script + promote the first Developer

**Files:**
- Create: `scripts/set-user-role.mjs`

**Interfaces:**
- Consumes: `@prisma/client` directly (not through `src/lib/prisma.ts`, since this is a standalone Node script, matching how `scripts/demo-tunnel.mjs` is also a standalone script).
- Produces: a documented recovery tool; no code-level interface (it's a CLI).

- [ ] **Step 1: Create the script**

```js
/**
 * Examint — Set User Role CLI
 *
 * One-off / recovery tool to set a user's role directly in the database,
 * bypassing the app. Needed to create the very first DEVELOPER account
 * (who can then use the in-app User Management page to manage everyone
 * else), and useful again if the last Developer account is ever lost.
 *
 * Usage:
 *   node scripts/set-user-role.mjs <email> <ROLE>
 *   node scripts/set-user-role.mjs aakash8585raj@gmail.com DEVELOPER
 *
 * <ROLE> must be one of: ADMINISTRATOR, DEVELOPER, TEACHER, MANAGEMENT
 * (case-insensitive).
 *
 * Reads DATABASE_URL from `.env` in the project root if it isn't already
 * set in the environment, so it works the same way `npm run db:migrate`
 * does without requiring a separate `dotenv` dependency.
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Loads KEY="value" pairs from `.env` into process.env if not already set. */
function loadEnvFile() {
  const envPath = join(__dirname, "..", ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] === undefined) {
      process.env[key] = rawValue.trim().replace(/^"(.*)"$/, "$1");
    }
  }
}

const VALID_ROLES = ["ADMINISTRATOR", "DEVELOPER", "TEACHER", "MANAGEMENT"];

async function main() {
  loadEnvFile();

  const [, , email, role] = process.argv;

  if (!email || !role) {
    console.error("Usage: node scripts/set-user-role.mjs <email> <ROLE>");
    console.error(`<ROLE> must be one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  const normalizedRole = role.toUpperCase();
  if (!VALID_ROLES.includes(normalizedRole)) {
    console.error(
      `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`
    );
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      console.error(`No user found with email "${normalizedEmail}".`);
      process.exit(1);
    }

    const updated = await prisma.user.update({
      where: { email: normalizedEmail },
      data: { role: normalizedRole },
    });

    console.log(`Updated ${updated.email} -> role "${updated.role}".`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Failed to update user role:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Run it to promote the specified account**

Run: `node scripts/set-user-role.mjs aakash8585raj@gmail.com DEVELOPER`

Expected: `Updated aakash8585raj@gmail.com -> role "DEVELOPER".`

If instead it prints `No user found with email "aakash8585raj@gmail.com".`, that account hasn't signed up in this database yet — sign up with that exact email at `/signup` first, then re-run the command.

- [ ] **Step 3: Verify in Prisma Studio**

Run: `npx prisma studio`
Confirm the `User` row for `aakash8585raj@gmail.com` shows `role = DEVELOPER`. Close Prisma Studio when done.

- [ ] **Step 4: Commit**

```powershell
git add scripts/set-user-role.mjs
git commit -m "Add set-user-role script and promote the first developer account"
```

---

### Task 7: Carry `role` through NextAuth (authorize → jwt → session)

**Files:**
- Modify: `src/lib/auth.ts:1-4` (imports), `:48-85` (`authorize`), `:110-140` (`jwt`/`session` callbacks), `:165-181` (module augmentation)

**Interfaces:**
- Consumes: `Role` from `src/lib/roles.ts` (Task 5).
- Produces: `session.user.role: Role` — consumed by Tasks 8 (middleware, via the raw JWT), 9 (Dashboard doesn't need it directly), 10 (`AppNav`), 12 (API routes), 13 (`/users` page).

- [ ] **Step 1: Import `Role`**

At the top of `src/lib/auth.ts`, add:

```ts
import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/roles";
```

- [ ] **Step 2: Select and return `role` in `authorize()`**

Replace:

```ts
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
          },
        });
```

with:

```ts
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            role: true,
          },
        });
```

Replace:

```ts
        // Return only safe fields (never expose passwordHash to the client).
        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
```

with:

```ts
        // Return only safe fields (never expose passwordHash to the client).
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as Role,
        };
```

- [ ] **Step 3: Replace the `jwt` and `session` callbacks**

Replace:

```ts
    /**
     * Persists the user's database `id` into the JWT so it is available
     * in the `session` callback and in API routes via `token.sub` or
     * the augmented `session.user.id`.
     *
     * @param token - The current JWT payload.
     * @param user  - The user object returned by `authorize()` (only present
     *               on the first sign-in, not on subsequent token refreshes).
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },

    /**
     * Exposes the user's `id` on the `session.user` object so that client
     * components and API routes can access it as `session.user.id`.
     *
     * @param session - The current session object.
     * @param token   - The JWT payload populated by the `jwt` callback above.
     */
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
```

with:

```ts
    /**
     * Persists the user's database `id` and `role` into the JWT.
     *
     * On first sign-in, `user` (from `authorize()`) is used directly. On
     * every later call — i.e. whenever a Node-side session is read via
     * `getServerSession` in a page, layout, or API route — `user` is
     * absent, so the current role is re-read from the database. This
     * means a role change made in User Management takes effect the next
     * time the affected user's session is read server-side, without
     * requiring them to log out.
     *
     * Note: `middleware.ts` runs on the Edge runtime and decodes this
     * JWT directly without invoking this callback, so its view of the
     * role can lag by up to one request after a change — an accepted
     * trade-off documented in the design spec.
     *
     * @param token - The current JWT payload.
     * @param user  - The user object returned by `authorize()` (only present
     *               on the first sign-in, not on subsequent token refreshes).
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        return token;
      }

      if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true },
          });
          if (dbUser) {
            token.role = dbUser.role as Role;
          }
        } catch {
          // Keep the previously known role if the DB lookup fails transiently.
        }
      }

      return token;
    },

    /**
     * Exposes the user's `id` and `role` on the `session.user` object so
     * that client components and API routes can access them directly.
     *
     * @param session - The current session object.
     * @param token   - The JWT payload populated by the `jwt` callback above.
     */
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as Role) ?? "TEACHER";
      }
      return session;
    },
```

- [ ] **Step 4: Update the module augmentation**

Replace:

```ts
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
```

with:

```ts
declare module "next-auth" {
  interface User {
    role: Role;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
  }
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `auth.ts`. (You should see this pass cleanly since `Role` is now defined and threaded through consistently.)

- [ ] **Step 6: Manually verify**

Run: `npm run dev`, sign in as `aakash8585raj@gmail.com` at `/login`. In the browser devtools Application/Storage tab, confirm a `next-auth.session-token` cookie exists (its content is opaque, so the real check is in Task 12–13 once `/users` exists — for now just confirm login still succeeds without errors).

- [ ] **Step 7: Commit**

```powershell
git add src/lib/auth.ts
git commit -m "Carry user role through NextAuth session and JWT"
```

---

### Task 8: Enforce role-based access in middleware

**Files:**
- Modify: `src/middleware.ts` (entire file)

**Interfaces:**
- Consumes: `canAccessPath`, `type Role` from `src/lib/roles.ts` (Task 5); `token.role` from the augmented JWT (Task 7).
- Produces: redirects to `/?unauthorized=1` for disallowed paths — consumed by Task 9 (Dashboard toast).

- [ ] **Step 1: Replace the file contents**

```ts
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
 * - /api/auth/... (NextAuth handler)
 * - /_next/... (Next.js internals)
 * - /favicon.ico
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `middleware.ts`.

- [ ] **Step 3: Manually verify (will fully confirm once Task 6's promotion has run)**

Run: `npm run dev`. Sign in as any `TEACHER` account and confirm `/`, `/upload`, `/content`, `/papers`, `/settings` all still load normally (unchanged behavior for teachers). Full role-blocking verification (e.g. a `MANAGEMENT` account being redirected away from `/upload`) happens in Task 14 once User Management (Task 13) exists to actually assign that role.

- [ ] **Step 4: Commit**

```powershell
git add src/middleware.ts
git commit -m "Enforce role-based page access in middleware"
```

---

### Task 9: Show a toast when redirected for lacking access

**Files:**
- Modify: `src/app/(app)/page.tsx:1-23` (imports/interfaces), `:52-86` (component body)

**Interfaces:**
- Consumes: the `?unauthorized=1` redirect target produced by Task 8's middleware.

- [ ] **Step 1: Add the `next/navigation` import**

Replace:

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
```

with:

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
```

- [ ] **Step 2: Read the query param and show the toast**

Replace:

```tsx
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
```

with:

```tsx
export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Shown when middleware redirects here because the signed-in user's role
  // doesn't have access to the page they tried to reach.
  useEffect(() => {
    if (searchParams?.get("unauthorized") === "1") {
      toast.error("You don't have access to that page.");
      router.replace("/");
    }
  }, [searchParams, router]);

  useEffect(() => {
    async function loadDashboard() {
```

- [ ] **Step 3: Manually verify**

With the dev server running, visit `http://localhost:3000/?unauthorized=1` directly while signed in. Confirm an error toast reading "You don't have access to that page." appears once, and the URL becomes `http://localhost:3000/` (no query param) shortly after.

- [ ] **Step 4: Commit**

```powershell
git add "src/app/(app)/page.tsx"
git commit -m "Show a toast when redirected for insufficient role access"
```

---

### Task 10: Filter the nav bar by role and add User Management

**Files:**
- Modify: `src/components/AppNav/index.tsx` (entire file)

**Interfaces:**
- Consumes: `canAccessPath`, `type Role` from `src/lib/roles.ts` (Task 5).
- Produces: nothing new consumed elsewhere (leaf UI component). `AppLayout` (`src/app/(app)/layout.tsx`) needs **no changes** — it already passes `session.user` straight through as the `user` prop, and `session.user` now includes `role` thanks to Task 7's module augmentation.

- [ ] **Step 1: Replace the file contents**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BookOpen,
  Upload,
  Library,
  FileText,
  Settings,
  Users,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { canAccessPath, type Role } from "@/lib/roles";

/**
 * Navigation item definition — used to build the top nav links.
 */
interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * All primary navigation links. The list actually rendered for a given
 * user is filtered down via `canAccessPath()` so each role only sees the
 * links their role can reach — kept in sync with `middleware.ts` and
 * `src/lib/roles.ts`'s `PAGE_ACCESS` map.
 */
const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: BookOpen },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/content", label: "Content Bank", icon: Library },
  { href: "/papers", label: "Papers", icon: FileText },
  { href: "/users", label: "User Management", icon: Users },
];

/**
 * AppNav — Top navigation bar for all authenticated pages.
 *
 * Features:
 * - Examint logo/wordmark on the left.
 * - Primary nav links in the centre, filtered by the user's role —
 *   active link is highlighted.
 * - Teacher name display on the right.
 * - Settings icon link and Sign Out button on the far right.
 *
 * This is a Client Component because it uses:
 * - `usePathname()` to highlight the active nav link.
 * - `signOut()` from next-auth/react for the sign-out button.
 *
 * The `user` prop is passed down from the server-side AppLayout so we
 * don't need an additional client-side session fetch.
 *
 * @param user - The authenticated user's session data (id, name, email, role).
 */
export default function AppNav({
  user,
}: {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    role: Role;
  };
}) {
  const pathname = usePathname();
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    canAccessPath(user.role, item.href)
  );

  /**
   * Determines if a nav link is currently active.
   * For the Dashboard ("/"), only exact match is active.
   * For other routes, checks if the pathname starts with the href.
   *
   * @param href - The navigation link's href.
   * @returns true if the link matches the current pathname.
   */
  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href) ?? false;
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-white shadow-sm">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex h-14 items-center justify-between gap-6">

          {/* Wordmark */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-xl font-bold tracking-tight text-zinc-900">
              Examint
            </span>
          </Link>

          {/* Primary navigation links */}
          <nav className="flex items-center gap-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:block">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right section: user info + settings + sign out */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Teacher display name */}
            {user.name && (
              <span className="hidden md:block text-sm text-zinc-500 max-w-[150px] truncate">
                {user.name}
              </span>
            )}

            {/* Settings link */}
            <Link href="/settings">
              <Button
                variant="ghost"
                size="icon"
                title="Settings"
                className={cn(
                  isActive("/settings") && "bg-zinc-100"
                )}
              >
                <Settings className="h-4 w-4" />
                <span className="sr-only">Settings</span>
              </Button>
            </Link>

            {/* Sign out button */}
            <Button
              variant="ghost"
              size="icon"
              title="Sign out"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `AppNav` or `layout.tsx`.

- [ ] **Step 3: Manually verify**

Sign in as the `TEACHER` account and confirm the nav bar is unchanged (Dashboard, Upload, Content Bank, Papers — no User Management link). Full per-role verification happens in Task 14.

- [ ] **Step 4: Commit**

```powershell
git add src/components/AppNav/index.tsx
git commit -m "Filter nav links by role and add User Management link"
```

---

### Task 11: `GET /api/users` and `PATCH /api/users/[id]`

**Files:**
- Create: `src/app/api/users/route.ts`
- Create: `src/app/api/users/[id]/route.ts`

**Interfaces:**
- Consumes: `ROLES`, `type Role` from `src/lib/roles.ts` (Task 5); `session.user.role` from Task 7.
- Produces: `GET /api/users` → `{ users: { id, name, email, role, createdAt }[] }`; `PATCH /api/users/[id]` (body `{ role }`) → `{ user: { id, name, email, role, createdAt } }` or `{ error: string }` — consumed by Task 12's `UserRoleTable`.

- [ ] **Step 1: Create the list endpoint**

`src/app/api/users/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/users
 *
 * Lists every registered account with its role, for the User Management
 * page. Developer-only — every other role (including Administrator)
 * receives 403, since only Developers may view or change roles.
 *
 * Response body: { users: { id, name, email, role, createdAt }[] }
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  if (session.user.role !== "DEVELOPER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ users });
}
```

- [ ] **Step 2: Create the role-update endpoint**

`src/app/api/users/[id]/route.ts`:

```ts
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
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `api/users`.

- [ ] **Step 4: Manually verify with curl**

With `npm run dev` running and signed in as the Developer account in your browser, copy the `next-auth.session-token` cookie value from devtools, then run (replace `<TOKEN>`):

```powershell
curl.exe -H "Cookie: next-auth.session-token=<TOKEN>" http://localhost:3000/api/users
```

Expected: a JSON body like `{"users":[{"id":"...","name":"...","email":"aakash8585raj@gmail.com","role":"DEVELOPER","createdAt":"..."}, ...]}`.

Then, without the cookie header, confirm it's blocked:

```powershell
curl.exe http://localhost:3000/api/users
```

Expected: `{"error":"Unauthorised"}` with a 401 status.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/users
git commit -m "Add GET and PATCH /api/users endpoints for role management"
```

---

### Task 12: User Management page + role table UI

**Files:**
- Create: `src/components/UserRoleTable/index.tsx`
- Create: `src/app/(app)/users/page.tsx`

**Interfaces:**
- Consumes: `ROLES`, `ROLE_LABELS`, `type Role` from `src/lib/roles.ts` (Task 5); `formatDate` from `src/lib/utils.ts`; `GET`/`PATCH /api/users` from Task 11.

- [ ] **Step 1: Create the client table component**

`src/components/UserRoleTable/index.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";
import { formatDate } from "@/lib/utils";

/** A single row as returned by GET /api/users. */
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

/**
 * UserRoleTable — Developer-only role management table.
 *
 * Fetches all users from `GET /api/users` on mount, then lets the
 * Developer change any row's role via a dropdown. Each change calls
 * `PATCH /api/users/[id]` and rolls the row back to its previous role if
 * the request fails (e.g. the last-Developer guard rejects it).
 *
 * @param currentUserId - The signed-in Developer's own user id, used only
 *   to show a "(you)" label next to their row.
 */
export default function UserRoleTable({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch("/api/users");
        if (!res.ok) throw new Error("Failed to load users.");
        const data = (await res.json()) as { users: UserRow[] };
        setUsers(data.users);
      } catch {
        toast.error("Failed to load users. Please refresh.");
      } finally {
        setIsLoading(false);
      }
    }
    loadUsers();
  }, []);

  /**
   * Sends a role change to the API, optimistically updating the row and
   * rolling back if the server rejects it.
   */
  async function handleRoleChange(userId: string, newRole: Role) {
    const previousUsers = users;
    setSavingId(userId);
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setUsers(previousUsers);
        toast.error(data.error ?? "Failed to update role.");
        return;
      }

      toast.success("Role updated.");
    } catch {
      setUsers(previousUsers);
      toast.error("Network error. Please try again.");
    } finally {
      setSavingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-zinc-50 text-left">
            <th className="px-4 py-2.5 font-medium text-zinc-600">Name</th>
            <th className="px-4 py-2.5 font-medium text-zinc-600">Email</th>
            <th className="px-4 py-2.5 font-medium text-zinc-600 hidden md:table-cell">
              Joined
            </th>
            <th className="px-4 py-2.5 font-medium text-zinc-600">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-zinc-50 transition-colors">
              <td className="px-4 py-3 font-medium text-zinc-900">
                {u.name}
                {u.id === currentUserId && (
                  <span className="text-zinc-400 font-normal"> (you)</span>
                )}
              </td>
              <td className="px-4 py-3 text-zinc-500">{u.email}</td>
              <td className="px-4 py-3 text-zinc-400 text-xs hidden md:table-cell">
                {formatDate(u.createdAt)}
              </td>
              <td className="px-4 py-3">
                <select
                  value={u.role}
                  disabled={savingId === u.id}
                  onChange={(e) =>
                    handleRoleChange(u.id, e.target.value as Role)
                  }
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create the page**

`src/app/(app)/users/page.tsx`:

```tsx
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import UserRoleTable from "@/components/UserRoleTable";

/**
 * User Management Page — /users
 *
 * Developer-only. Lists every registered account and lets a Developer
 * change any account's role, which controls that account's page access
 * (see `src/lib/roles.ts`).
 *
 * Enforced at three independent layers, none of which trust the others
 * alone: `middleware.ts` (route gating before this page even renders),
 * this server-side redirect (defense in depth), and the `/api/users`
 * routes themselves (never trust the client for a mutating admin action).
 */
export default async function UsersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "DEVELOPER") {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">User Management</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Control which pages each account can access based on their role.
        </p>
      </div>
      <UserRoleTable currentUserId={session.user.id} />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `UserRoleTable` or `app/(app)/users`.

- [ ] **Step 4: Manually verify**

With `npm run dev` running, sign in as the Developer account (`aakash8585raj@gmail.com`). Confirm:
- The nav bar now shows a "User Management" link.
- Visiting `/users` shows a table listing every account, with your own row labeled "(you)".
- Changing another account's role in the dropdown shows a "Role updated." toast, and the change persists after a page refresh.
- Attempting to change your own role away from Developer works normally (you're not the last Developer, since there's at least the original account plus any test accounts) — if you only have one Developer account total, confirm instead that the attempt shows the "Cannot remove the last remaining Developer account." error toast and the dropdown reverts.

- [ ] **Step 5: Commit**

```powershell
git add src/components/UserRoleTable "src/app/(app)/users"
git commit -m "Add Developer-only User Management page"
```

---

### Task 13: Full manual cross-role verification pass

**Files:** none (verification only).

**Interfaces:** exercises everything from Tasks 4–12 end-to-end.

- [ ] **Step 1: Create one test account per role**

With `npm run dev` running, sign up three throwaway accounts at `/signup` (all land as `TEACHER` by default): `qa-admin@example.com`, `qa-mgmt@example.com`, `qa-dev@example.com` (any password ≥ 8 characters).

- [ ] **Step 2: Promote them via User Management**

Sign in as `aakash8585raj@gmail.com` (Developer), go to `/users`, and set:
- `qa-admin@example.com` → Administrator
- `qa-mgmt@example.com` → Management
- `qa-dev@example.com` → Developer

- [ ] **Step 3: Verify Administrator access**

Sign out, sign in as `qa-admin@example.com`. Confirm the nav bar shows Dashboard, Upload, Content Bank, Papers (no User Management). Confirm visiting `/users` directly redirects to `/` with the "You don't have access to that page." toast.

- [ ] **Step 4: Verify Management access**

Sign out, sign in as `qa-mgmt@example.com`. Confirm the nav bar shows only Dashboard and Papers (no Upload, no Content Bank, no User Management — Settings remains reachable via the gear icon, which is not filtered by `NAV_ITEMS` but is still allowed per `PAGE_ACCESS`). Confirm visiting `/upload` directly redirects to `/` with the unauthorized toast. Confirm `/papers` and `/settings` load normally.

- [ ] **Step 5: Verify a second Developer**

Sign out, sign in as `qa-dev@example.com`. Confirm the nav bar shows all links including User Management, and `/users` loads and lists all accounts.

- [ ] **Step 6: Verify Teacher is unaffected**

Sign in as any plain `TEACHER` account (e.g. one from before this feature existed, or a fresh signup). Confirm all of Dashboard, Upload, Content Bank, Papers, Settings work exactly as before, and no User Management link appears.

- [ ] **Step 7: Clean up test accounts (optional)**

Run: `npx prisma studio`, delete the three `qa-*` test users if you don't want to keep them around. Close Prisma Studio when done.

- [ ] **Step 8: Full production build sanity check**

Run: `npm run build`
Expected: build completes with no type errors or failed page generations.

---

### Task 14: Documentation updates

**Files:**
- Modify: `README.md` (Features table, Database section, API Reference table, Scripts table, add a short "Roles & User Management" subsection)

- [ ] **Step 1: Update the Features table**

In the `## Features` table, replace the Authentication row:

```
| **Authentication** | Email + password signup/login via NextAuth.js; bcrypt-hashed passwords; JWT sessions (30-day expiry) |
```

with:

```
| **Authentication** | Email + password signup/login via NextAuth.js; show/hide password toggle; bcrypt-hashed passwords; JWT sessions (30-day expiry) |
| **Roles & Access** | Four roles (Administrator, Developer, Teacher, Management) control which pages an account can reach; Developers manage roles from a dedicated User Management page |
```

- [ ] **Step 2: Update the Database section**

In `## Database`, after the models table, add:

```markdown
`User.role` is a plain string (`ADMINISTRATOR` \| `DEVELOPER` \| `TEACHER` \| `MANAGEMENT`), defaulting to `TEACHER` for every self-registered account. See [`src/lib/roles.ts`](src/lib/roles.ts) for the full page-access matrix, and [Roles & User Management](#roles--user-management) below for how to promote an account.
```

- [ ] **Step 3: Update the API Reference table**

In `## API Reference`, add two rows after the `/api/settings` rows:

```
| GET | `/api/users` | List all accounts with their role (Developer-only) |
| PATCH | `/api/users/[id]` | Change an account's role (Developer-only) |
```

- [ ] **Step 4: Update the Scripts table**

In `## Scripts`, add a row:

```
| `node scripts/set-user-role.mjs <email> <ROLE>` | Directly set a user's role (bootstraps the first Developer) |
```

- [ ] **Step 5: Add a "Roles & User Management" section**

Insert a new `##` section after `## Usage Guide` (before `## API Reference`):

```markdown
## Roles & User Management

Every account has one of four roles, which controls which pages it can see and reach:

| Role | Access |
|------|--------|
| **Developer** | Everything, plus the exclusive `/users` User Management page |
| **Administrator** | Dashboard, Upload, Content Bank, Papers, Settings |
| **Teacher** | Dashboard, Upload, Content Bank, Papers, Settings (default for every signup) |
| **Management** | Dashboard, Papers, Settings only |

New accounts created at `/signup` always start as **Teacher**. Only a **Developer** can change anyone's role, from `/users` (linked in the nav bar for Developer accounts only).

### Bootstrapping the first Developer

Since there's no role picker on `/signup`, the very first Developer account must be set directly in the database:

\`\`\`powershell
node scripts/set-user-role.mjs your-email@example.com DEVELOPER
\`\`\`

Run this once after that account has signed up normally. From then on, that Developer can promote or demote any account from the User Management page.
```

- [ ] **Step 6: Commit**

```powershell
git add README.md
git commit -m "Document roles and User Management in the README"
```

## Self-Review Notes

- **Spec coverage:** Password toggle (Tasks 1–3) ✓; role column + migration (Task 4) ✓; shared access map (Task 5) ✓; bootstrap script + promotion (Task 6) ✓; session/JWT role plumbing (Task 7) ✓; middleware enforcement (Task 8) ✓; unauthorized toast (Task 9) ✓; nav filtering + User Management link (Task 10) ✓; `/api/users` GET+PATCH with last-Developer guard (Task 11) ✓; `/users` page + table (Task 12) ✓; cross-role verification (Task 13) ✓; docs (Task 14) ✓. All spec sections are covered.
- **Placeholder scan:** No TODOs/TBDs; every step has complete, runnable code.
- **Type consistency:** `Role`, `ROLES`, `ROLE_LABELS`, `PAGE_ACCESS`, `canAccessPath`, `isValidRole` are defined once in Task 5 and referenced identically (same names, same signatures) in Tasks 7, 8, 10, 11, 12. `session.user.role`, `token.role` are defined in Task 7 and consumed with the same shape in Tasks 8, 10, 11, 12.
