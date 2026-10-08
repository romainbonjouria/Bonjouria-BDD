"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  name: string;
  label: string;
  values: string[];
  options: { value: string; count: number }[];
};

const MAX_SHOWN = 100;

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Filtre à choix multiples avec barre de recherche : on tape pour retrouver une valeur,
 * on coche autant de valeurs que voulu, la recherche se relance à la fermeture du menu.
 */
export default function FilterMulti({ name, label, values, options }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(values);

  // Les valeurs choisies restent proposées même si elles n'ont plus de résultat avec les autres filtres
  const all = useMemo(() => {
    const known = new Set(options.map((o) => o.value));
    return [...values.filter((v) => !known.has(v)).map((v) => ({ value: v, count: 0 })), ...options];
  }, [options, values]);

  const needle = fold(search.trim());
  const matches = useMemo(() => {
    const list = needle ? all.filter((o) => fold(o.value).includes(needle)) : all;
    // Les valeurs cochées remontent en tête de liste
    return [...list.filter((o) => selected.includes(o.value)), ...list.filter((o) => !selected.includes(o.value))];
  }, [all, needle, selected]);

  const changed = selected.length !== values.length || selected.some((v) => !values.includes(v));

  function close() {
    setOpen(false);
    setSearch("");
    if (changed) rootRef.current?.closest("form")?.requestSubmit();
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  });

  function toggle(v: string) {
    setSelected((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  }

  const summary =
    selected.length === 0 ? "Tous" : selected.length === 1 ? selected[0] : `${selected.length} sélectionnés`;

  return (
    <div ref={rootRef} className="relative">
      <span className="label">{label}</span>
      {selected.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        className={`input flex items-center justify-between gap-2 text-left ${selected.length ? "border-brand bg-indigo-50" : ""}`}
      >
        <span className="truncate">{summary}</span>
        <span className="text-xs text-slate-400">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1.5 rounded-2xl border border-soft bg-white p-2 shadow-soft">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                close();
              }
            }}
            placeholder={`Rechercher (${all.length.toLocaleString("fr-FR")})…`}
            className="input mb-2 py-2"
          />
          <ul className="max-h-64 overflow-y-auto text-sm">
            {matches.slice(0, MAX_SHOWN).map((o) => (
              <li key={o.value}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-soft/40">
                  <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                  <span className="min-w-0 flex-1 truncate">{o.value}</span>
                  <span className="text-xs text-slate-400">{o.count.toLocaleString("fr-FR")}</span>
                </label>
              </li>
            ))}
            {matches.length === 0 && <li className="px-2 py-3 text-slate-500">Aucune valeur.</li>}
            {matches.length > MAX_SHOWN && (
              <li className="px-2 py-2 text-xs text-slate-400">
                … et {(matches.length - MAX_SHOWN).toLocaleString("fr-FR")} autres : affinez la recherche.
              </li>
            )}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-soft/60 pt-2">
            <button type="button" className="text-xs text-slate-500 hover:text-brand" onClick={() => setSelected([])}>
              Tout effacer
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={close}>
              Appliquer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
