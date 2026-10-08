import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { sql } from "@/lib/db";
import { groupQuota } from "@/lib/quotas";
import { isSuperAdmin } from "@/lib/roles";

const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const fmtDate = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium" });

function Bars({ items, unit }: { items: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex h-40 items-end gap-2">
      {items.map((i) => (
        <div key={i.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${i.value} ${unit}`}>
          <span className="text-xs font-medium text-slate-600">{i.value.toLocaleString("fr-FR")}</span>
          <div className="w-full rounded-t-lg bg-brand" style={{ height: `${Math.max(2, (i.value / max) * 100)}%`, opacity: i.value ? 1 : 0.25 }} />
          <span className="w-full truncate text-center text-[11px] text-slate-400">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className="text-2xl font-bold text-brand">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireManager();
  const superAdmin = isSuperAdmin(me.role);
  const params = await searchParams;

  const groups = await sql<{ id: number; name: string }[]>`
    SELECT id, name FROM groups ${superAdmin ? sql`` : sql`WHERE id = ${me.group_id ?? 0}`} ORDER BY name`;
  const requested = Number(Array.isArray(params.group) ? params.group[0] : params.group);
  const groupId = superAdmin ? (groups.some((g) => g.id === requested) ? requested : null) : me.group_id;
  const groupName = groups.find((g) => g.id === groupId)?.name;
  // Super admin sans groupe choisi : tous les comptes (sauf lui-même)
  const scope = groupId ? sql`u.group_id = ${groupId}` : sql`u.role <> 'super_admin'`;

  const [[kpi], weekly, monthly, inactive, quota] = await Promise.all([
    sql<{ accounts: number; active: number; logins30: number; exported: number; inactive: number }[]>`
      SELECT
        (SELECT count(*)::int FROM app_users u WHERE ${scope}) AS accounts,
        (SELECT count(*)::int FROM app_users u WHERE ${scope} AND u.active) AS active,
        (SELECT count(*)::int FROM login_log l JOIN app_users u ON u.id = l.user_id
           WHERE ${scope} AND l.logged_at >= now() - interval '30 days') AS logins30,
        (SELECT coalesce(sum(e.row_count), 0)::int FROM export_log e JOIN app_users u ON u.id = e.user_id
           WHERE ${scope} AND e.exported_at >= date_trunc('month', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris') AS exported,
        (SELECT count(*)::int FROM app_users u
           WHERE ${scope} AND u.active AND (u.last_login_at IS NULL OR u.last_login_at < now() - interval '30 days')) AS inactive`,
    sql<{ label: string; logins: number }[]>`
      SELECT to_char(w.week, 'DD/MM') AS label, count(l.id)::int AS logins
      FROM generate_series(date_trunc('week', now() AT TIME ZONE 'Europe/Paris') - interval '7 weeks',
                           date_trunc('week', now() AT TIME ZONE 'Europe/Paris'), interval '1 week') AS w(week)
      LEFT JOIN (SELECT l.id, l.logged_at AT TIME ZONE 'Europe/Paris' AS at
                 FROM login_log l JOIN app_users u ON u.id = l.user_id WHERE ${scope}) l
        ON date_trunc('week', l.at) = w.week
      GROUP BY w.week ORDER BY w.week`,
    sql<{ month: number; people: number }[]>`
      SELECT extract(month FROM m.month)::int AS month, coalesce(sum(e.row_count), 0)::int AS people
      FROM generate_series(date_trunc('month', now() AT TIME ZONE 'Europe/Paris') - interval '5 months',
                           date_trunc('month', now() AT TIME ZONE 'Europe/Paris'), interval '1 month') AS m(month)
      LEFT JOIN (SELECT e.row_count, e.exported_at AT TIME ZONE 'Europe/Paris' AS at
                 FROM export_log e JOIN app_users u ON u.id = e.user_id WHERE ${scope}) e
        ON date_trunc('month', e.at) = m.month
      GROUP BY m.month ORDER BY m.month`,
    sql<{ id: number; username: string; last_login_at: Date | null; group_name: string | null }[]>`
      SELECT u.id, u.username, u.last_login_at, g.name AS group_name
      FROM app_users u LEFT JOIN groups g ON g.id = u.group_id
      WHERE ${scope} AND u.active AND (u.last_login_at IS NULL OR u.last_login_at < now() - interval '30 days')
      ORDER BY u.last_login_at NULLS FIRST, u.username LIMIT 50`,
    groupId ? groupQuota(groupId) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl">Tableau de bord{groupName ? ` — ${groupName}` : superAdmin ? " — tous les groupes" : ""}</h1>
          <p className="mt-1 text-sm text-slate-500">Usage du logiciel : connexions, personnes exportées, comptes inactifs.</p>
        </div>
        {superAdmin && (
          <form method="get" className="flex items-end gap-2">
            <div>
              <label className="label" htmlFor="group">Groupe</label>
              <select id="group" name="group" defaultValue={groupId ?? ""} className="input py-2">
                <option value="">Tous les groupes</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <button className="btn-secondary">Afficher</button>
          </form>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Comptes" value={kpi.accounts.toLocaleString("fr-FR")} hint={`${kpi.active} actif${kpi.active > 1 ? "s" : ""}`} />
        <Kpi label="Connexions (30 jours)" value={kpi.logins30.toLocaleString("fr-FR")} />
        <Kpi label="Personnes exportées (ce mois)" value={kpi.exported.toLocaleString("fr-FR")} />
        <Kpi label="Inactifs depuis 30 jours" value={kpi.inactive.toLocaleString("fr-FR")} hint="Jamais connectés ou plus de 30 jours" />
      </div>

      {quota && (quota.maxUsers != null || quota.maxExportsMonth != null) && (
        <div className="card grid gap-4 sm:grid-cols-2">
          {quota.maxUsers != null && (
            <div>
              <p className="label">Quota de comptes</p>
              <p className="text-sm font-semibold">
                {quota.users + quota.pendingInvitations} / {quota.maxUsers}
                <span className="font-normal text-slate-500"> (invitations en attente comprises)</span>
              </p>
            </div>
          )}
          {quota.maxExportsMonth != null && (
            <div>
              <p className="label">Quota d’exports du mois</p>
              <p className="text-sm font-semibold">
                {quota.exportedThisMonth.toLocaleString("fr-FR")} / {quota.maxExportsMonth.toLocaleString("fr-FR")} personnes
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-1 font-medium">Connexions par semaine</h2>
          <p className="mb-4 text-xs text-slate-400">8 dernières semaines (historique à partir de la mise en service du suivi)</p>
          <Bars items={weekly.map((w) => ({ label: w.label, value: w.logins }))} unit="connexions" />
        </div>
        <div className="card">
          <h2 className="mb-1 font-medium">Personnes exportées par mois</h2>
          <p className="mb-4 text-xs text-slate-400">6 derniers mois</p>
          <Bars
            items={monthly.map((m) => ({ label: MONTHS_FR[m.month - 1], value: m.people }))}
            unit="personnes"
          />
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Utilisateurs inactifs depuis 30 jours</h2>
        {inactive.length === 0 ? (
          <p className="text-sm text-slate-500">Tous les comptes actifs se sont connectés ces 30 derniers jours.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {inactive.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <Link href={`/admin/users/${u.id}`} className="break-all font-medium text-brand hover:underline">{u.username}</Link>
                {!groupId && u.group_name && <span className="text-slate-500">{u.group_name}</span>}
                <span className="ml-auto text-slate-500">
                  {u.last_login_at ? `dernière connexion le ${fmtDate(u.last_login_at)}` : "jamais connecté"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
