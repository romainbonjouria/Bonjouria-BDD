import "server-only";
import { sql } from "./db";

export type GroupQuota = {
  maxUsers: number | null;
  maxExportsMonth: number | null;
  users: number;
  pendingInvitations: number;
  exportedThisMonth: number;
};

/** Quotas d'un groupe et consommation du mois en cours (fuseau Paris). */
export async function groupQuota(groupId: number): Promise<GroupQuota | null> {
  const [row] = await sql<
    { max_users: number | null; max_exports_month: number | null; users: number; pending: number; exported: number }[]
  >`
    SELECT g.max_users, g.max_exports_month,
      (SELECT count(*)::int FROM app_users u WHERE u.group_id = g.id) AS users,
      (SELECT count(*)::int FROM invitations i WHERE i.group_id = g.id AND i.used_at IS NULL AND i.expires_at > now()) AS pending,
      (SELECT coalesce(sum(e.row_count), 0)::int FROM export_log e JOIN app_users u ON u.id = e.user_id
        WHERE u.group_id = g.id
          AND e.exported_at >= date_trunc('month', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris') AS exported
    FROM groups g WHERE g.id = ${groupId}`;
  if (!row) return null;
  return {
    maxUsers: row.max_users,
    maxExportsMonth: row.max_exports_month,
    users: row.users,
    pendingInvitations: row.pending,
    exportedThisMonth: row.exported,
  };
}

/** Message d'erreur si le groupe a atteint son quota de comptes (comptes + invitations en attente). */
export async function userQuotaError(groupId: number) {
  const q = await groupQuota(groupId);
  if (q?.maxUsers == null) return null;
  const used = q.users + q.pendingInvitations;
  return used >= q.maxUsers
    ? `Quota de comptes atteint pour ce groupe (${used} / ${q.maxUsers}, invitations en attente comprises).`
    : null;
}
