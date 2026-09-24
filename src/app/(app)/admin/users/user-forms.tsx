"use client";

import { useActionState, useEffect, useRef } from "react";
import type { Role } from "@/lib/session";
import { createUser, deleteUser, resetPassword, updateUser, type ActionResult } from "./actions";

function Feedback({ state }: { state: ActionResult }) {
  if (state?.error) return <p className="alert-error mt-2">{state.error}</p>;
  if (state?.ok) return <p className="alert-ok mt-2">{state.ok}</p>;
  return null;
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="card">
      <h2 className="mb-3 font-medium">Créer un compte</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="new-username">Identifiant</label>
          <input id="new-username" name="username" className="input" required autoComplete="off" placeholder="prenom.nom" />
        </div>
        <div>
          <label className="label" htmlFor="new-password">Mot de passe (8 car. min.)</label>
          <input id="new-password" name="password" type="text" className="input" required minLength={8} autoComplete="new-password" />
        </div>
        <div>
          <label className="label" htmlFor="new-role">Rôle</label>
          <select id="new-role" name="role" className="input" defaultValue="user">
            <option value="user">Utilisateur</option>
            <option value="admin">Administrateur</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" disabled={pending}>Créer</button>
        </div>
      </div>
      <Feedback state={state} />
    </form>
  );
}

type Props = {
  user: { id: number; username: string; role: Role; active: boolean; lastLogin: string | null };
  isMe: boolean;
};

export function UserRow({ user, isMe }: Props) {
  const [updState, updAction, updPending] = useActionState(updateUser, undefined);
  const [pwdState, pwdAction, pwdPending] = useActionState(resetPassword, undefined);
  const [delState, delAction, delPending] = useActionState(deleteUser, undefined);
  const pwdRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (pwdState?.ok) pwdRef.current?.reset();
  }, [pwdState]);

  return (
    <tr className={`align-top ${user.active ? "" : "bg-slate-50 text-slate-400"}`}>
      <td className="px-3 py-2 font-medium">
        {user.username}
        {isMe && <span className="ml-1 text-xs text-slate-400">(vous)</span>}
      </td>
      <td className="px-3 py-2">
        <form action={updAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={user.id} />
          <select name="role" defaultValue={user.role} className="input w-auto py-1" disabled={isMe}>
            <option value="user">Utilisateur</option>
            <option value="admin">Administrateur</option>
          </select>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="active" defaultChecked={user.active} disabled={isMe} /> Actif
          </label>
          {!isMe && <button className="btn-secondary btn-sm" disabled={updPending}>Enregistrer</button>}
        </form>
        <Feedback state={updState} />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{user.lastLogin ?? "Jamais"}</td>
      <td className="px-3 py-2">
        <form ref={pwdRef} action={pwdAction} className="flex gap-2">
          <input type="hidden" name="id" value={user.id} />
          <input name="password" type="text" minLength={8} required className="input w-40 py-1" placeholder="8 car. min." autoComplete="new-password" />
          <button className="btn-secondary btn-sm" disabled={pwdPending}>Définir</button>
        </form>
        <Feedback state={pwdState} />
      </td>
      <td className="px-3 py-2 text-right">
        {!isMe && (
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!confirm(`Supprimer définitivement le compte « ${user.username} » ?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={user.id} />
            <button className="btn-danger btn-sm" disabled={delPending}>Supprimer</button>
          </form>
        )}
        <Feedback state={delState} />
      </td>
    </tr>
  );
}
