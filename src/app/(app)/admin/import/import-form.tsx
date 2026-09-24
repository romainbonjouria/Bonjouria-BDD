"use client";

import Papa from "papaparse";
import { useState } from "react";
import { BATCH_FIELDS, FIELD_LABEL, matchHeader, PERSON_FIELDS, type BatchField, type PersonField } from "@/lib/fields";

const CHUNK_SIZE = 500;

type Parsed = { fileName: string; headers: string[]; rows: Record<string, string>[] };
type Report = { created: number; updated: number; skipped: number; errors: string[] };

/** Excel (Windows) enregistre souvent en Windows-1252 : on essaie UTF-8 puis on bascule. */
async function readText(file: File) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export default function ImportForm({ suggestions }: { suggestions: Record<BatchField, string[]> }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [batch, setBatch] = useState<Record<BatchField, string>>({ sector: "", city: "" });
  const [mapping, setMapping] = useState<Record<string, PersonField | "">>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  async function onFile(file: File | undefined) {
    setParsed(null);
    setReport(null);
    setParseError(null);
    if (!file) return;

    const text = await readText(file);
    const res = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    });
    const headers = (res.meta.fields ?? []).filter(Boolean);
    if (headers.length === 0 || res.data.length === 0) {
      setParseError("Fichier vide ou illisible.");
      return;
    }
    const auto: Record<string, PersonField | ""> = {};
    const used = new Set<PersonField>();
    for (const h of headers) {
      const m = matchHeader(h);
      auto[h] = m && !used.has(m) ? m : "";
      if (m) used.add(m);
    }
    setMapping(auto);
    setParsed({ fileName: file.name, headers, rows: res.data });
  }

  const mappedFields = new Set(Object.values(mapping).filter(Boolean));
  const canImport = parsed && (mappedFields.size > 0 || BATCH_FIELDS.some((k) => batch[k].trim())) && !progress;

  async function runImport() {
    if (!parsed) return;
    const rows = parsed.rows.map((r) => {
      const out: Partial<Record<PersonField, string>> = {};
      for (const h of parsed.headers) {
        const f = mapping[h];
        if (f) out[f] = r[h];
      }
      for (const k of BATCH_FIELDS) {
        if (batch[k].trim() && !out[k]?.trim()) out[k] = batch[k].trim();
      }
      return out;
    });

    const total: Report = { created: 0, updated: 0, skipped: 0, errors: [] };
    setReport(null);
    setProgress({ done: 0, total: rows.length });

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
        total.created += data.created;
        total.updated += data.updated;
        total.skipped += data.skipped;
      } catch (e) {
        total.errors.push(`Lignes ${i + 2} à ${i + 1 + chunk.length} : ${(e as Error).message}`);
      }
      setProgress({ done: Math.min(i + CHUNK_SIZE, rows.length), total: rows.length });
    }
    setProgress(null);
    setReport(total);
  }

  return (
    <div className="space-y-5">
      <div className="card">
        <label className="label" htmlFor="file">Fichier CSV</label>
        <input
          id="file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700 hover:file:bg-indigo-100"
        />
        {parseError && <p className="alert-error mt-3">{parseError}</p>}

        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="mb-3 text-sm text-slate-600">
            Valeurs appliquées à <strong>toutes les lignes</strong> de ce fichier (facultatif). Une valeur déjà présente
            dans une colonne du CSV reste prioritaire.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {BATCH_FIELDS.map((k) => (
              <div key={k}>
                <label className="label" htmlFor={`batch-${k}`}>{FIELD_LABEL[k]}</label>
                <input
                  id={`batch-${k}`}
                  className="input"
                  list={`batch-list-${k}`}
                  autoComplete="off"
                  placeholder="Laisser vide si non concerné"
                  value={batch[k]}
                  onChange={(e) => setBatch({ ...batch, [k]: e.target.value })}
                  disabled={!!progress}
                />
                <datalist id={`batch-list-${k}`}>
                  {suggestions[k].map((v) => <option key={v} value={v} />)}
                </datalist>
              </div>
            ))}
          </div>
        </div>
      </div>

      {parsed && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <strong>{parsed.fileName}</strong> — {parsed.rows.length.toLocaleString("fr-FR")} ligne(s).
              Vérifiez la correspondance des colonnes :
            </p>
            <button className="btn-primary" disabled={!canImport} onClick={runImport}>
              {progress ? `Import… ${progress.done}/${progress.total}` : "Lancer l’import"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left">
                  {parsed.headers.map((h) => (
                    <th key={h} className="min-w-40 px-2 pb-2 align-bottom">
                      <div className="mb-1 truncate text-xs text-slate-500" title={h}>{h}</div>
                      <select
                        className={`input py-1 ${mapping[h] ? "" : "text-slate-400"}`}
                        value={mapping[h] ?? ""}
                        onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as PersonField | "" })}
                      >
                        <option value="">— Ignorer —</option>
                        {PERSON_FIELDS.map((f) => (
                          <option key={f.key} value={f.key} disabled={mapping[h] !== f.key && mappedFields.has(f.key)}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {parsed.rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    {parsed.headers.map((h) => (
                      <td key={h} className={`max-w-56 truncate px-2 py-1.5 ${mapping[h] ? "" : "text-slate-300"}`}>{r[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!mappedFields.has("email") && (
            <p className="text-xs text-amber-700">
              ⚠ Aucune colonne Email : les doublons ne pourront pas être détectés, chaque ligne sera créée.
            </p>
          )}
        </div>
      )}

      {report && (
        <div className={report.errors.length ? "alert-error space-y-1" : "alert-ok"}>
          <p>
            Import terminé : <strong>{report.created}</strong> créée(s), <strong>{report.updated}</strong> mise(s) à jour,{" "}
            <strong>{report.skipped}</strong> ignorée(s) (ni nom, ni prénom, ni email, ni société).
          </p>
          {report.errors.map((e) => <p key={e}>{e}</p>)}
        </div>
      )}
    </div>
  );
}
