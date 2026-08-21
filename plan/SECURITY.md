# Examint — Security Reference

This document covers all security-sensitive configuration for the Examint application,
with a focus on `NEXTAUTH_SECRET` — the single most critical secret in the system.
Keep this document updated whenever secrets are rotated or new environment variables are added.

---

## Table of Contents

1. [Overview — What Makes Examint Sensitive](#1-overview)
2. [NEXTAUTH_SECRET — The Master Secret](#2-nextauth_secret)
   - Why it exists
   - What it protects
   - How it works internally
3. [Where It Lives](#3-where-it-lives)
4. [Generating a Fresh Secret](#4-generating-a-fresh-secret)
5. [Where to Update It](#5-where-to-update-it)
6. [Rotation Policy (When to Change It)](#6-rotation-policy)
7. [Other Environment Variables](#7-other-environment-variables)
8. [What Happens If the Secret Is Wrong or Missing](#8-what-happens-if-the-secret-is-wrong-or-missing)
9. [Quick-Start Checklist for a New Developer](#9-quick-start-checklist)

---

## 1. Overview

Examint stores two categories of sensitive data:

| Data | Sensitivity | Protection Method |
|------|-------------|-------------------|
| Teacher passwords | High | bcrypt hash (cost 12) — one-way, never stored in plain text |
| Teacher Gemini API keys | High | AES-256-GCM encryption — reversible with the correct secret |
| Session tokens (JWT) | High | HMAC-SHA256 signature — forged tokens rejected by NextAuth |
| Image uploads | Medium | Stored under `uploads/<userId>/` with auth-gated API route |
| SQLite database | Medium | Local file; restrict OS-level read access in production |

`NEXTAUTH_SECRET` is the root of trust for session tokens **and** API key encryption.
Everything else (bcrypt, upload isolation) is self-contained and does not depend on it.

---

## 2. NEXTAUTH_SECRET — The Master Secret

### Why It Exists

NextAuth.js requires a secret to perform cryptographic operations on session tokens.
Examint additionally derives an AES-256 encryption key from this secret to store each
teacher's personal Google Gemini API key safely in the database.

Without this secret, neither sessions nor stored API keys can be trusted.

### What It Protects

**A. Session tokens (login sessions)**

When a teacher logs in, NextAuth issues a signed JSON Web Token (JWT) stored in a
browser cookie. The `NEXTAUTH_SECRET` is used to sign the token with HMAC-SHA256.

- Any incoming request presents its cookie token.
- NextAuth verifies the signature using the secret.
- If the signature doesn't match (tampered or forged), the session is rejected.
- Result: a teacher cannot fake being another teacher or an admin.

**B. Gemini API key encryption**

Each teacher can save their Google Gemini API key in the Settings page.
Storing it in plain text in the database would be dangerous (database leak = all keys exposed).

Instead, Examint encrypts the key using AES-256-GCM:

```
Encryption key = SHA-256( NEXTAUTH_SECRET )    ← 32 bytes, derived once
Ciphertext     = AES-256-GCM( plainApiKey, encryptionKey, randomIV )
Stored in DB   = hex( IV ) + ":" + hex( authTag ) + ":" + hex( ciphertext )
```

- The encryption key is **never stored anywhere** — it is derived fresh on every
  encrypt/decrypt call from `NEXTAUTH_SECRET`.
- AES-256-GCM provides both confidentiality **and** authenticity (auth tag detects tampering).
- Each stored value uses a fresh random 12-byte IV, so identical API keys produce
  different ciphertexts in the database.

Implementation file: `src/lib/encrypt.ts`

### How It Works Internally

```
NEXTAUTH_SECRET (env var, string)
        │
        ▼
   SHA-256 hash  ──────────────────────────────────────────┐
        │                                                    │
        ▼                                                    ▼
  32-byte key                                         Used by NextAuth
        │                                             to sign/verify JWTs
        ▼
  AES-256-GCM cipher
        │
   ┌────┴────┐
   │ encrypt │ ← teacher's plain Gemini API key
   └────┬────┘
        │
  stored in DB as  iv:authTag:ciphertext  (all hex)
```

---

## 3. Where It Lives

The secret is read from environment variables at runtime. It must **never** be committed
to version control.

| File | Purpose | Committed to git? |
|------|---------|-------------------|
| `.env.local` | Local development secret | **No** — listed in `.gitignore` |
| `.env` | Prisma CLI needs `DATABASE_URL` only | **No** — listed in `.gitignore` |
| Hosting platform env vars | Production secret | **No** — set in dashboard |

`.gitignore` already excludes all `.env*` files. Double-check with:

```powershell
git check-ignore -v .env.local
```

---

## 4. Generating a Fresh Secret

The secret must be:
- At least 32 characters (64+ recommended)
- Cryptographically random (not a human-chosen password)
- Unique per environment (dev secret ≠ production secret)

### Option A — Node.js (cross-platform, no extra tools needed)

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Produces a 64-character lowercase hex string, e.g.:
```
a3f9c2e87b14d056f8a21c3e9d7b4f0e2a1c8d5f3e7b9a2c4d6f8e1b3a5c7d9
```

### Option B — PowerShell (Windows built-in)

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Produces a 44-character Base64 string, e.g.:
```
o/LC6H8U0FbYKj3e9mCQ4nPpR7sXwVzA1T5dBy2Ik6U=
```

### Option C — OpenSSL (if installed, e.g. via Git for Windows)

```bash
openssl rand -hex 32
```

### Option D — PowerShell one-liner (alternative)

```powershell
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

> **All four options are equally secure.** Choose whichever is most convenient.
> Options A and B require no extra software on a standard Windows machine.

---

## 5. Where to Update It

### Development (local machine)

Open `.env.local` in the project root and set:

```env
NEXTAUTH_SECRET="paste-your-generated-secret-here"
```

Then **restart the dev server** (`npm run dev`) for the new value to take effect.

### Production / Staging

Never put secrets in files that get deployed. Instead, set the environment variable
in your hosting platform's dashboard:

| Platform | Where to set |
|----------|-------------|
| Vercel | Project → Settings → Environment Variables |
| Railway | Project → Variables tab |
| Render | Service → Environment tab |
| Docker / VPS | Pass via `--env NEXTAUTH_SECRET=...` or a secrets manager |
| AWS / Azure | Use Secrets Manager / Key Vault; inject at runtime |

The variable name in all cases is exactly: `NEXTAUTH_SECRET`

---

## 6. Rotation Policy (When to Change It)

### ⚠️ Critical Warning

Changing `NEXTAUTH_SECRET` **invalidates all existing data that depends on it**:

| Impact | Detail |
|--------|--------|
| All active sessions are immediately invalidated | Every logged-in teacher is logged out |
| All stored Gemini API keys become unreadable | Teachers must re-enter their API keys in Settings |

This is by design (rotating a compromised secret locks out an attacker), but it is
disruptive. Plan rotations carefully.

### When to rotate

- **Immediately** if the secret is accidentally committed to git or exposed in logs
- **Immediately** if a team member with access to the secret leaves
- **Periodically** in production per your organisation's security policy (e.g. annually)
- **Before first production deploy** — replace the development placeholder with a
  production-only value that no developer has ever seen

### Rotation procedure

1. Generate a new secret (see Section 4).
2. **Notify teachers** that they will be logged out and must re-enter their Gemini key.
3. Update the secret in the hosting platform's environment variables.
4. Restart / redeploy the application.
5. Verify login works with the new secret.
6. Discard the old secret — it is no longer useful.

---

## 7. Other Environment Variables

| Variable | File | Purpose | Sensitive? |
|----------|------|---------|-----------|
| `NEXTAUTH_SECRET` | `.env.local` | Signs JWTs, derives AES key | **Yes — treat like a password** |
| `NEXTAUTH_URL` | `.env.local` | Canonical app URL for NextAuth redirects | No |
| `DATABASE_URL` | `.env` and `.env.local` | SQLite file path for Prisma | No (path only) |

**Gemini API keys** are not stored in environment variables. They are stored
per-teacher in the database, encrypted with `NEXTAUTH_SECRET`.

---

## 8. What Happens If the Secret Is Wrong or Missing

| Scenario | Symptom |
|----------|---------|
| `NEXTAUTH_SECRET` is missing from env | App crashes at startup with `[next-auth] Secret not set` |
| Secret changed after data was saved | Decrypting API keys throws `invalid auth tag` error; teacher settings page shows an error |
| Secret changed while users are logged in | All session cookies fail verification; every user is silently logged out on next request |
| Secret too short (< 32 chars) | NextAuth logs a warning; still works but less secure |
| Secret accidentally committed to git | Treat as compromised; rotate immediately per Section 6 |

---

## 9. Quick-Start Checklist for a New Developer

Follow these steps when setting up the project for the first time:

```
[ ] 1. Clone the repository
[ ] 2. Run: npm install
[ ] 3. Run: npx prisma migrate dev --name init
         (creates prisma/dev.db — do NOT commit this file)
[ ] 4. Generate a secret:
         node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
[ ] 5. Create .env.local in the project root with:
         DATABASE_URL="file:./prisma/dev.db"
         NEXTAUTH_SECRET="<your-generated-secret>"
         NEXTAUTH_URL="http://localhost:3000"
[ ] 6. Create .env in the project root with:
         DATABASE_URL="file:./prisma/dev.db"
         (Prisma CLI reads .env, not .env.local)
[ ] 7. Run: npm run dev
[ ] 8. Open http://localhost:3000 → Sign up → Settings → Add Gemini API key
[ ] 9. Verify the Gemini key can be tested and saved successfully
```

> Your `.env.local` secret is personal to your machine.
> Never share it with colleagues — each developer should generate their own.
> The only exception is a shared staging environment where all developers
> intentionally use the same secret.

---

*Last updated: 2026-08-20*
*Maintainer: see project README or Jira project for ownership*
