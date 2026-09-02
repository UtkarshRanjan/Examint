# Examint — Database Reference Guide

> **Database engine:** SQLite (single `.db` file, zero-install)
> **ORM:** Prisma 5.x
> **Schema file:** `prisma/schema.prisma`
> **Database file:** `prisma/prisma/dev.db`

---

## Table of Contents

1. [Database Overview](#1-database-overview)
2. [Environment Setup](#2-environment-setup)
3. [Schema Tables (Models)](#3-schema-tables-models)
   - [User](#31-user)
   - [ContentItem](#32-contentitem)
   - [QuestionPaper](#33-questionpaper)
   - [PaperSection](#34-papersection)
   - [PaperQuestion](#35-paperquestion)
4. [Entity Relationship Diagram](#4-entity-relationship-diagram)
5. [Inspecting Tables with Prisma Studio](#5-inspecting-tables-with-prisma-studio)
6. [Common Prisma CLI Commands](#6-common-prisma-cli-commands)
7. [Inspecting Tables via SQLite CLI](#7-inspecting-tables-via-sqlite-cli)
8. [Migration Workflow](#8-migration-workflow)
9. [Key Design Decisions](#9-key-design-decisions)
10. [Important Warnings](#10-important-warnings)
11. [Upgrading Prisma to a New Major Version](#11-upgrading-prisma-to-a-new-major-version)
12. [Common Errors and Fixes](#12-common-errors-and-fixes)

---

## 1. Database Overview

Examint uses **SQLite** as its database — a single file stored on disk that requires no separate server process. It is suitable for local development and small-to-medium single-server deployments.

**Prisma** acts as the ORM layer:
- It reads `prisma/schema.prisma` to understand the data models.
- It generates a type-safe `PrismaClient` (in `node_modules/@prisma/client`) used throughout the Next.js application.
- It manages database migrations via the `prisma/migrations/` folder.

---

## 2. Environment Setup

The database URL is read from the environment variable `DATABASE_URL`.

**File:** `.env` or `.env.local`

```env
DATABASE_URL="file:./prisma/dev.db"
```

> Prisma Studio and all CLI commands automatically pick up this variable. Never hard-code the database path in application code.

---

## 3. Schema Tables (Models)

### 3.1 User

**Purpose:** Represents a registered teacher account.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | String | PK, `cuid()` | Unique identifier auto-generated |
| `name` | String | Required | Teacher's display name |
| `email` | String | Required, Unique | Login email — must be unique across all accounts |
| `passwordHash` | String | Required | bcrypt-hashed password; plain text is never stored |
| `geminiApiKey` | String | Optional | AES-256-GCM encrypted Google AI Studio key |
| `role` | String | Default: `"TEACHER"` | Account role. One of: `ADMINISTRATOR`, `DEVELOPER`, `TEACHER`, `MANAGEMENT`. Stored as plain string (SQLite has no native enum). Validated in app code via `src/lib/roles.ts`. Only a `DEVELOPER` can promote/demote accounts. |
| `createdAt` | DateTime | Auto (`now()`) | Timestamp when the account was created |
| `updatedAt` | DateTime | Auto (`@updatedAt`) | Timestamp of the last update |

**Relations:**
- Has many `ContentItem` records (a teacher's content bank)
- Has many `QuestionPaper` records (a teacher's question papers)

**Cascade behavior:** Deleting a `User` cascades and deletes all their `ContentItem` and `QuestionPaper` records.

---

### 3.2 ContentItem

**Purpose:** A single extracted piece of content saved to the teacher's Content Bank. These are the building blocks that get assembled into question papers.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | String | PK, `cuid()` | Unique identifier |
| `userId` | String | FK → `User.id` | Owning teacher |
| `type` | String | Default: `"other"` | One of: `paragraph`, `question`, `photo`, `diagram`, `heading`, `other` |
| `textContent` | String | Optional | AI-extracted or teacher-edited text for this block |
| `imageUrl` | String | Optional | Path to the cropped/resized image inside `uploads/<userId>/`. Only set for `photo` and `diagram` types |
| `sourceImageUrl` | String | Optional | Path to the original uploaded photo this item was extracted from |
| `createdAt` | DateTime | Auto (`now()`) | Creation timestamp |
| `updatedAt` | DateTime | Auto (`@updatedAt`) | Last updated timestamp |

**Relations:**
- Belongs to one `User`
- Can be referenced by many `PaperQuestion` records

**Cascade behavior:** Deleting a `User` cascades and deletes all their `ContentItem` records. Deleting a `ContentItem` sets `PaperQuestion.contentItemId` to `null` (SetNull), preserving the snapshot data in the paper.

---

### 3.3 QuestionPaper

**Purpose:** A complete question paper created by a teacher.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | String | PK, `cuid()` | Unique identifier |
| `userId` | String | FK → `User.id` | Owning teacher |
| `title` | String | Required | Name/title of the question paper |
| `numberingFormat` | String | Default: `"1."` | Controls question numbering in DOCX output. Options: `"1."`, `"Q1."`, `"(i)"`, `"a)"` |
| `headerConfig` | String | Default: `"{}"` | JSON string. Shape: `{ schoolName, subject, class, date, logoUrl, instructions }` |
| `footerConfig` | String | Default: `"{}"` | JSON string. Shape: `{ showPageNumbers, signatureLine, customText }` |
| `createdAt` | DateTime | Auto (`now()`) | Creation timestamp |
| `updatedAt` | DateTime | Auto (`@updatedAt`) | Last updated timestamp |

> **Note:** `headerConfig` and `footerConfig` are stored as JSON strings because Prisma does not natively support JSON in SQLite. They are parsed/stringified in `lib/types.ts`.

**Relations:**
- Belongs to one `User`
- Has many `PaperSection` records

**Cascade behavior:** Deleting a `User` cascades and deletes all their `QuestionPaper` records.

---

### 3.4 PaperSection

**Purpose:** A named section within a question paper (e.g. "Section A — Attempt any 5").

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | String | PK, `cuid()` | Unique identifier |
| `paperId` | String | FK → `QuestionPaper.id` | Parent question paper |
| `title` | String | Required | Section heading (e.g. "Section A") |
| `instructions` | String | Optional | Instructions shown below the section title |
| `order` | Int | Default: `0` | Zero-indexed position within the paper; sections are sorted ascending when rendering |
| `createdAt` | DateTime | Auto (`now()`) | Creation timestamp |
| `updatedAt` | DateTime | Auto (`@updatedAt`) | Last updated timestamp |

**Relations:**
- Belongs to one `QuestionPaper`
- Has many `PaperQuestion` records

**Cascade behavior:** Deleting a `QuestionPaper` cascades and deletes all its `PaperSection` records.

---

### 3.5 PaperQuestion

**Purpose:** A single question/content block placed inside a `PaperSection`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | String | PK, `cuid()` | Unique identifier |
| `sectionId` | String | FK → `PaperSection.id` | Parent section |
| `contentItemId` | String | Optional FK → `ContentItem.id` | Reference back to the source content item (nullable) |
| `snapshotText` | String | Optional | **Frozen copy** of the text at the moment of adding to the paper |
| `snapshotImageUrl` | String | Optional | **Frozen copy** of the image URL at the moment of adding to the paper |
| `marks` | Int | Default: `0` | Marks awarded for this question; used for section and grand totals |
| `order` | Int | Default: `0` | Zero-indexed position within the section |
| `createdAt` | DateTime | Auto (`now()`) | Creation timestamp |
| `updatedAt` | DateTime | Auto (`@updatedAt`) | Last updated timestamp |

**Relations:**
- Belongs to one `PaperSection`
- Optionally references one `ContentItem`

**Cascade behavior:** Deleting a `PaperSection` cascades and deletes all its `PaperQuestion` records. Deleting the source `ContentItem` sets `contentItemId` to `null` but the snapshot columns are retained.

---

## 4. Entity Relationship Diagram

```
User
 ├── ContentItem[]          (userId → User.id, CASCADE DELETE)
 └── QuestionPaper[]        (userId → User.id, CASCADE DELETE)
       └── PaperSection[]   (paperId → QuestionPaper.id, CASCADE DELETE)
             └── PaperQuestion[]  (sectionId → PaperSection.id, CASCADE DELETE)
                   └── ContentItem?  (contentItemId → ContentItem.id, SET NULL)
```

**Reading the diagram:**
- `[]` means "one to many"
- `?` means the relation is optional (nullable FK)
- `CASCADE DELETE` — deleting the parent removes all children
- `SET NULL` — deleting the source `ContentItem` nullifies `PaperQuestion.contentItemId` but preserves the snapshot

---

## 5. Inspecting Tables with Prisma Studio

Prisma Studio is a browser-based visual GUI for your database. It requires no separate installation.

### Step 1 — Open a new terminal

Your Next.js dev server likely occupies an existing terminal. Open a **fresh** PowerShell terminal at the project root:

```
C:\Users\isutr\OneDrive - IRI\Documents\SourceCode\Examint
```

### Step 2 — Start Prisma Studio

Run the project script (already defined in `package.json`):

```powershell
npm run db:studio
```

You will see:

```
Prisma Studio is up on http://localhost:5555
```

### Step 3 — Open the browser

Navigate to **http://localhost:5555**

The left sidebar lists all 5 models:
- `User`
- `ContentItem`
- `QuestionPaper`
- `PaperSection`
- `PaperQuestion`

### Step 4 — Browse a table

Click any model name. A spreadsheet-style grid opens showing:
- All rows in the table
- One column per schema field
- Total row count in the top right
- Pagination controls at the bottom (100 rows per page by default)

### Step 5 — Filter rows

Click the **Filter** button at the top of the grid. Add one or more conditions:

| Example field | Operator | Example value |
|---|---|---|
| `email` | `contains` | `@gmail.com` |
| `type` | `equals` | `question` |
| `marks` | `gte` | `5` |
| `createdAt` | `lt` | `2025-01-01` |

Multiple filters are combined with AND logic.

### Step 6 — Sort rows

Click the **Sort** button. Select a field and direction:
- `createdAt` → Descending (most recent first)
- `order` → Ascending (for sections and questions)

### Step 7 — Navigate relations

Relation fields appear as clickable links (e.g. the `contentItems` cell on a `User` row). Clicking it:
- Jumps to the related table
- Pre-applies a filter to show only the related records

This lets you trace the full chain:
```
User → QuestionPaper → PaperSection → PaperQuestion
```

### Step 8 — Edit a record

1. Click any cell value in the grid
2. Type the new value
3. A green **Save N change(s)** button appears at the bottom of the screen
4. Click it to commit — changes are written directly to `dev.db`

> There is no undo. Be careful when editing production-like data.

### Step 9 — Add a new record

1. Click the **+ Add record** button at the top right of any table
2. A blank row appears at the top of the grid
3. Fill in the required fields
4. Click **Save** to persist

### Step 10 — Delete records

1. Tick the checkbox(es) on the left side of the rows you want to delete
2. A **Delete** button appears in the toolbar
3. Click it and confirm the deletion
4. Cascade rules in the schema are respected automatically

### Step 11 — Stop Prisma Studio

Press `Ctrl + C` in the terminal where `npm run db:studio` is running.

---

## 6. Common Prisma CLI Commands

All commands should be run from the project root.

| npm Script | Full Command | What it does |
|---|---|---|
| `npm run db:studio` | `prisma studio` | Launch browser-based table explorer |
| `npm run db:migrate` | `prisma migrate dev` | Create and apply a new migration after schema changes |
| `npm run db:push` | `prisma db push` | Push schema changes to the DB without a migration file (prototyping only) |
| `npm run db:generate` | `prisma generate` | Regenerate the Prisma Client after schema changes |
| _(no script)_ | `npx prisma migrate status` | Show which migrations have been applied |
| _(no script)_ | `npx prisma db pull` | Reverse-engineer the current DB back into `schema.prisma` |
| _(no script)_ | `npx prisma migrate reset` | **Drop and recreate the entire database** (destructive — dev only) |

---

## 7. Inspecting Tables via SQLite CLI

If you prefer raw SQL or Prisma Studio is unavailable, use the SQLite CLI directly.

### List all tables

```powershell
sqlite3 "prisma/prisma/dev.db" ".tables"
```

Expected output:
```
ContentItem         PaperQuestion       User
PaperSection        QuestionPaper       _prisma_migrations
```

### Describe a table's columns

```powershell
sqlite3 "prisma/prisma/dev.db" ".schema User"
```

### Run a SQL query

```powershell
sqlite3 "prisma/prisma/dev.db" "SELECT id, name, email FROM User;"
```

### Count rows in a table

```powershell
sqlite3 "prisma/prisma/dev.db" "SELECT COUNT(*) FROM ContentItem;"
```

### Check migration history

```powershell
sqlite3 "prisma/prisma/dev.db" "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at;"
```

---

## 8. Migration Workflow

Follow this sequence whenever you change `prisma/schema.prisma`:

```
1. Edit prisma/schema.prisma
        ↓
2. npm run db:migrate        ← creates migration SQL file + applies it to dev.db
        ↓
3. npm run db:generate       ← regenerates PrismaClient types
        ↓
4. Restart the dev server    ← picks up the new client
```

> **Never edit migration files manually.** Let Prisma generate them. Commit migration files to git so teammates can apply the same changes.

---

## 9. Key Design Decisions

### Content Snapshot in PaperQuestion

When a teacher adds a `ContentItem` to a paper, the text and image URL are **copied** into `snapshotText` and `snapshotImageUrl` at that exact moment.

**Why:** This freezes the paper against future edits. A teacher can freely edit or delete content in the Content Bank without silently altering any finalized question paper.

**Consequence:** If you inspect `PaperQuestion` rows, `snapshotText` may differ from the current `ContentItem.textContent` — this is intentional.

### JSON Stored as String

`QuestionPaper.headerConfig` and `QuestionPaper.footerConfig` are stored as `String` (TEXT in SQLite) containing serialized JSON.

**Why:** Prisma's SQLite adapter does not support a native `Json` column type. The application layer in `lib/types.ts` handles `JSON.parse()` and `JSON.stringify()`.

**Consequence:** In Prisma Studio these columns display as a raw JSON string, e.g. `{"schoolName":"Springfield High","subject":"Math"}`.

### Encrypted geminiApiKey

`User.geminiApiKey` is encrypted with AES-256-GCM using `NEXTAUTH_SECRET` before being stored.

**Why:** Each teacher provides their own Google AI Studio API key. Storing it encrypted ensures the raw key is never visible in the database.

**Consequence:** The value shown in Prisma Studio or SQLite is the encrypted ciphertext, not the original key. Do not attempt to edit this column directly via Prisma Studio.

---

## 10. Important Warnings

| Warning | Detail |
|---|---|
| Do not edit `geminiApiKey` in Studio | It is encrypted. Manual editing will corrupt decryption. |
| `prisma migrate reset` is destructive | It drops the entire database. Only use in development. |
| `db:push` skips migration files | Changes pushed with `db push` are not tracked and will be lost on a reset. Use `db:migrate` for persistent changes. |
| Backup `dev.db` before bulk deletes | SQLite has no recycle bin. Cascade deletes are permanent. |
| JSON columns need app-level parsing | Never write raw text into `headerConfig`/`footerConfig` unless it is valid JSON. |

---

## 11. Upgrading Prisma to a New Major Version

When running `npm run db:studio` or any Prisma CLI command, you may see an upgrade notice like:

```
┌─────────────────────────────────────────────────────────┐
│  Update available 5.22.0 -> 8.0.0-rc.12                 │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
```

**Do NOT just run the two install commands blindly.** A major version bump (e.g. 5.x → 8.x) can include breaking changes in the schema syntax, CLI commands, and client API. Follow this safe upgrade procedure:

### Step 1 — Read the migration guide

Before touching any code, read the official guide shown in the notice:
**https://pris.ly/d/major-version-upgrade**

Note down any breaking changes that affect:
- `schema.prisma` syntax
- CLI command names or flags
- `PrismaClient` API methods used in the codebase

### Step 2 — Check what the codebase uses

Search for all Prisma client usages to understand impact:

```powershell
# Find all files that import from @prisma/client or lib/prisma
Get-ChildItem -Path src -Recurse -Filter "*.ts" | Select-String "@prisma/client|lib/prisma"
```

### Step 3 — Upgrade in a separate git branch

```powershell
git checkout -b upgrade/prisma-v8
```

### Step 4 — Install the new versions

```powershell
npm i --save-dev prisma@latest
npm i @prisma/client@latest
```

### Step 5 — Regenerate the Prisma Client

```powershell
npx prisma generate
```

Fix any TypeScript errors that surface — these reveal places where the client API changed.

### Step 6 — Verify the database is still in sync

```powershell
npx prisma migrate status
```

All migrations should still show `Applied`. If there is drift, run `npx prisma migrate dev`.

### Step 7 — Run and test the app

```powershell
npm run dev
```

Test every feature that touches the database: login, content bank, paper creation, export.

### Step 8 — Merge the branch

Once all tests pass, merge the upgrade branch into `main`.

> **Note (Sep 2026):** The project is currently on Prisma **5.22.0**. Version **8.0.0-rc.12** is a release candidate — wait for a stable 8.x release before upgrading in production.

---

## 12. Common Errors and Fixes

This section records real errors encountered during development and their resolutions, as a quick reference for future debugging.

---

### Error 1 — `The column does not exist in the current database`

**Full error message (as seen in the dev server terminal):**

```
prisma:error
Invalid `prisma.user.findUnique()` invocation:

The column `main.User.role` does not exist in the current database.
```

**Symptom:** Every login attempt or page load that queries the `User` table crashes with a 500 error in the browser.

**Root cause — Schema drift (migration not applied):**

| What happened | State |
|---|---|
| A new field (`role`) was added to the `User` model in `schema.prisma` | Schema updated ✓ |
| `npx prisma generate` was run | PrismaClient regenerated ✓ |
| `npx prisma migrate dev` was **NOT** run | Database column missing ✗ |

The generated Prisma Client now includes `role` in every `SELECT` query, but the actual SQLite table has no `role` column — causing every query to fail.

**Fix:**

```powershell
npx prisma migrate dev
```

Prisma detects the unapplied migration (e.g. `20260825132454_add_user_role`) and applies it. The column is added to the database and all existing rows are backfilled with the default value (`TEACHER`).

**Verify the fix:**

```powershell
npx prisma migrate status
```

All entries should show `Applied`. The dev server will automatically recover — no restart needed.

**Prevention:** Always run `npx prisma migrate dev` immediately after editing `schema.prisma`. Never run `npx prisma generate` alone when the schema change adds or removes columns.

---

### Error 2 — `EPERM: operation not permitted, rename query_engine-windows.dll.node`

**Full error message (as seen after running `npx prisma migrate dev` on Windows):**

```
EPERM: operation not permitted, rename
'...\node_modules\.prisma\client\query_engine-windows.dll.node.tmp21704'
-> '...\node_modules\.prisma\client\query_engine-windows.dll.node'
```

**Symptom:** The message appears at the end of a `prisma migrate dev` or `prisma generate` run. The migration itself completes successfully (`exit_code: 0`), but the client regeneration step fails.

**Root cause — Windows file lock:**

When the Next.js dev server is running, it loads `query_engine-windows.dll.node` into memory. Windows locks any DLL that is actively loaded by a running process. When Prisma tries to replace the file during `prisma generate`, the OS blocks the rename with an `EPERM` (operation not permitted) error.

This does **not** happen on Linux or macOS, where the OS allows files to be replaced while a process holds an open reference to the old inode.

**Fix (3 steps):**

1. Stop the dev server — press `Ctrl+C` in the terminal running `npm run dev` to release the file lock.

2. Regenerate the Prisma Client cleanly:

```powershell
npx prisma generate
```

3. Restart the dev server:

```powershell
npm run dev
```

**Why this matters:** Until `prisma generate` completes successfully, the in-memory PrismaClient in the dev server may be out of sync with the latest schema. Always ensure the generate step finishes without errors before testing schema changes.

**Prevention:** Always stop the dev server before running `prisma migrate dev` or `prisma generate` on Windows.
