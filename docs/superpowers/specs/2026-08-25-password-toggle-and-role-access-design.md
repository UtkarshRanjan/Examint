# Password Visibility Toggle & Role-Based Page Access — Design

**Date:** 2026-08-25
**Status:** Approved

## Summary

Two enhancements to Examint's authentication system:

1. A password show/hide (eye icon) toggle on the Login and Signup forms.
2. A role system (`ADMINISTRATOR`, `DEVELOPER`, `TEACHER`, `MANAGEMENT`) that controls which app pages a signed-in user can see and reach, managed from a new Developer-only "User Management" page.

## 1. Password Visibility Toggle

### Component

New `src/components/ui/password-input.tsx`:

- Wraps the existing `Input` component (`src/components/ui/input.tsx`).
- Internal `showPassword` state toggles the rendered `type` between `"password"` and `"text"`.
- Renders an absolutely-positioned icon button inside the input's right padding area using `Eye` / `EyeOff` from `lucide-react` (already a dependency).
- Forwards `ref` and accepts the same props as `Input` (minus `type`, which it controls internally) so it's a drop-in replacement.
- The toggle button has `type="button"` (so it never submits the form) and an `aria-label` that changes with state ("Show password" / "Hide password").

### Usage

- `src/app/(auth)/login/page.tsx` — replace the password `Input` with `PasswordInput`.
- `src/app/(auth)/signup/page.tsx` — replace both the password and confirm-password `Input`s with `PasswordInput`.

No other behavior changes (validation, autoComplete attributes, etc. stay as-is).

## 2. Role-Based Page Access

### Roles

Four roles, stored as a plain string (not a native Prisma enum — SQLite's Prisma connector doesn't support enums; this follows the existing convention used by `ContentItem.type`):

- `ADMINISTRATOR`
- `DEVELOPER`
- `TEACHER` (default for all self-registered accounts)
- `MANAGEMENT`

### Data model change

`prisma/schema.prisma` — add to `User`:

```prisma
role String @default("TEACHER")
```

A new migration (`add_user_role`) applies this. All existing rows backfill to `"TEACHER"` automatically via the column default.

### Bootstrapping the first Developer

A reusable CLI script, `scripts/set-user-role.mjs`, takes an email and a role and updates that user's row via Prisma Client:

```
node scripts/set-user-role.mjs aakash8585raj@gmail.com DEVELOPER
```

This is run once after the migration to promote `aakash8585raj@gmail.com` to `DEVELOPER`. The script validates the role against the known set and errors clearly if the user isn't found or the role is invalid. It stays in the repo as a documented recovery tool (e.g. if the only Developer account is ever lost).

### Shared access map (single source of truth)

New `src/lib/roles.ts` exports:

- `type Role = "ADMINISTRATOR" | "DEVELOPER" | "TEACHER" | "MANAGEMENT"`
- `ROLES: Role[]` — all valid roles, for validation and the role-picker dropdown.
- `ROLE_LABELS: Record<Role, string>` — display labels ("Administrator", "Developer", "Teacher", "Management").
- `PAGE_ACCESS: Record<Role, string[]>` — path prefixes each role may access:

  | Role | Allowed paths |
  |------|----------------|
  | `DEVELOPER` | `/`, `/upload`, `/content`, `/papers`, `/settings`, `/users` |
  | `ADMINISTRATOR` | `/`, `/upload`, `/content`, `/papers`, `/settings` |
  | `TEACHER` | `/`, `/upload`, `/content`, `/papers`, `/settings` |
  | `MANAGEMENT` | `/`, `/papers`, `/settings` |

- `canAccessPath(role: Role, pathname: string): boolean` — used identically by middleware, page guards, and the nav bar so the three layers can never disagree.

### Signup (unchanged form, new default)

`/signup` keeps its current fields (name, email, password, confirm password) — no role picker. Every new account is created with the DB default role `TEACHER`. `POST /api/auth/signup` requires no code change for this, since the default is enforced at the schema level.

### Auth / session plumbing

`src/lib/auth.ts`:

- `authorize()` selects `role` from the DB and includes it in the object it returns.
- `jwt` callback:
  - On initial sign-in (`user` present): copies `user.role` onto `token.role`.
  - On every subsequent call (`user` absent, i.e. an existing session being read): re-fetches the current role from the DB by `token.id` and refreshes `token.role`. This is a single indexed SQLite lookup, so the cost is negligible, and it means role changes propagate to a user's session without requiring logout in most Node-rendered contexts (server components, API routes).
- `session` callback exposes `session.user.role`.
- TypeScript module augmentation extends `Session.user` and `JWT` with `role: Role`.

**Known limitation:** `middleware.ts` runs on the Edge runtime and decodes the JWT cookie directly (it does not invoke the `jwt` callback). So a role change is guaranteed to take effect the moment the affected user's session is next read in a Node context (e.g. the very next server-rendered page load, which happens on every navigation via `AppLayout`), but the redirect decision made by middleware *for that same in-flight request* may still use the previous role. In practice this means at most one page load of staleness after a role change, and a full sign-out/sign-in guarantees immediate consistency. This is an accepted trade-off given the app's scale (SQLite, small teams).

### Middleware enforcement

`src/middleware.ts` keeps using `withAuth` exactly as today for the authentication gate (missing/invalid token → redirect to `/login`, via the `authorized` callback — unchanged). The middleware function body (currently a no-op pass-through) is extended to:

1. Read the decoded token's `role` (available on `req.nextauth.token`).
2. Call `canAccessPath(role, pathname)`.
3. If disallowed, redirect to `/?unauthorized=1`.
4. Otherwise, `NextResponse.next()` as before.

The route matcher is unchanged (still excludes `/login`, `/signup`, `/api/auth/**`, static assets).

### Page-level guard (defense in depth)

- `src/app/(app)/layout.tsx` already fetches the session server-side; it now also passes `role` down (no redirect change needed here — middleware already blocks disallowed paths before the layout renders).
- The new `/users` page independently re-checks `session.user.role === "DEVELOPER"` and redirects to `/` if not, so it's never reachable even if middleware were ever bypassed or misconfigured.
- New API routes (`/api/users`, `/api/users/[id]`) perform the same server-side role check before touching the database — UI-level and middleware-level checks are not trusted alone for a mutating admin endpoint.

### Unauthorized redirect feedback

`src/app/(app)/page.tsx` (Dashboard, already a client component) reads the `unauthorized` search param on mount via `useSearchParams`, shows `toast.error("You don't have access to that page.")` once, and removes the param from the URL (via `router.replace`) so refreshing doesn't re-trigger the toast.

### Nav bar changes

`src/components/AppNav/index.tsx`:

- `NAV_ITEMS` gains a `User Management` entry (`/users`, Developer-only).
- The rendered list is filtered through `canAccessPath(user.role, item.href)` before mapping, so Management users no longer see Upload/Content Bank links, and only Developers see User Management.
- `AppNav`'s `user` prop type gains `role: Role`.

### User Management page

New `src/app/(app)/users/page.tsx` (server component):

- Redirects non-Developers to `/` (see above).
- Fetches all users (`id, name, email, role, createdAt`) via Prisma.
- Renders a client component, `UserRoleTable`, with one row per user: name, email, joined date, and a `Select` dropdown (existing `@radix-ui/react-select`-based `Select` component) bound to their role.
- Changing the dropdown calls `PATCH /api/users/[id]` with `{ role }`, shows a success/error toast, and optimistically updates the row (rolling back on failure).

### New API routes

- `GET /api/users` — Developer-only (403 otherwise). Returns `{ id, name, email, role, createdAt }[]`, never `passwordHash` or `geminiApiKey`.
- `PATCH /api/users/[id]` — Developer-only. Body `{ role }`, validated against `ROLES`. Rejects (400) if the target is the last remaining `DEVELOPER` and the new role is not `DEVELOPER`, to prevent locking everyone out of User Management. On success, updates the row and returns the safe fields.

### Out of scope for this change

- Real-time (sub-request) propagation of role changes into already-issued Edge JWTs — mitigated as described above, not solved outright.
- Per-action (button-level) permissions within a page — this feature only controls whole-page visibility/reachability, matching the request.
- Self-service role requests or an approval workflow — role changes are only ever made directly by a Developer via User Management.
