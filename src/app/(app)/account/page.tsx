"use client";

import { useActionState } from "react";
import { changePassword } from "./actions";

export default function AccountPage() {
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Mon compte</h1>
      <form action={action} className="card space-y-4">
        <h2 className="font-medium">Changer mon mot de passe</h2>
        {[
          ["current", "Mot de passe actuel", "current-password"],
          ["next", "Nouveau mot de passe (8 car. min.)", "new-password"],
          ["confirm", "Confirmer le nouveau mot de passe", "new-password"],
        ].map(([name, label, ac]) => (
          <div key={name}>
            <label className="label" htmlFor={name}>{label}</label>
            <input id={name} name={name} type="password" className="input" required autoComplete={ac} />
          </div>
        ))}
        {state?.error && <p className="alert-error">{state.error}</p>}
        {state?.ok && <p className="alert-ok">{state.ok}</p>}
        <button className="btn-primary" disabled={pending}>Enregistrer</button>
      </form>
    </div>
  );
}
