import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import DatabaseExplorer from "@/components/DatabaseExplorer";

/**
 * Database Management Page — /database
 *
 * Developer-only. Browse and edit all Prisma tables directly from the app UI.
 */
export default async function DatabasePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "DEVELOPER") {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Database Management</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Browse, insert, update, delete, and truncate rows in any Prisma table.
        </p>
      </div>
      <DatabaseExplorer />
    </div>
  );
}
