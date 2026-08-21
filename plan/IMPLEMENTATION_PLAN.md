# Examint — Implementation Plan

> **Tagline:** *Snap. Select. Set the paper.*
>
> Examint is a web application for teachers that lets them extract content from photos using AI vision, build a personal content bank, and compose customizable question papers with sections and drag-and-drop — exported as DOCX files. Fully open source, zero recurring cost, SQLite-based (no DB installation required).

---

## Tech Stack

| Technology | Purpose | License |
|---|---|---|
| **Next.js 14** (App Router, TypeScript) | Full-stack framework — React frontend + API routes | MIT |
| **SQLite via Prisma ORM** | Zero-install file-based database (`prisma/dev.db`) | Apache 2.0 |
| **NextAuth.js** | Email + password auth; credentials provider; session cookies | ISC |
| **bcryptjs** | Password hashing at rest | MIT |
| **Tailwind CSS + shadcn/ui** (Zinc theme) | UI components and styling | MIT |
| **sharp** | Server-side image resize before Gemini, and reading image dimensions for DOCX | Apache 2.0 |
| **formidable** | Multipart file upload parsing (Next.js App Router compatible) | MIT |
| **Google Gemini 1.5 Flash API** | AI Vision extraction — each teacher uses their own free API key | — |
| **react-easy-crop** | Client-side image crop/zoom/rotate before upload | MIT |
| **@dnd-kit/core** | Drag-and-drop in the paper editor | MIT |
| **docx** | DOCX file generation with embedded images | MIT |
| **Node.js crypto (AES-256-GCM)** | Gemini API key encryption at rest (uses `NEXTAUTH_SECRET`) | Built-in |

---

## Architecture Overview

```
Browser
  ├── Upload & Extract Page    → /api/extract  → sharp → Gemini Vision API
  ├── Content Bank Page        → /api/content  → SQLite (ContentItem)
  ├── Paper Editor Page        → /api/papers   → SQLite (QuestionPaper, PaperSection, PaperQuestion)
  ├── Paper Preview Page       → /api/papers   → inline edit + DOCX export
  ├── Settings Page            → /api/auth     → SQLite (User.geminiApiKey encrypted)
  └── Dashboard Page           → /api/content + /api/papers (stats)

Next.js Server
  ├── /api/extract             → formidable parse → sharp resize → Gemini → return JSON blocks
  ├── /api/content             → CRUD for ContentItem
  ├── /api/papers              → CRUD for QuestionPaper, PaperSection, PaperQuestion
  ├── /api/export              → DOCX builder (lib/docx-builder.ts) → download
  ├── /api/auth/[...nextauth]  → NextAuth handler
  └── /api/uploads/[...path]   → Auth-checked local image serving

SQLite (prisma/dev.db)
  ├── User
  ├── ContentItem
  ├── QuestionPaper
  ├── PaperSection
  └── PaperQuestion

Local Filesystem
  └── uploads/<userId>/        → Uploaded & cropped images (gitignored, must be backed up)
```

---

## Database Schema (Prisma)

```prisma
model User {
  id            String        @id @default(cuid())
  name          String
  email         String        @unique
  passwordHash  String
  geminiApiKey  String?       // AES-256-GCM encrypted using NEXTAUTH_SECRET
  createdAt     DateTime      @default(now())
  contentItems  ContentItem[]
  papers        QuestionPaper[]
}

model ContentItem {
  id             String    @id @default(cuid())
  userId         String
  user           User      @relation(fields: [userId], references: [id])
  type           String    // paragraph | question | photo | diagram | heading | other
  textContent    String?
  imageUrl       String?
  sourceImageUrl String?
  createdAt      DateTime  @default(now())
  paperQuestions PaperQuestion[]
}

model QuestionPaper {
  id               String         @id @default(cuid())
  userId           String
  user             User           @relation(fields: [userId], references: [id])
  title            String
  numberingFormat  String         @default("1.") // "1." | "Q1." | "(i)" | "a)"
  headerConfig     String         // JSON: { schoolName, subject, class, date, logoUrl, instructions }
  footerConfig     String         // JSON: { showPageNumbers, signatureLine, customText }
  createdAt        DateTime       @default(now())
  sections         PaperSection[]
}

model PaperSection {
  id           String          @id @default(cuid())
  paperId      String
  paper        QuestionPaper   @relation(fields: [paperId], references: [id], onDelete: Cascade)
  title        String
  instructions String?
  order        Int
  questions    PaperQuestion[]
}

model PaperQuestion {
  id                String       @id @default(cuid())
  sectionId         String
  section           PaperSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  contentItemId     String?
  contentItem       ContentItem? @relation(fields: [contentItemId], references: [id])
  snapshotText      String?      // Copied at time of adding — paper is frozen from source edits
  snapshotImageUrl  String?      // Copied at time of adding — paper is frozen from source edits
  marks             Int          @default(0)
  order             Int
}
```

> **Key design decision:** `PaperQuestion` stores `snapshotText` and `snapshotImageUrl` — a copy of the content at the time it is added to the paper. Editing a `ContentItem` later does NOT silently alter finalized papers.

---

## Project Folder Structure

```
src/
  app/
    (auth)/
      login/          page.tsx       ← Login page
      signup/         page.tsx       ← Signup page
    (app)/
      page.tsx                       ← Dashboard
      settings/       page.tsx       ← Gemini API key + profile
      upload/         page.tsx       ← Upload & extract flow
      content/        page.tsx       ← Content bank
      papers/
        page.tsx                     ← Papers list
        [id]/
          page.tsx                   ← Paper editor
          preview/    page.tsx       ← Full-screen A4 preview
    api/
      auth/[...nextauth]/route.ts    ← NextAuth handler
      extract/        route.ts       ← formidable + sharp + Gemini
      content/        route.ts       ← ContentItem CRUD
      papers/         route.ts       ← QuestionPaper/Section/Question CRUD
      export/         route.ts       ← DOCX generation + download
      uploads/[...path]/route.ts     ← Auth-checked image serving
  components/
    ImageCropEditor/                 ← react-easy-crop modal; crop/zoom/rotate → Blob
    ContentCard/                     ← Card with category chip, inline edit, delete
    PaperCanvas/                     ← Right panel: sections + questions + marks total
    PaperSection/                    ← Section block with DnD, marks, per-question controls
    ExtractReview/                   ← Side-by-side: cropped photo | extracted blocks
    HeaderFooterEditor/              ← Slide-out drawer for paper header/footer config
    PaperPreview/                    ← A4 page renderer (header, sections, questions, footer)
  lib/
    prisma.ts                        ← PrismaClient singleton
    auth.ts                          ← NextAuth config (credentials provider + bcrypt)
    encrypt.ts                       ← AES-256-GCM encrypt/decrypt for Gemini API key
    gemini.ts                        ← Gemini Vision API wrapper
    docx-builder.ts                  ← DOCX generation logic
prisma/
  schema.prisma
uploads/                             ← Gitignored; server image storage; MUST be backed up
```

---

## Implementation Phases

### Phase 1 — Project Scaffold & Dependencies
- Initialize Next.js 14 (App Router, TypeScript, Tailwind CSS)
- Configure shadcn/ui with Zinc theme
- Install all required packages:
  - `prisma`, `@prisma/client`
  - `next-auth`, `bcryptjs`, `@types/bcryptjs`
  - `sharp`, `@types/sharp`
  - `formidable`, `@types/formidable`
  - `react-easy-crop`
  - `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
  - `docx`
- Create `.env.local` with required variables:
  ```
  DATABASE_URL="file:./prisma/dev.db"
  NEXTAUTH_SECRET="<generate a strong secret>"
  NEXTAUTH_URL="http://localhost:3000"
  ```
- Create full folder structure as defined above

---

### Phase 2 — Database Schema & Prisma Setup
- Write `prisma/schema.prisma` with all 5 models (User, ContentItem, QuestionPaper, PaperSection, PaperQuestion)
- Run `npx prisma migrate dev --name init` to generate `prisma/dev.db`
- Create `src/lib/prisma.ts` — PrismaClient singleton (prevents connection exhaustion in development hot-reload)

---

### Phase 3 — Core Utility Libraries
- `src/lib/auth.ts` — NextAuth config: credentials provider, bcrypt password comparison, session callbacks
- `src/lib/encrypt.ts` — AES-256-GCM encrypt/decrypt using Node.js built-in `crypto`; uses `NEXTAUTH_SECRET` as key
- `src/lib/gemini.ts` — Gemini Vision API wrapper: accepts base64 image + prompt, returns structured JSON array `[{ type, text }]`
- `src/lib/docx-builder.ts` — DOCX generation: header table (logo + school details), sections, numbered questions, embedded image runs, footer with page numbers and signature line

---

### Phase 4 — Authentication
- `/api/auth/[...nextauth]/route.ts` — NextAuth handler (GET + POST)
- `/app/(auth)/login/page.tsx` — Login form with app name and tagline: *"Examint — Snap. Select. Set the paper."*
- `/app/(auth)/signup/page.tsx` — Signup form (name, email, password)
- `middleware.ts` — Auth guard: redirects unauthenticated users to `/login` for all `(app)/*` and `api/*` routes

---

### Phase 5 — Teacher Settings Page
- `/app/(app)/settings/page.tsx`:
  - Change name, email, password (with current-password confirmation)
  - Enter and save Gemini API key (encrypted before storing in DB)
  - **"Test Key" button** — makes a minimal Gemini call to verify the key is valid before first use
  - Success/error feedback on all actions

---

### Phase 6 — Upload & Extract
- `src/components/ImageCropEditor/` — react-easy-crop modal:
  - Drag crop rectangle, zoom slider, optional rotation control
  - "Confirm Crop" → Canvas API renders cropped Blob in memory
  - "Skip" button bypasses crop and uses original image
  - For multiple images, each is cropped in sequence before proceeding
- `/app/(app)/upload/page.tsx`:
  - Drag-and-drop zone or click-to-upload (accepts JPEG, PNG, WebP; max 10 MB)
  - Triggers ImageCropEditor for each selected image
  - Uploads cropped Blob via FormData to `/api/extract`
  - Shows loading spinner (Gemini typically takes 5–15 seconds)
  - On failure: clear error message + Retry button
  - Side-by-side review: cropped photo (left) | extracted blocks (right)
- `src/components/ExtractReview/`:
  - Per block: change category dropdown, edit text, checkbox to include/exclude
  - "Save Selected" → POST to `/api/content` → stores chosen blocks as `ContentItem` rows
- `/api/extract/route.ts`:
  - `formidable` parses multipart POST
  - `sharp` resizes to max 1200px width
  - Writes file to `./uploads/<userId>/` with UUID filename
  - Sends base64 image + structured prompt to Gemini
  - Returns JSON array of blocks
  - Accepts only `image/jpeg`, `image/png`, `image/webp`; rejects files > 10 MB
- `/api/uploads/[...path]/route.ts` — serves images from `uploads/` with session auth check

---

### Phase 7 — Content Bank
- `/api/content/route.ts`:
  - `GET` — paginated (20/page), filterable by `type`, searchable by `textContent` keyword
  - `POST` — create new ContentItem
  - `PATCH /api/content/[id]` — update text or category
  - `DELETE /api/content/[id]` — delete item
- `/app/(app)/content/page.tsx`:
  - Paginated grid/list (20 items per page)
  - Category filter chips (All, Paragraph, Question, Photo, Diagram, Heading, Other) — color-coded
  - Full-text keyword search input
  - Pagination controls
- `src/components/ContentCard/`:
  - Displays content type chip, text preview or image thumbnail
  - Inline edit: click to edit text or change category
  - Delete button with confirmation

---

### Phase 8 — Paper Editor
- `/api/papers/route.ts` — CRUD for `QuestionPaper`, `PaperSection`, `PaperQuestion`
- `/app/(app)/papers/page.tsx` — Papers list table:
  - Columns: Title, Subject, Date, Sections count, Total Marks
  - Actions: Edit, Duplicate, Delete
- `/app/(app)/papers/[id]/page.tsx` — Two-panel editor:
  - **Left panel:** Searchable, paginated Content Bank sidebar (drag items or click "+" per section)
  - **Right panel (PaperCanvas):** Paper organized into sections
  - **"Add Section"** button — inserts a named block (e.g. "Section A — Attempt any 5")
  - **Duplicate guard:** If same ContentItem already exists anywhere in the canvas, show warning toast and do not add again
  - **Per-question controls:** marks input, drag handle to reorder within section, remove button, inline text override
  - **Live marks total:** Marks per section + grand total shown in sticky header
  - **"Configure Header/Footer"** → opens `HeaderFooterEditor` drawer
  - **"Preview Draft"** → navigates to `/papers/[id]/preview`
  - **"Export DOCX"** → triggers `/api/export`
- `src/components/PaperCanvas/` — Right panel container with sections and live marks total
- `src/components/PaperSection/` — Individual section block:
  - Section title and instructions (editable inline)
  - Questions list with drag handles (`@dnd-kit/sortable`)
  - Section marks subtotal
- **Drag-and-drop via `@dnd-kit`:**
  - `DndContext` wraps the editor
  - Sidebar items are draggable into section droppable zones
  - Within-section reorder via `useSortable`

---

### Phase 9 — Header/Footer Config
- `src/components/HeaderFooterEditor/` — Slide-out drawer with fields:
  - School name, Subject, Class/Grade, Exam date
  - Logo upload (stored in `uploads/<userId>/`)
  - Question numbering format: `1.` / `Q1.` / `(i)` / `a)`
  - Page number toggle
  - Signature line label
  - Custom footer text
- Changes auto-saved to `QuestionPaper.headerConfig` and `footerConfig` JSON fields

---

### Phase 10 — Paper Preview Page
- `/app/(app)/papers/[id]/preview/page.tsx` — Full-screen A4-style preview:
  - White A4 pages with drop shadow on gray background (like a PDF viewer)
  - Sticky top bar with: **"← Back to Editor"** button | **"Export DOCX"** button
  - Renders: header (school name, subject, class, date, logo), sections with titles and instructions, numbered questions with marks, embedded images, footer (page numbers, signature line, custom text)
  - **Inline editing (text changes):**
    - Click any question text → inline text field appears
    - Click marks value → inline number input
    - Auto-saves to DB on blur (PATCH to `/api/papers`)
  - **Structural changes** (reorder, add/remove, change sections): user clicks "Back to Editor" to return to `/papers/[id]`
- `src/components/PaperPreview/` — A4 page renderer component

---

### Phase 11 — DOCX Export
- `/api/export/route.ts`:
  - Reads `QuestionPaper` with all sections and questions from DB
  - Calls `lib/docx-builder.ts` to generate DOCX buffer
  - Streams `.docx` file as download response
- `src/lib/docx-builder.ts`:
  - **Header:** Styled table — logo (ImageRun) on left, school name + subject + class + date on right
  - **Sections:** Bold section title + instructions paragraph
  - **Questions:** Numbered `Paragraph` nodes (using chosen numbering format) with marks on the right
  - **Photo/Diagram questions:** `sharp` reads pixel dimensions → `ImageRun` embeds image as binary buffer
  - **Footer:** Page number field (if enabled), signature line, custom text

---

### Phase 12 — Dashboard
- `/app/(app)/page.tsx`:
  - Stats cards: Total Content Items, Total Papers
  - Quick action links: Upload New Content, Open Content Bank, Create New Paper, View All Papers
  - Recent Papers list (last 5 papers with edit links)

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| `snapshotText` / `snapshotImageUrl` on `PaperQuestion` | Paper is frozen from future edits to source ContentItem — finalized papers stay stable |
| Per-teacher Gemini API key | No shared quota risk; each teacher has their own free Google AI Studio key |
| `formidable` over `multer` | `multer` is Express-only and incompatible with Next.js App Router |
| AES-256-GCM (built-in `crypto`) | No extra package needed; uses `NEXTAUTH_SECRET` as encryption key |
| SQLite for school-scale | No installation, no DB server, single file backup — perfectly handles 10–20 concurrent teachers |

---

## Environment Variables

```env
DATABASE_URL="file:./prisma/dev.db"
NEXTAUTH_SECRET="<generate with: openssl rand -base64 32>"
NEXTAUTH_URL="http://localhost:3000"
```

---

## Backup Guide (Important)

Two things must be backed up — everything else is in git:

1. `prisma/dev.db` — the entire database
2. `uploads/` — all uploaded and cropped images

Simple backup command (Windows):
```powershell
Copy-Item prisma\dev.db D:\backup\examint-db-backup.db
Copy-Item uploads\ D:\backup\examint-uploads\ -Recurse
```

---

## Known Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Gemini free-tier quota (15 req/min per key) | Each teacher uses their own key — no shared quota |
| SQLite concurrent writes | Serialized writes; non-issue for ≤100 concurrent users |
| `uploads/` data loss | Deployment README documents daily backup script |
| `sharp` native binaries on Windows | Requires Visual C++ Build Tools — documented in setup guide |

---

## What Is NOT in Scope

- Real-time collaboration between teachers
- Mobile app
- Question paper templates library
- Automatic question generation by AI (extraction only, not generation)
- Grading or student-facing features
- Sub-question marks breakdown (e.g. part a = 2 marks, part b = 3 marks) — can be added later
