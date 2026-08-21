import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client Singleton
 *
 * Why a singleton?
 * In Next.js development mode, hot module reloading (HMR) re-evaluates
 * module files on every save. Without a singleton, each HMR cycle would
 * create a new PrismaClient instance, eventually exhausting the SQLite
 * connection pool and printing "warn(prisma-client) There are already 10
 * instances of Prisma Client actively running" warnings.
 *
 * The pattern below stores the single instance on the Node.js `global` object
 * (which survives HMR cycles) in development, and creates a fresh instance in
 * production (where HMR does not apply).
 *
 * Usage in any server-side file:
 *   import { prisma } from "@/lib/prisma";
 *   const users = await prisma.user.findMany();
 */

// Extend the NodeJS global type to include our cached Prisma instance.
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Creates or reuses the global PrismaClient instance.
 * - In production: always creates a new instance (global is not reused).
 * - In development: reuses the cached global instance across HMR cycles.
 */
export const prisma: PrismaClient =
  global.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
