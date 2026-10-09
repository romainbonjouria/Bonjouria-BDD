"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PERSON_FIELDS, type Person } from "@/lib/fields";
import { deletePerson, savePerson } from "../actions";

export default function PersonForm({ person, groups = [] }: { person: Person | null; groups?: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState(savePerson, undefined);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">{person ? "Modifier la fiche" : "Ajouter une personne"}</h1>
      <form action={action} className="card space-y-4">
        {person && <input type="hidden" name="id" value={person.id} />}
        {!person && groups.length > 0 && (
          <div>
            <label className="label" htmlFor="owner_group_id">Espace de destination</label>
            <select id="owner_group_id" name="owner_group_id" className="input max-w-md" defaultValue="">
              <option value="">Base commune</option>
              {groups.map((g) => <option key={g.id} value={g.id}>Espace privé — {g.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PERSON_FIELDS.map((f) => (
            <div key={f.key} className={f.key === "notes" ? "sm:col-span-2" : ""}>
              <label className="label" htmlFor={f.key}>{f.label}</label>
              {f.key === "notes" ? (
                <textarea id={f.key} name={f.key} rows={3} defaultValue={person?.[f.key] ?? ""} className="input" />
              ) : (
                <input
                  id={f.key}
                  name={f.key}
                  type={f.key === "email" ? "email" : "text"}
                  defaultValue={person?.[f.key] ?? ""}
                  className="input"
                />
              )}
            </div>
          ))}
        </div>
        {state?.error && <p className="alert-error">{state.error}</p>}
        <div className="flex gap-2">
          <button className="btn-primary" disabled={pending}>Enregistrer</button>
          <Link href="/search" className="btn-secondary">Annuler</Link>
        </div>
      </form>

      {person && (
        <form
          action={deletePerson}
          onSubmit={(e) => {
            if (!confirm("Supprimer définitivement cette fiche ?")) e.preventDefault();
          }}
          className="text-right"
        >
          <input type="hidden" name="id" value={person.id} />
          <button className="btn-danger btn-sm">Supprimer cette fiche</button>
        </form>
      )}
    </div>
  );
}
