import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import UserRoleTable from "@/components/UserRoleTable";

/**
 * User Management Page — /users
 *
 * Developer-only. Lists every registered account and lets a Developer
 * change any account's role, which controls that account's page access
 * (see `src/lib/roles.ts`).
 *
 * Enforced at three independent layers, none of which trust the others
 * alone: `middleware.ts` (route gating before this page even renders),
 * this server-side redirect (defense in depth), and the `/api/users`
 * routes themselves (never trust the client for a mutating admin action).
 */
export default async function UsersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "DEVELOPER") {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">User Management</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Control which pages each account can access based on their role.
        </p>
      </div>
      <UserRoleTable currentUserId={session.user.id} />
    </div>
  );
}
