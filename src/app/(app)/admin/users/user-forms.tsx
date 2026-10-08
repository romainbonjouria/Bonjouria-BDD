"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/session";
import {
  createUser, deleteUser, inviteUser, resetPassword, revokeInvitation, updateUser, type ActionResult,
} from "./actions";

export type GroupOption = { id: number; name: string };

function Feedback({ state }: { state: ActionResult }) {
  if (state?.error) return <p className="alert-error mt-2">{state.error}</p>;
  if (state?.ok) return <p className="alert-ok mt-2">{state.ok}</p>;
  return null;
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2">
      <input readOnly value={link} className="input py-1.5 text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn-secondary btn-sm shrink-0"
        onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
      >
        {copied ? "Copié ✓" : "Copier"}
      </button>
    </div>
  );
}

/** Invitation par email : l'admin invite dans son groupe, le super admin choisit rôle et groupe. */
export function InviteForm({ isSuper, groups }: { isSuper: boolean; groups: GroupOption[] }) {
  const [state, action, pending] = useActionState(inviteUser, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="card">
      <h2 className="mb-1 font-medium">Inviter par email</h2>
      <p className="mb-3 font-serif text-sm text-slate-500">
        La personne reçoit un lien pour créer son mot de passe{isSuper ? "" : " et rejoindre votre groupe"}. Le lien est valable 7 jours.
      </p>
      <div className={`grid grid-cols-1 gap-3 ${isSuper ? "sm:grid-cols-5" : "sm:grid-cols-3"}`}>
        <div className={isSuper ? "sm:col-span-2" : "sm:col-span-2"}>
          <label className="label" htmlFor="invite-email">Adresse email</label>
          <input id="invite-email" name="email" type="email" className="input" required placeholder="prenom.nom@societe.fr" />
        </div>
        {isSuper && (
          <>
            <div>
              <label className="label" htmlFor="invite-role">Rôle</label>
              <select id="invite-role" name="role" className="input" defaultValue="user">
                <option value="user">Utilisateur</option>
                <option value="admin">Admin du groupe</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="invite-group">Groupe (société)</label>
              <select id="invite-group" name="group_id" className="input" defaultValue="">
                <option value="">— nouvelle société —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="invite-new-group">Nouvelle société</label>
              <input id="invite-new-group" name="new_group" className="input" placeholder="Nom de la société" />
            </div>
          </>
        )}
        <div className="flex items-end">
          <button className="btn-primary w-full" disabled={pending}>{pending ? "Envoi…" : "Inviter"}</button>
        </div>
      </div>
      <Feedback state={state} />
      {state?.link && <CopyLink link={state.link} />}
    </form>
  );
}

export function RevokeInvitation({ id }: { id: number }) {
  const [state, action, pending] = useActionState(revokeInvitation, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button className="btn-secondary btn-sm" disabled={pending}>Annuler</button>
      {state?.error && <p className="alert-error mt-1">{state.error}</p>}
    </form>
  );
}

// ---------- Super admin ----------

export function CreateUserForm({ groups }: { groups: GroupOption[] }) {
  const [state, action, pending] = useActionState(createUser, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="card">
      <h2 className="mb-3 font-medium">Créer un compte avec mot de passe</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
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
            <option value="admin">Admin du groupe</option>
            <option value="super_admin">Super admin</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="new-group">Groupe</label>
          <select id="new-group" name="group_id" className="input" defaultValue="">
            <option value="">Aucun</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
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

type RowUser = {
  id: number;
  username: string;
  role: Role;
  active: boolean;
  lastLogin: string | null;
  groupId: number | null;
  groupName: string | null;
  exports6m: number;
};

export function UserRow({ user, isMe, groups }: { user: RowUser; isMe: boolean; groups: GroupOption[] }) {
  const [updState, updAction, updPending] = useActionState(updateUser, undefined);
  const [pwdState, pwdAction, pwdPending] = useActionState(resetPassword, undefined);
  const [delState, delAction, delPending] = useActionState(deleteUser, undefined);
  const pwdRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (pwdState?.ok) pwdRef.current?.reset();
  }, [pwdState]);

  return (
    <tr className={`align-top ${user.active ? "" : "bg-slate-50 text-slate-400"}`}>
      <td className="break-all px-3 py-3 font-medium">
        <Link href={`/admin/users/${user.id}`} className="text-brand hover:underline">{user.username}</Link>
        {isMe && <span className="ml-1 text-xs text-slate-400">(vous)</span>}
      </td>
      <td className="px-3 py-3">
        <form action={updAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={user.id} />
          <select name="role" defaultValue={user.role} className="input w-auto py-1" disabled={isMe}>
            <option value="user">Utilisateur</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
          </select>
          <select name="group_id" defaultValue={user.groupId ?? ""} className="input w-auto py-1">
            <option value="">Aucun groupe</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="active" defaultChecked={user.active} disabled={isMe} /> Actif
          </label>
          <button className="btn-secondary btn-sm" disabled={updPending}>Enregistrer</button>
        </form>
        <Feedback state={updState} />
      </td>
      <td className="px-3 py-3 text-slate-500">{user.lastLogin ?? "Jamais"}</td>
      <td className="px-3 py-3 text-right text-slate-500">{user.exports6m.toLocaleString("fr-FR")}</td>
      <td className="px-3 py-3">
        <form ref={pwdRef} action={pwdAction} className="flex gap-2">
          <input type="hidden" name="id" value={user.id} />
          <input name="password" type="text" minLength={8} required className="input w-32 py-1" placeholder="8 car. min." autoComplete="new-password" />
          <button className="btn-secondary btn-sm" disabled={pwdPending}>Définir</button>
        </form>
        <Feedback state={pwdState} />
      </td>
      <td className="px-3 py-3 text-right">
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

// ---------- Admin de groupe ----------

/** Ligne d'un utilisateur du groupe : l'admin peut seulement ouvrir ou fermer son accès. */
export function GroupUserRow({ user }: { user: RowUser }) {
  const [state, action, pending] = useActionState(updateUser, undefined);

  return (
    <tr className={`align-top ${user.active ? "" : "bg-slate-50 text-slate-400"}`}>
      <td className="break-all px-3 py-3 font-medium">
        <Link href={`/admin/users/${user.id}`} className="text-brand hover:underline">{user.username}</Link>
      </td>
      <td className="px-3 py-3 text-slate-500">{user.lastLogin ?? "Jamais"}</td>
      <td className="px-3 py-3 text-right text-slate-500">{user.exports6m.toLocaleString("fr-FR")}</td>
      <td className="px-3 py-3 text-right">
        <form action={action}>
          <input type="hidden" name="id" value={user.id} />
          {!user.active ? <input type="hidden" name="active" value="on" /> : null}
          <button className={user.active ? "btn-secondary btn-sm" : "btn-primary btn-sm"} disabled={pending}>
            {user.active ? "Fermer l’accès" : "Rouvrir l’accès"}
          </button>
        </form>
        <Feedback state={state} />
      </td>
    </tr>
  );
}
