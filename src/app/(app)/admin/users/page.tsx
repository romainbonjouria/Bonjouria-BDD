import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { Role } from "@/lib/session";
import { CreateUserForm, UserRow } from "./user-forms";

export type UserListItem = {
  id: number;
  username: string;
  role: Role;
  active: boolean;
  created_at: Date;
  last_login_at: Date | null;
};

export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await sql<UserListItem[]>`
    SELECT id, username, role, active, created_at, last_login_at FROM app_users ORDER BY username`;

  return (
    <div className="space-y-5">
      <h1 className="text-xl">Utilisateurs</h1>
      <p className="-mt-3 text-sm text-slate-500">Cliquez sur un identifiant pour voir sa dernière connexion, ses téléchargements et gérer l’accès aux emails.</p>
      <CreateUserForm />
      <div className="overflow-x-auto rounded-2xl bg-white shadow-soft">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">Identifiant</th>
              <th className="px-3 py-2">Rôle / statut</th>
              <th className="px-3 py-2">Dernière connexion</th>
              <th className="px-3 py-2">Nouveau mot de passe</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={{
                  id: u.id,
                  username: u.username,
                  role: u.role,
                  active: u.active,
                  lastLogin: u.last_login_at
                    ? u.last_login_at.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })
                    : null,
                }}
                isMe={u.id === me.id}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
