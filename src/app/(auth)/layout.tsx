/**
 * Auth Layout
 *
 * Wraps the /login and /signup pages with a centered, full-screen layout.
 * No navigation bar is shown here — the auth pages are intentionally minimal
 * to focus the teacher's attention on signing in or registering.
 *
 * The background uses a subtle zinc-50 color to distinguish the auth pages
 * from the white application pages.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      {children}
    </div>
  );
}
