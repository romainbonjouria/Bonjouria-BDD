import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { FILTER_FIELDS, FILTER_LABEL, type Filters } from "@/lib/fields";
import { EXPORT_LIMIT, facetValues, parseFilters, searchPeople, viewerOf } from "@/lib/people";
import { sql } from "@/lib/db";
import { groupQuota } from "@/lib/quotas";
import FilterMulti from "./filter-multi";
import PeopleTable from "./people-table";

const PAGE_SIZE = 50;

function toQuery(filters: Filters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (Array.isArray(v)) for (const x of v) p.append(k, x);
    else if (v) p.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const filters = parseFilters(params);
  const page = Math.max(1, Number(params.page) || 1);

  const viewer = viewerOf(user);
  // Le super admin peut restreindre la recherche à la base commune ou à l'espace privé d'une société
  const spaces = viewer.superAdmin
    ? await sql<{ id: number; name: string }[]>`SELECT id, name FROM groups WHERE EXISTS (SELECT 1 FROM people p WHERE p.owner_group_id = groups.id) ORDER BY name`
    : [];
  // Quota mensuel d'exports du groupe (le super admin n'est pas concerné)
  const quota = user.role !== "super_admin" && user.group_id ? await groupQuota(user.group_id) : null;
  const quotaLeft = quota?.maxExportsMonth != null ? Math.max(0, quota.maxExportsMonth - quota.exportedThisMonth) : null;

  const [{ total, rows }, facets] = await Promise.all([searchPeople(filters, page, PAGE_SIZE, viewer), facetValues(filters, viewer)]);
  // On masque les filtres sans aucune valeur en base (ex. colonnes absentes des CSV importés)
  const visibleFilters = FILTER_FIELDS.filter((k) => facets[k].length > 0 || filters[k]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="space-y-5">
      <form className="card grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" method="get">
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="label" htmlFor="q">Recherche libre (nom, prénom, email, société)</label>
          <input id="q" name="q" defaultValue={filters.q} className="input" placeholder="ex. Dupont" />
        </div>
        {spaces.length > 0 && (
          <div>
            <label className="label" htmlFor="space">Espace de données</label>
            <select id="space" name="space" defaultValue={filters.space ?? ""} className={`input ${filters.space ? "border-brand bg-indigo-50" : ""}`}>
              <option value="">Tout</option>
              <option value="shared">Base commune</option>
              {spaces.map((g) => <option key={g.id} value={g.id}>Privé — {g.name}</option>)}
            </select>
          </div>
        )}
        {visibleFilters.map((k) => (
          <FilterMulti
            key={`${k}:${(filters[k] ?? []).join("|")}`}
            name={k}
            label={FILTER_LABEL[k]}
            values={filters[k] ?? []}
            options={facets[k]}
          />
        ))}
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4 lg:justify-end">
          <Link href="/search" className="btn-secondary">Réinitialiser</Link>
          <button className="btn-primary">Rechercher</button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          <strong>{total.toLocaleString("fr-FR")}</strong> personne{total > 1 ? "s" : ""} trouvée{total > 1 ? "s" : ""}
          {hasFilters && " pour ces critères"}
        </p>
        {total > 0 &&
          (quotaLeft !== null && Math.min(total, EXPORT_LIMIT) > quotaLeft ? (
            <span className="rounded-xl bg-soft/50 px-4 py-2.5 text-sm text-slate-700">
              Export indisponible : {Math.min(total, EXPORT_LIMIT).toLocaleString("fr-FR")} personnes demandées, quota restant ce mois-ci :{" "}
              {quotaLeft.toLocaleString("fr-FR")}. Affinez la recherche.
            </span>
          ) : (
            <a href={`/api/export?${toQuery(filters)}`} className="btn-primary">
              ⬇ Exporter en CSV{total > EXPORT_LIMIT && ` (${EXPORT_LIMIT.toLocaleString("fr-FR")} max.)`}
              {quotaLeft !== null && <span className="font-normal opacity-80">· {quotaLeft.toLocaleString("fr-FR")} restantes ce mois</span>}
            </a>
          ))}
      </div>

      <PeopleTable
        rows={rows}
        total={total}
        isAdmin={user.role === "super_admin"}
        filterQuery={toQuery(filters)}
        hasFilters={hasFilters}
        hideEmails={user.hide_emails}
      />

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && <Link className="btn-secondary btn-sm" href={`/search?${toQuery(filters, { page: String(page - 1) })}`}>← Précédent</Link>}
          <span className="text-slate-600">Page {page} / {pages}</span>
          {page < pages && <Link className="btn-secondary btn-sm" href={`/search?${toQuery(filters, { page: String(page + 1) })}`}>Suivant →</Link>}
        </nav>
      )}
    </div>
  );
}
