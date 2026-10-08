"use client";

import { useActionState } from "react";
import { acceptInvitation } from "./actions";

export default function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitation, undefined);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">Mot de passe (8 caractères min.)</label>
        <input id="password" name="password" type="password" className="input" minLength={8} autoComplete="new-password" required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirmer le mot de passe</label>
        <input id="confirm" name="confirm" type="password" className="input" minLength={8} autoComplete="new-password" required />
      </div>
      {state?.error && <p className="alert-error">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Création…" : "Activer mon compte"}
      </button>
    </form>
  );
}
