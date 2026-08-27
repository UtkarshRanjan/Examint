# =============================================================================
# Examint — multi-stage Docker build (Next.js 13 + Prisma/SQLite)
# =============================================================================

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# The "prepare" script wires up local git hooks (core.hooksPath) — meaningless
# inside a container build, and this stage has no .git directory for it to
# configure anyway, so drop just that one script before installing.
RUN npm pkg delete scripts.prepare
RUN npm ci

# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dummy DATABASE_URL so `prisma generate` (run via next build's postinstall-less
# flow here) and `next build` don't fail — no DB connection happens at build time.
ENV DATABASE_URL="file:./prisma/build.db"
RUN npx prisma generate
RUN npm run build

# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Set as a real image env var (not just exported by the entrypoint) so it's
# also visible to a `kubectl exec` session running scripts/ directly.
ENV DATABASE_URL=file:/data/app.db

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone server + static assets.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma CLI + schema/migrations so the entrypoint can run `migrate deploy`
# against the persistent volume at container start.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Recovery/admin CLI tools, run via `kubectl exec` against the live container
# (e.g. scripts/set-user-role.mjs to create the first DEVELOPER account).
COPY scripts ./scripts

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && \
    mkdir -p /data && chown -R nextjs:nodejs /data /app

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
