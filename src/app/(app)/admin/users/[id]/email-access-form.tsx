"use client";

import { useActionState } from "react";
import { setEmailAccess } from "../actions";

export function EmailAccessForm({ userId, hidden }: { userId: number; hidden: boolean }) {
  const [state, action, pending] = useActionState(setEmailAccess, undefined);

  return (
    <form action={action} className="card">
      <input type="hidden" name="id" value={userId} />
      <h2 className="mb-1 font-medium">Visibilité des emails</h2>
      <p className="mb-4 font-serif text-sm text-slate-500">
        Si les emails sont masqués, l’utilisateur ne les voit ni dans le tableau, ni dans les exports CSV, et ne peut pas les retrouver via la recherche.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="hide_emails" defaultChecked={hidden} />
        Masquer les emails pour cet utilisateur
      </label>
      <button className="btn-primary btn-sm mt-4" disabled={pending}>Enregistrer</button>
      {state?.error && <p className="alert-error mt-3">{state.error}</p>}
      {state?.ok && <p className="alert-ok mt-3">{state.ok}</p>}
    </form>
  );
}
