import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/roles";

/**
 * Examint — NextAuth.js Configuration
 *
 * Authentication strategy: Credentials Provider (email + password).
 * - Passwords are stored as bcrypt hashes in `User.passwordHash`.
 * - Sessions are stored in HTTP-only signed cookies (JWT strategy).
 * - The session JWT contains the user's `id`, `name`, and `email` so that
 *   API routes can identify the logged-in teacher without an extra DB query.
 *
 * The `authOptions` object is exported so it can be consumed both by the
 * NextAuth route handler (`/api/auth/[...nextauth]/route.ts`) and by any
 * server component or API route that calls `getServerSession(authOptions)`.
 */
export const authOptions: NextAuthOptions = {
  /**
   * Credentials Provider
   * Accepts `email` and `password` form fields.
   * Returns a user object on success, or null on failure (NextAuth will
   * show an error to the user automatically).
   */
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: {
          label: "Email",
          type: "email",
          placeholder: "teacher@school.edu",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },

      /**
       * Validates the submitted credentials against the database.
       *
       * @param credentials - The raw form values submitted by the user.
       * @returns A user object `{ id, name, email }` on success, or `null`
       *          if the email is not found or the password doesn't match.
       */
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Look up the teacher by email.
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

        if (!user) {
          // Email not found. Return null — NextAuth will display "Invalid credentials".
          return null;
        }

        // Compare the submitted password against the stored bcrypt hash.
        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!passwordMatch) {
          return null;
        }

        // Return only safe fields (never expose passwordHash to the client).
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as Role,
        };
      },
    }),
  ],

  /**
   * Session strategy: "jwt"
   * The session is encoded as a signed JWT stored in a cookie.
   * No session table is needed in the database.
   */
  session: {
    strategy: "jwt",
    /**
     * Maximum session age in seconds.
     * 30 days: teachers rarely log out on a school machine, so a long
     * session avoids friction while still expiring eventually.
     */
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  /**
   * JWT callbacks
   * The `jwt` callback runs when the token is created or updated.
   * The `session` callback shapes what is exposed to the client via
   * `useSession()` / `getServerSession()`.
   */
  callbacks: {
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
  },

  /**
   * Custom pages
   * Overrides NextAuth's default sign-in page so teachers see the branded
   * Examint login page instead of the generic NextAuth UI.
   */
  pages: {
    signIn: "/login",
    error: "/login",
  },

  /**
   * Secret used to sign/verify JWT tokens.
   * Must match the NEXTAUTH_SECRET environment variable.
   */
  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * TypeScript module augmentation.
 * Extends the built-in NextAuth Session and JWT types to include the
 * `id` field on `session.user` and `token.id`, providing type safety
 * when accessing the user ID throughout the application.
 */
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
