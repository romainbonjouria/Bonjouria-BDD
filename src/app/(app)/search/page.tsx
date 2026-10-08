import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { FIELD_LABEL, FILTER_FIELDS, type Filters } from "@/lib/fields";
import { EXPORT_LIMIT, facetValues, parseFilters, searchPeople } from "@/lib/people";
import FilterSelect from "./filter-select";
import PeopleTable from "./people-table";
import SearchForm from "./search-form";

const PAGE_SIZE = 50;

function toQuery(filters: Filters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
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
  const ask = typeof params.ask === "string" ? params.ask.slice(0, 300) : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const [{ total, rows }, facets] = await Promise.all([searchPeople(filters, page, PAGE_SIZE, user.hide_emails), facetValues(filters, user.hide_emails)]);
  // On masque les filtres sans aucune valeur en base (ex. colonnes absentes des CSV importés)
  const visibleFilters = FILTER_FIELDS.filter((k) => facets[k].length > 0 || filters[k]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="space-y-5">
      <SearchForm>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="label" htmlFor="q">Recherche libre ou demande en langage naturel</label>
          <input id="q" name="q" defaultValue={filters.q} className="input" placeholder="ex. Dupont — ou « tous les peintres de France »" />
        </div>
        {visibleFilters.map((k) => (
          <FilterSelect key={k} name={k} label={FIELD_LABEL[k]} value={filters[k]} options={facets[k]} />
        ))}
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4 lg:justify-end">
          <Link href="/search" className="btn-secondary">Réinitialiser</Link>
          <button className="btn-primary">Rechercher</button>
        </div>
      </SearchForm>

      {ask && (
        <p className="rounded-xl bg-soft/50 px-4 py-2.5 text-sm text-slate-700">
          Filtres appliqués automatiquement depuis votre demande : <em className="font-serif">« {ask} »</em>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          <strong>{total.toLocaleString("fr-FR")}</strong> personne{total > 1 ? "s" : ""} trouvée{total > 1 ? "s" : ""}
          {hasFilters && " pour ces critères"}
        </p>
        {total > 0 && (
          <a href={`/api/export?${toQuery(filters)}`} className="btn-primary">
            ⬇ Exporter en CSV{total > EXPORT_LIMIT && ` (${EXPORT_LIMIT.toLocaleString("fr-FR")} max.)`}
          </a>
        )}
      </div>

      <PeopleTable
        rows={rows}
        total={total}
        isAdmin={user.role === "admin"}
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
