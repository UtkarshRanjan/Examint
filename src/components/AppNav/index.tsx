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
  Database,
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
  { href: "/database", label: "Database", icon: Database },
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
