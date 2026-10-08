"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Stats = { total: number; classees: number; intitulesRestants: number };

export default function ClassifyForm({ initial, aiAvailable }: { initial: Stats; aiAvailable: boolean }) {
  const router = useRouter();
  const [stats, setStats] = useState(initial);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ ok?: string; error?: string }>();

  async function run() {
    setRunning(true);
    setMessage(undefined);
    let done = 0;
    try {
      // Lots successifs jusqu'à épuisement, ou jusqu'à ce qu'un lot n'apporte plus rien
      for (;;) {
        const res = await fetch("/api/job-families", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 80 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur");
        setStats({ total: data.total, classees: data.classees, intitulesRestants: data.intitulesRestants });
        done += data.regle + data.ia;
        if (data.intitulesRestants === 0 || data.regle + data.ia === 0) break;
      }
      setMessage({ ok: `${done.toLocaleString("fr-FR")} intitulé${done > 1 ? "s" : ""} classé${done > 1 ? "s" : ""}.` });
      router.refresh();
    } catch (err) {
      setMessage({ error: (err as Error).message });
    } finally {
      setRunning(false);
    }
  }

  const pct = stats.total ? Math.round((stats.classees / stats.total) * 100) : 0;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600">
            <strong>{stats.classees.toLocaleString("fr-FR")}</strong> fiches classées sur{" "}
            <strong>{stats.total.toLocaleString("fr-FR")}</strong> ayant un poste ({pct} %)
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {stats.intitulesRestants.toLocaleString("fr-FR")} intitulé{stats.intitulesRestants > 1 ? "s" : ""} restant{stats.intitulesRestants > 1 ? "s" : ""} à classer
            {!aiAvailable && " — aucune clé IA configurée : seules les règles par mots-clés sont appliquées"}
          </p>
        </div>
        <button className="btn-primary" onClick={run} disabled={running || stats.intitulesRestants === 0}>
          {running ? "Classement en cours…" : "Classer les postes"}
        </button>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-soft/60">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>
      {message?.ok && <p className="alert-ok mt-4">{message.ok}</p>}
      {message?.error && <p className="alert-error mt-4">{message.error}</p>}
    </div>
  );
}
