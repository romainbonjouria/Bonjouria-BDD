import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { FIELD_LABEL, FILTER_FIELDS, type Filters } from "@/lib/fields";
import { distinctValues, EXPORT_LIMIT, parseFilters, searchPeople } from "@/lib/people";

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
  const page = Math.max(1, Number(params.page) || 1);

  const [{ total, rows }, suggestions] = await Promise.all([
    searchPeople(filters, page, PAGE_SIZE),
    distinctValues(["city", "sector", "company", "job_title", "country"]),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="space-y-5">
      <form className="card grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" method="get">
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="label" htmlFor="q">Recherche libre (nom, prénom, email, société)</label>
          <input id="q" name="q" defaultValue={filters.q} className="input" placeholder="ex. Dupont" />
        </div>
        {FILTER_FIELDS.map((k) => (
          <div key={k}>
            <label className="label" htmlFor={k}>{FIELD_LABEL[k]}</label>
            <input id={k} name={k} defaultValue={filters[k]} className="input" list={`list-${k}`} autoComplete="off" />
            {k in suggestions && (
              <datalist id={`list-${k}`}>
                {suggestions[k].map((v) => <option key={v} value={v} />)}
              </datalist>
            )}
          </div>
        ))}
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2 lg:justify-end">
          <Link href="/search" className="btn-secondary">Réinitialiser</Link>
          <button className="btn-primary">Rechercher</button>
        </div>
      </form>

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

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              {["Nom", "Société", "Poste", "Secteur", "Ville", "Email", "Téléphone", ""].map((h, i) => (
                <th key={i} className="whitespace-nowrap px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-2 font-medium">
                  {[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-3 py-2">{p.company}</td>
                <td className="px-3 py-2">{p.job_title}</td>
                <td className="px-3 py-2">{p.sector}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {p.city}
                  {p.postal_code && <span className="text-slate-400"> ({p.postal_code})</span>}
                </td>
                <td className="px-3 py-2">
                  {p.email && <a href={`mailto:${p.email}`} className="text-indigo-600 hover:underline">{p.email}</a>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{p.phone}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {p.linkedin && /^https?:\/\//i.test(p.linkedin) && (
                    <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="mr-3 text-indigo-600 hover:underline">
                      LinkedIn
                    </a>
                  )}
                  {user.role === "admin" && (
                    <Link href={`/admin/people/${p.id}`} className="text-slate-500 hover:text-slate-900">Modifier</Link>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-500">Aucun résultat.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
