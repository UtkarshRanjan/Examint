import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AppNav from "@/components/AppNav";

/**
 * App Layout — wraps all authenticated pages.
 *
 * Responsibilities:
 * 1. Server-side session guard: if no session exists (e.g. stale cookie),
 *    redirects to /login. The middleware handles most unauthenticated cases,
 *    but this adds a second layer of protection for SSR page renders.
 * 2. Renders the top navigation bar (AppNav) above all app pages.
 * 3. Provides a full-height flex layout so pages can use the remaining height.
 *
 * The session user object is passed to AppNav so it can display the teacher's
 * name and provide a sign-out button without an additional API call.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // Redirect to login if no valid session is found server-side.
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <AppNav user={session.user} />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl">
        {children}
      </main>
    </div>
  );
}
