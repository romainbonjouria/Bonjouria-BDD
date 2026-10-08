"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { interpretQuery } from "./actions";

/**
 * Formulaire de recherche : une demande de plusieurs mots saisie dans la barre
 * (« tous les peintres de France ») est interprétée par l'IA et convertie en filtres.
 */
export default function SearchForm({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    // Les changements de menu déroulant (sans bouton) et les recherches d'un seul mot restent classiques
    if (!(e.nativeEvent as SubmitEvent).submitter || !/\s/.test(q)) return;

    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await interpretQuery(q);
      if ("error" in res) {
        setError(res.error);
        router.push(`/search?${new URLSearchParams({ q })}`);
      } else {
        router.push(`/search?${res.query}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" method="get" onSubmit={onSubmit} aria-busy={busy}>
      {children}
      {busy && <p className="text-sm text-brand sm:col-span-2 lg:col-span-4">Analyse de votre demande…</p>}
      {error && <p className="alert-error sm:col-span-2 lg:col-span-4">{error}</p>}
    </form>
  );
}
