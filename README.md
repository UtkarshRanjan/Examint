# Examint

**Snap. Select. Set the paper.**

Examint is an open-source web application for teachers. Upload photos of textbook pages, handouts, or existing question papers; use AI vision to extract structured content; build a personal content bank; compose customizable question papers with sections and drag-and-drop; and export polished DOCX files — all without recurring SaaS costs.

Each teacher uses their own free [Google AI Studio](https://aistudio.google.com/) Gemini API key, so usage quotas are isolated per account. The database is SQLite (a single file), so no separate database server is required for local or small deployments.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Usage Guide](#usage-guide)
- [Roles & User Management](#roles--user-management)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Backup & Data Persistence](#backup--data-persistence)
- [Security](#security)
- [Scripts](#scripts)
- [Troubleshooting](#troubleshooting)
- [Out of Scope](#out-of-scope)
- [Additional Documentation](#additional-documentation)

---

## Features

| Area | Capabilities |
|------|-------------|
| **Authentication** | Email + password signup/login via NextAuth.js; show/hide password toggle; bcrypt-hashed passwords; JWT sessions (30-day expiry) |
| **Roles & Access** | Four roles (Administrator, Developer, Teacher, Management) control which pages an account can reach; Developers manage roles from a dedicated User Management page |
| **AI Extraction** | Upload JPEG/PNG/WebP images; optional crop/zoom/rotate; Gemini Vision extracts questions, paragraphs, headings, diagrams, and photos |
| **Content Bank** | Paginated library with category filters, keyword search, inline editing, and delete |
| **Paper Editor** | Multi-section papers; drag-and-drop from content bank; marks per question; live totals; duplicate-content guard |
| **Header & Footer** | School name, subject, class, date, logo upload, numbering format, page numbers, signature line, custom footer text |
| **Preview** | Full-screen A4-style preview with inline text and marks editing |
| **Export** | Download question papers as `.docx` with embedded images, formatted headers, and footers |
| **Settings** | Update profile, change password, save encrypted Gemini API key with "Test Key" validation |

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| [Next.js 13](https://nextjs.org/) (App Router, TypeScript) | Full-stack React framework and API routes |
| [SQLite](https://www.sqlite.org/) + [Prisma 5](https://www.prisma.io/) | File-based database with type-safe ORM |
| [NextAuth.js 4](https://next-auth.js.org/) | Credentials-based authentication |
| [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/) | UI styling and accessible components |
| [Google Gemini 3.6 Flash](https://ai.google.dev/) | AI vision content extraction (per-teacher API key) |
| [sharp](https://sharp.pixelplumbing.com/) | Server-side image resize and dimension reading |
| [formidable](https://github.com/node-formidable/formidable) | Multipart file upload parsing |
| [react-easy-crop](https://github.com/ValeryBugakov/react-easy-crop) | Client-side image cropping |
| [@dnd-kit](https://dndkit.com/) | Drag-and-drop in the paper editor |
| [docx](https://docx.js.org/) | DOCX file generation |
| Node.js `crypto` (AES-256-GCM) | Gemini API key encryption at rest |

---

## Architecture

```
Browser
  ├── Dashboard              → /api/content + /api/papers
  ├── Upload & Extract       → /api/extract  → sharp → Gemini Vision API
  ├── Content Bank           → /api/content
  ├── Paper Editor           → /api/papers
  ├── Paper Preview          → /api/papers + /api/export
  └── Settings               → /api/settings

Next.js Server (App Router)
  ├── /api/auth/[...nextauth]   NextAuth session handler
  ├── /api/auth/signup          Teacher registration
  ├── /api/extract              Image upload + AI extraction
  ├── /api/content              ContentItem CRUD
  ├── /api/papers               QuestionPaper / Section / Question CRUD
  ├── /api/export               DOCX generation and download
  ├── /api/settings             Profile and Gemini key management
  └── /api/uploads/[...path]    Auth-gated local image serving

SQLite (prisma/dev.db)
  User → ContentItem[]
       → QuestionPaper[] → PaperSection[] → PaperQuestion[]

Local Filesystem
  uploads/<userId>/             Cropped images and logos (not in git)
```

### Key design decisions

- **Content snapshots:** When a content item is added to a paper, `snapshotText` and `snapshotImageUrl` are copied onto `PaperQuestion`. Editing the source item in the Content Bank does not alter finalized papers.
- **Per-teacher Gemini keys:** No shared API quota; each teacher stores their own encrypted key in Settings.
- **Auth-gated uploads:** Images are served through `/api/uploads/...` rather than `public/`, so direct URLs cannot bypass authentication.
- **Standalone Docker output:** `next.config.js` uses `output: "standalone"` for lean production containers.

---

## Project Structure

```
Examint/
├── prisma/
│   ├── schema.prisma           Database models
│   └── migrations/             Applied migration history
├── src/
│   ├── app/
│   │   ├── (auth)/             Login and signup pages
│   │   ├── (app)/              Authenticated app pages
│   │   │   ├── page.tsx        Dashboard
│   │   │   ├── upload/         Upload & extract flow
│   │   │   ├── content/        Content bank
│   │   │   ├── papers/         Papers list, editor, preview
│   │   │   └── settings/       Profile & Gemini key
│   │   └── api/                REST API route handlers
│   ├── components/             React UI components
│   ├── lib/                    Shared utilities (auth, prisma, gemini, docx, encrypt)
│   └── middleware.ts           NextAuth route protection
├── k8s/                        Kubernetes manifests (Deployment, Service, Ingress, PVC)
├── plan/                       Detailed design docs (implementation, database, security)
├── scripts/
│   └── demo-tunnel.mjs         Public demo via localtunnel
├── Dockerfile                  Multi-stage production image
├── docker-compose.yml          Local Docker deployment
├── docker-entrypoint.sh        Runs Prisma migrate deploy on container start
└── uploads/                    Runtime image storage (gitignored; created at runtime)
```

---

## Prerequisites

- **Node.js 20+** (matches the Docker base image)
- **npm** (comes with Node.js)
- **Windows note:** `sharp` uses native binaries. If `npm install` fails on Windows, install [Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) or use WSL2.
- A **Google AI Studio API key** for each teacher account ([get one free](https://aistudio.google.com/apikey))

---

## Local Development Setup

### 1. Clone and install

```powershell
git clone <repository-url>
cd Examint
npm install
```

### 2. Configure environment

Create **`.env`** (read by Prisma CLI):

```env
DATABASE_URL="file:./prisma/dev.db"
```

Create **`.env.local`** (read by Next.js at runtime):

```env
DATABASE_URL="file:./prisma/dev.db"
NEXTAUTH_SECRET="<generate-a-random-secret>"
NEXTAUTH_URL="http://localhost:3000"
```

Generate a secret (any one of these):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

> Never commit `.env` or `.env.local`. Each developer should use their own `NEXTAUTH_SECRET`.

### 3. Initialize the database

```powershell
npm run db:migrate
```

This applies migrations and creates `prisma/dev.db`.

### 4. Start the dev server

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, then go to **Settings** and add your Gemini API key.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite connection string, e.g. `file:./prisma/dev.db` (local) or `file:/data/app.db` (Docker) |
| `NEXTAUTH_SECRET` | Yes | Signs JWT sessions and derives the AES key for Gemini API key encryption |
| `NEXTAUTH_URL` | Yes | Canonical app URL for NextAuth redirects (must match how users access the app) |

Gemini API keys are **not** environment variables. Each teacher saves their key in Settings; it is encrypted with AES-256-GCM before storage.

See [`plan/SECURITY.md`](plan/SECURITY.md) for secret rotation, generation options, and failure modes.

---

## Database

Examint uses five Prisma models:

| Model | Purpose |
|-------|---------|
| `User` | Teacher accounts; encrypted `geminiApiKey` |
| `ContentItem` | Extracted content blocks in the Content Bank |
| `QuestionPaper` | Paper metadata, header/footer JSON, numbering format |
| `PaperSection` | Named sections within a paper |
| `PaperQuestion` | Questions with snapshot text/image and marks |

`User.role` is a plain string (`ADMINISTRATOR` | `DEVELOPER` | `TEACHER` | `MANAGEMENT`), defaulting to `TEACHER` for every self-registered account. See [`src/lib/roles.ts`](src/lib/roles.ts) for the full page-access matrix, and [Roles & User Management](#roles--user-management) below for how to promote an account.

### Common commands

| Command | Description |
|---------|-------------|
| `npm run db:migrate` | Create and apply a new migration after schema changes |
| `npm run db:push` | Push schema to DB without a migration file (prototyping only) |
| `npm run db:generate` | Regenerate the Prisma Client |
| `npm run db:studio` | Open Prisma Studio at [http://localhost:5555](http://localhost:5555) |

Full schema reference: [`plan/Database.md`](plan/Database.md)

---

## Usage Guide

### First-time setup

1. **Sign up** at `/signup` with name, email, and password (minimum 8 characters).
2. Open **Settings** and paste your [Google AI Studio](https://aistudio.google.com/apikey) Gemini API key.
3. Click **Test Key** to verify the key before extracting content.

### Typical workflow

```
Upload photo → Review AI extraction → Save to Content Bank
      ↓
Create paper → Add sections → Drag content into sections → Set marks
      ↓
Configure header/footer → Preview → Export DOCX
```

| Step | Page | What to do |
|------|------|------------|
| 1 | `/upload` | Drop or select an image (JPEG/PNG/WebP, max 10 MB). Optionally crop. Wait for Gemini extraction (~5–15 s). |
| 2 | Extract review | Edit block text, change categories, select blocks to save. |
| 3 | `/content` | Browse, search, filter, and edit saved content items. |
| 4 | `/papers` | Create a new paper or open an existing one. |
| 5 | `/papers/[id]` | Add sections, drag items from the sidebar, set marks, configure header/footer. |
| 6 | `/papers/[id]/preview` | Review the A4 layout; inline-edit text and marks. |
| 7 | Export | Download `.docx` from the editor or preview page. |

### Content types

Extracted and stored content is categorized as: `question`, `paragraph`, `heading`, `diagram`, `photo`, or `other`.

### Question numbering formats

Papers support: `1.` · `Q1.` · `(i)` · `a)`

---

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

```powershell
node scripts/set-user-role.mjs your-email@example.com DEVELOPER
```

Run this once after that account has signed up normally. From then on, that Developer can promote or demote any account from the User Management page.

---

## API Reference

All routes except `/login`, `/signup`, and `/api/auth/**` require an authenticated session (NextAuth JWT cookie).

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create a teacher account |
| * | `/api/auth/[...nextauth]` | NextAuth login, session, CSRF |
| POST | `/api/extract` | Upload image; returns Gemini-extracted blocks |
| GET | `/api/content` | List content items (paginated, filterable, searchable) |
| POST | `/api/content` | Save extracted blocks as content items |
| PATCH | `/api/content/[id]` | Update a content item |
| DELETE | `/api/content/[id]` | Delete a content item |
| GET | `/api/papers` | List papers with summary stats |
| POST | `/api/papers` | Create a new paper |
| GET | `/api/papers/[id]` | Get full paper with sections and questions |
| PATCH | `/api/papers/[id]` | Update paper, sections, or questions |
| DELETE | `/api/papers/[id]` | Delete a paper |
| GET | `/api/export?paperId=` | Download paper as DOCX |
| GET | `/api/settings` | Get profile (never returns raw API key) |
| PATCH | `/api/settings` | Update name, email, password, or Gemini key |
| POST | `/api/settings` | Test a Gemini API key |
| GET | `/api/users` | List all accounts with their role (Developer-only) |
| PATCH | `/api/users/[id]` | Change an account's role (Developer-only) |
| GET | `/api/uploads/[...path]` | Serve authenticated image files |

---

## Deployment

### Docker Compose (recommended for single-server)

```powershell
# Set the secret in your shell or a .env file next to docker-compose.yml
$env:NEXTAUTH_SECRET = "<your-production-secret>"

docker compose up --build -d
```

The app listens on port **3000**. Data persists in the `examint_data` Docker volume at `/data` (SQLite database + uploads).

### Docker image

The multi-stage `Dockerfile` builds a standalone Next.js server. On startup, `docker-entrypoint.sh`:

1. Symlinks `/data/uploads` → `/app/uploads`
2. Runs `prisma migrate deploy`
3. Starts `node server.js`

Build manually:

```powershell
docker build -t examint .
docker run -p 3000:3000 `
  -e NEXTAUTH_SECRET="<secret>" `
  -e NEXTAUTH_URL="http://localhost:3000" `
  -v examint_data:/data `
  examint
```

CI builds and pushes `vadar/examint:latest` to Docker Hub on pushes to `main` (see [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml)).

### Kubernetes

Manifests in `k8s/` define:

- **Deployment** — single replica with `Recreate` strategy (SQLite requires one writer)
- **PersistentVolumeClaim** — 5 Gi for `/data`
- **Service** — ClusterIP on port 80 → container 3000
- **Ingress** — TLS via cert-manager; 64 MB upload body limit

Apply to your cluster (adjust namespace, secrets, and host as needed):

```powershell
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

Create the `examint-secrets` Secret with `NEXTAUTH_SECRET` before deploying.

### Public demo tunnel

For temporary public access during demos:

```powershell
npm run demo:tunnel
# Optional: LT_SUBDOMAIN=my-demo npm run demo:tunnel
```

This builds the app, updates `NEXTAUTH_URL` in `.env.local` to the localtunnel URL, and starts both the production server and tunnel.

---

## Backup & Data Persistence

Two things live **outside git** and must be backed up:

| Asset | Local path | Docker/K8s path |
|-------|------------|-----------------|
| Database | `prisma/dev.db` | `/data/app.db` |
| Uploaded images | `uploads/` | `/data/uploads/` |

**Windows backup example:**

```powershell
Copy-Item prisma\dev.db D:\backup\examint-db-backup.db
Copy-Item uploads\ D:\backup\examint-uploads\ -Recurse
```

Schedule regular backups in production. Restoring both the database file and the uploads folder is required for a complete recovery.

---

## Security

| Data | Protection |
|------|------------|
| Passwords | bcrypt hash (cost factor 12); plain text never stored |
| Gemini API keys | AES-256-GCM encrypted using a key derived from `NEXTAUTH_SECRET` |
| Sessions | HMAC-SHA256 signed JWT cookies via NextAuth |
| Image uploads | Stored under `uploads/<userId>/`; served only through authenticated API route with path-traversal checks |

**Important:**

- Rotating `NEXTAUTH_SECRET` logs out all users and makes stored Gemini keys unreadable — teachers must re-enter their keys.
- Use a unique, cryptographically random secret per environment.
- Restrict OS-level read access to the SQLite file and uploads directory in production.

Full security guide: [`plan/SECURITY.md`](plan/SECURITY.md)

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js development server |
| `npm run build` | Production build |
| `npm run start` | Start production server (after build) |
| `npm run lint` | Run ESLint |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:push` | Push schema without migration file |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:generate` | Regenerate Prisma Client |
| `npm run demo:tunnel` | Build + run with localtunnel public URL |
| `node scripts/set-user-role.mjs <email> <ROLE>` | Directly set a user's role (bootstraps the first Developer) |

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| `[next-auth] Secret not set` | Missing `NEXTAUTH_SECRET` | Add it to `.env.local` and restart |
| `Invalid Gemini API key` | Wrong or expired key | Update key in Settings; click Test Key |
| `Gemini API quota exceeded` | Free tier limit (~15 req/min) | Wait and retry |
| `npm install` fails on `sharp` | Missing native build tools (Windows) | Install Visual C++ Build Tools or use WSL2/Docker |
| Extract returns empty blocks | Image has no readable content | Try a clearer photo or different crop |
| Login redirect loop | `NEXTAUTH_URL` mismatch | Set `NEXTAUTH_URL` to the exact URL in the browser |
| Stored Gemini key won't decrypt | `NEXTAUTH_SECRET` was changed | Re-enter the API key in Settings |
| Images 404 in UI | Missing uploads folder or wrong path | Ensure `uploads/<userId>/` exists and files were saved during extract |

---

## Out of Scope

The following are intentionally not implemented (see [`plan/IMPLEMENTATION_PLAN.md`](plan/IMPLEMENTATION_PLAN.md)):

- Real-time collaboration between teachers
- Mobile native app
- Shared question paper template library
- AI question *generation* (extraction only)
- Student-facing or grading features
- Sub-question marks breakdown (e.g. part a = 2, part b = 3)

---

## Additional Documentation

| Document | Contents |
|----------|----------|
| [`plan/IMPLEMENTATION_PLAN.md`](plan/IMPLEMENTATION_PLAN.md) | Full feature specification and phased build plan |
| [`plan/Database.md`](plan/Database.md) | Schema reference, Prisma Studio guide, migration workflow |
| [`plan/SECURITY.md`](plan/SECURITY.md) | Secrets management, encryption details, rotation policy |

---

## License

This project is marked `private` in `package.json`. Add a `LICENSE` file and update this section if you intend to open-source the repository.
