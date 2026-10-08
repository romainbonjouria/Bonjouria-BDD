import { requireManager } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isSuperAdmin } from "@/lib/roles";
import type { Role } from "@/lib/session";
import { CreateUserForm, GroupUserRow, InviteForm, RevokeInvitation, UserRow, type GroupOption } from "./user-forms";

type UserListItem = {
  id: number;
  username: string;
  role: Role;
  active: boolean;
  last_login_at: Date | null;
  group_id: number | null;
  group_name: string | null;
  exports_6m: number;
};

const fmtDate = (d: Date) =>
  d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

export default async function UsersPage() {
  const me = await requireManager();
  const superAdmin = isSuperAdmin(me.role);
  // Un admin ne voit que les utilisateurs de son groupe
  const scope = superAdmin ? sql`TRUE` : sql`u.group_id = ${me.group_id ?? 0} AND u.role = 'user'`;
  const inviteScope = superAdmin ? sql`TRUE` : sql`i.group_id = ${me.group_id ?? 0}`;

  const [users, groups, invitations] = await Promise.all([
    sql<UserListItem[]>`
      SELECT u.id, u.username, u.role, u.active, u.last_login_at, u.group_id, g.name AS group_name,
             coalesce((SELECT sum(e.row_count) FROM export_log e
                       WHERE e.user_id = u.id AND e.exported_at >= now() - interval '6 months'), 0)::int AS exports_6m
      FROM app_users u LEFT JOIN groups g ON g.id = u.group_id
      WHERE ${scope} ORDER BY g.name NULLS LAST, u.username`,
    sql<GroupOption[]>`SELECT id, name FROM groups ${superAdmin ? sql`` : sql`WHERE id = ${me.group_id ?? 0}`} ORDER BY name`,
    sql<{ id: number; email: string; role: string; group_name: string; expires_at: Date }[]>`
      SELECT i.id, i.email, i.role, g.name AS group_name, i.expires_at
      FROM invitations i JOIN groups g ON g.id = i.group_id
      WHERE i.used_at IS NULL AND i.expires_at > now() AND ${inviteScope} ORDER BY i.created_at DESC`,
  ]);
  const groupName = groups.find((g) => g.id === me.group_id)?.name;

  const rows = users.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    active: u.active,
    lastLogin: u.last_login_at ? fmtDate(u.last_login_at) : null,
    groupId: u.group_id,
    groupName: u.group_name,
    exports6m: u.exports_6m,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl">{superAdmin ? "Utilisateurs" : `Utilisateurs${groupName ? ` — ${groupName}` : ""}`}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cliquez sur un identifiant pour voir sa dernière connexion et ses téléchargements
          {superAdmin ? ", et gérer l’accès aux emails." : "."}
        </p>
      </div>

      <InviteForm isSuper={superAdmin} groups={groups} />
      {superAdmin && <CreateUserForm groups={groups} />}

      {invitations.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-medium">Invitations en attente</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="font-medium">{i.email}</span>
                <span className="text-slate-500">{i.role === "admin" ? "Admin" : "Utilisateur"} · {i.group_name}</span>
                <span className="text-xs text-slate-400">expire le {fmtDate(i.expires_at)}</span>
                <span className="ml-auto"><RevokeInvitation id={i.id} /></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white shadow-soft">
        {superAdmin ? (
          <table className="min-w-full text-sm">
            <thead className="bg-soft/50 text-left text-xs font-semibold uppercase tracking-wide text-brand-dark">
              <tr>
                <th className="px-3 py-3">Identifiant</th>
                <th className="px-3 py-3">Rôle / groupe / statut</th>
                <th className="px-3 py-3">Dernière connexion</th>
                <th className="px-3 py-3 text-right">Export. 6 mois</th>
                <th className="px-3 py-3">Nouveau mot de passe</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => <UserRow key={u.id} user={u} isMe={u.id === me.id} groups={groups} />)}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-soft/50 text-left text-xs font-semibold uppercase tracking-wide text-brand-dark">
              <tr>
                <th className="px-3 py-3">Utilisateur</th>
                <th className="px-3 py-3">Dernière connexion</th>
                <th className="px-3 py-3 text-right">Personnes exportées (6 mois)</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => <GroupUserRow key={u.id} user={u} />)}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-10 text-center text-slate-500">Aucun utilisateur dans votre groupe : invitez-en par email ci-dessus.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
