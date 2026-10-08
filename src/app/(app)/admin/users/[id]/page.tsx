import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { EmailAccessForm } from "./email-access-form";

const MONTHS = 6;
const fmt = (d: Date | null) =>
  d ? d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" }) : "Jamais";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = Number(id);
  if (!Number.isInteger(uid)) notFound();
  await ensureSchema();

  const [user] = await sql<
    { id: number; username: string; role: string; active: boolean; hide_emails: boolean; created_at: Date; last_login_at: Date | null }[]
  >`SELECT id, username, role, active, hide_emails, created_at, last_login_at FROM app_users WHERE id = ${uid}`;
  if (!user) notFound();

  const [monthly, recent, [totals]] = await Promise.all([
    sql<{ month: string; exports: number; people: number }[]>`
      SELECT to_char(date_trunc('month', exported_at AT TIME ZONE 'Europe/Paris'), 'YYYY-MM') AS month,
             count(*)::int AS exports, coalesce(sum(row_count), 0)::int AS people
      FROM export_log
      WHERE user_id = ${uid} AND exported_at >= date_trunc('month', now()) - ${`${MONTHS - 1} months`}::interval
      GROUP BY 1 ORDER BY 1 DESC`,
    sql<{ exported_at: Date; row_count: number; filters: string | null }[]>`
      SELECT exported_at, row_count, filters FROM export_log WHERE user_id = ${uid}
      ORDER BY exported_at DESC LIMIT 10`,
    sql<{ exports: number; people: number }[]>`
      SELECT count(*)::int AS exports, coalesce(sum(row_count), 0)::int AS people
      FROM export_log WHERE user_id = ${uid}`,
  ]);

  const monthLabel = (m: string) =>
    new Date(`${m}-01T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  const lastMonths = monthly.reduce((n, m) => n + m.people, 0);

  return (
    <div className="space-y-5">
      <Link href="/admin/users" className="text-sm text-slate-500 hover:text-brand">← Utilisateurs</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl">{user.username}</h1>
        <span className="rounded-full bg-soft px-2.5 py-0.5 text-xs font-semibold text-brand-dark">
          {user.role === "admin" ? "Administrateur" : "Utilisateur"}
        </span>
        {!user.active && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Désactivé</span>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="label">Dernière connexion</p>
          <p className="text-sm font-semibold">{fmt(user.last_login_at)}</p>
        </div>
        <div className="card">
          <p className="label">Personnes téléchargées ({MONTHS} derniers mois)</p>
          <p className="text-2xl font-bold text-brand">{lastMonths.toLocaleString("fr-FR")}</p>
        </div>
        <div className="card">
          <p className="label">Total depuis la création</p>
          <p className="text-sm font-semibold">
            {totals.people.toLocaleString("fr-FR")} personnes en {totals.exports} export{totals.exports > 1 ? "s" : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">Compte créé le {fmt(user.created_at)}</p>
        </div>
      </div>

      <EmailAccessForm userId={user.id} hidden={user.hide_emails} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-medium">Téléchargements par mois</h2>
          {monthly.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun export sur la période.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr><th className="pb-2">Mois</th><th className="pb-2 text-right">Exports</th><th className="pb-2 text-right">Personnes</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthly.map((m) => (
                  <tr key={m.month}>
                    <td className="py-2 capitalize">{monthLabel(m.month)}</td>
                    <td className="py-2 text-right">{m.exports}</td>
                    <td className="py-2 text-right font-medium">{m.people.toLocaleString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2 className="mb-3 font-medium">Derniers exports</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun export.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {recent.map((r, i) => (
                <li key={i} className="py-2">
                  <span className="font-medium">{r.row_count.toLocaleString("fr-FR")} personnes</span>
                  <span className="text-slate-500"> · {fmt(r.exported_at)}</span>
                  {r.filters && <p className="break-all text-xs text-slate-400">{decodeURIComponent(r.filters.replace(/\+/g, " "))}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
