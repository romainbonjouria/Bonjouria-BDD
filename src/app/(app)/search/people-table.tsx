"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Person } from "@/lib/fields";
import { bulkDeletePeople } from "../admin/people/actions";

const CONFIRM_WORD_THRESHOLD = 100;

type Props = {
  rows: Person[];
  total: number;
  isAdmin: boolean;
  /** Filtres courants sous forme de query string (sans pagination). */
  filterQuery: string;
  hasFilters: boolean;
  /** Emails masqués pour cet utilisateur. */
  hideEmails?: boolean;
};

export default function PeopleTable({ rows, total, isAdmin, filterQuery, hasFilters, hideEmails }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Nouvelle page / nouvelle recherche : on repart d'une sélection vide
  const rowsKey = rows.map((r) => r.id).join(",");
  useEffect(() => {
    setSelected(new Set());
    setAllMatching(false);
  }, [rowsKey, filterQuery]);

  const pageAllSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const count = allMatching ? total : selected.size;

  function toggle(id: number) {
    setAllMatching(false);
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function togglePage() {
    setAllMatching(false);
    setSelected(pageAllSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function clear() {
    setSelected(new Set());
    setAllMatching(false);
  }

  function onDelete() {
    const scope = allMatching
      ? hasFilters
        ? `les ${total} personnes correspondant à cette recherche`
        : `TOUTE la base (${total} personnes)`
      : `${count} personne${count > 1 ? "s" : ""}`;
    if (count >= CONFIRM_WORD_THRESHOLD || (allMatching && !hasFilters)) {
      const typed = prompt(`Vous allez supprimer définitivement ${scope}.\n\nTapez SUPPRIMER pour confirmer :`);
      if (typed?.trim().toUpperCase() !== "SUPPRIMER") return;
    } else if (!confirm(`Supprimer définitivement ${scope} ?`)) {
      return;
    }

    startTransition(async () => {
      const res = await bulkDeletePeople(allMatching ? { query: filterQuery } : { ids: [...selected] });
      if ("error" in res) {
        setMessage({ error: res.error });
        return;
      }
      setMessage({ ok: `${res.deleted} fiche${res.deleted > 1 ? "s" : ""} supprimée${res.deleted > 1 ? "s" : ""}.` });
      clear();
      router.push(`/search${filterQuery ? "?" + filterQuery : ""}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {message?.ok && <p className="alert-ok">{message.ok}</p>}
      {message?.error && <p className="alert-error">{message.error}</p>}

      {isAdmin && count > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-soft bg-indigo-50 px-3 py-2 text-sm">
          <span>
            <strong>{count.toLocaleString("fr-FR")}</strong> sélectionnée{count > 1 ? "s" : ""}
            {allMatching && (hasFilters ? " (toute la recherche)" : " (toute la base)")}
          </span>
          {pageAllSelected && !allMatching && total > rows.length && (
            <button type="button" className="text-indigo-700 underline" onClick={() => setAllMatching(true)}>
              Sélectionner les {total.toLocaleString("fr-FR")} résultats{hasFilters ? " de la recherche" : " (toute la base)"}
            </button>
          )}
          <button type="button" className="text-slate-600 underline" onClick={clear}>
            Désélectionner
          </button>
          <button type="button" className="btn-danger btn-sm ml-auto" onClick={onDelete} disabled={pending}>
            {pending ? "Suppression…" : `Supprimer (${count.toLocaleString("fr-FR")})`}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white shadow-soft">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            {isAdmin && <col className="w-10" />}
            <col className="w-[14%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[13%]" />
            <col className="w-[11%]" />
            <col className="w-[18%]" />
            <col className="w-[10%]" />
            <col className="w-24" />
          </colgroup>
          <thead className="bg-soft/50 text-left text-xs font-semibold uppercase tracking-wide text-brand-dark">
            <tr>
              {isAdmin && (
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Tout sélectionner sur la page"
                    checked={pageAllSelected}
                    onChange={togglePage}
                    disabled={rows.length === 0}
                  />
                </th>
              )}
              {["Nom", "Société", "Poste", "Secteur", "Ville", "Email", "Téléphone", ""].map((h, i) => (
                <th key={i} className="px-3 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {rows.map((p) => (
              <tr key={p.id} className={selected.has(p.id) || allMatching ? "bg-indigo-50" : "hover:bg-slate-50"}>
                {isAdmin && (
                  <td className="break-words px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Sélectionner"
                      checked={allMatching || selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                  </td>
                )}
                <td className="break-words px-3 py-3 font-medium">
                  {[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="break-words px-3 py-3">{p.company}</td>
                <td className="break-words px-3 py-3">{p.job_title}</td>
                <td className="break-words px-3 py-3">{p.sector}</td>
                <td className="break-words px-3 py-3">
                  {p.city}
                  {p.postal_code && <span className="text-slate-400"> ({p.postal_code})</span>}
                </td>
                <td className="break-all px-3 py-3">
                  {hideEmails ? <span className="text-slate-400">Masqué</span> : p.email && <a href={`mailto:${p.email}`} className="text-indigo-600 hover:underline">{p.email}</a>}
                </td>
                <td className="break-words px-3 py-3">{p.phone}</td>
                <td className="px-3 py-3 text-right text-xs leading-6">
                  {p.linkedin && /^https?:\/\//i.test(p.linkedin) && (
                    <a href={p.linkedin} target="_blank" rel="noopener noreferrer" className="block text-indigo-600 hover:underline">
                      LinkedIn
                    </a>
                  )}
                  {isAdmin && (
                    <Link href={`/admin/people/${p.id}`} className="text-slate-500 hover:text-slate-900">Modifier</Link>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 9 : 8} className="px-3 py-10 text-center text-slate-500">Aucun résultat.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
