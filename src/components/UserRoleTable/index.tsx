"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";
import { formatDate } from "@/lib/utils";

/** A single row as returned by GET /api/users. */
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

/**
 * UserRoleTable — Developer-only role management table.
 *
 * Fetches all users from `GET /api/users` on mount, then lets the
 * Developer change any row's role via a dropdown. Each change calls
 * `PATCH /api/users/[id]` and rolls the row back to its previous role if
 * the request fails (e.g. the last-Developer guard rejects it).
 *
 * @param currentUserId - The signed-in Developer's own user id, used only
 *   to show a "(you)" label next to their row.
 */
export default function UserRoleTable({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch("/api/users");
        if (!res.ok) throw new Error("Failed to load users.");
        const data = (await res.json()) as { users: UserRow[] };
        setUsers(data.users);
      } catch {
        toast.error("Failed to load users. Please refresh.");
      } finally {
        setIsLoading(false);
      }
    }
    loadUsers();
  }, []);

  /**
   * Sends a role change to the API, optimistically updating the row and
   * rolling back if the server rejects it.
   */
  async function handleRoleChange(userId: string, newRole: Role) {
    const previousUsers = users;
    setSavingId(userId);
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setUsers(previousUsers);
        toast.error(data.error ?? "Failed to update role.");
        return;
      }

      toast.success("Role updated.");
    } catch {
      setUsers(previousUsers);
      toast.error("Network error. Please try again.");
    } finally {
      setSavingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-zinc-50 text-left">
            <th className="px-4 py-2.5 font-medium text-zinc-600">Name</th>
            <th className="px-4 py-2.5 font-medium text-zinc-600">Email</th>
            <th className="px-4 py-2.5 font-medium text-zinc-600 hidden md:table-cell">
              Joined
            </th>
            <th className="px-4 py-2.5 font-medium text-zinc-600">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-zinc-50 transition-colors">
              <td className="px-4 py-3 font-medium text-zinc-900">
                {u.name}
                {u.id === currentUserId && (
                  <span className="text-zinc-400 font-normal"> (you)</span>
                )}
              </td>
              <td className="px-4 py-3 text-zinc-500">{u.email}</td>
              <td className="px-4 py-3 text-zinc-400 text-xs hidden md:table-cell">
                {formatDate(u.createdAt)}
              </td>
              <td className="px-4 py-3">
                <select
                  value={u.role}
                  disabled={savingId === u.id}
                  onChange={(e) =>
                    handleRoleChange(u.id, e.target.value as Role)
                  }
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
