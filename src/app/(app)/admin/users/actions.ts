"use server";

import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireManager, requireSuperAdmin, type CurrentUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { sendInvitationEmail } from "@/lib/mailer";
import { userQuotaError } from "@/lib/quotas";
import { ensureSchema } from "@/lib/schema";
import type { Role } from "@/lib/session";

export type ActionResult = { ok?: string; error?: string; link?: string } | undefined;

const USERNAME_RE = /^[a-z0-9._@+-]{3,100}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
const INVITE_DAYS = 7;

const ROLES: Role[] = ["super_admin", "admin", "user"];
const parseRole = (v: FormDataEntryValue | null): Role => (ROLES.includes(v as Role) ? (v as Role) : "user");

function done(ok: string): ActionResult {
  revalidatePath("/admin/users");
  return { ok };
}

type Target = { id: number; role: Role; group_id: number | null };

/** Compte ciblé, seulement s'il est dans le périmètre de l'appelant (admin : utilisateurs de son groupe). */
async function manageable(me: CurrentUser, id: number): Promise<Target | null> {
  if (!Number.isInteger(id)) return null;
  const [t] = await sql<Target[]>`SELECT id, role, group_id FROM app_users WHERE id = ${id}`;
  if (!t) return null;
  if (me.role === "super_admin") return t;
  return t.role === "user" && t.id !== me.id && t.group_id !== null && t.group_id === me.group_id ? t : null;
}

const groupOrNull = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// ---------- Comptes (super admin) ----------

export async function createUser(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const username = String(fd.get("username") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const role = parseRole(fd.get("role"));
  const groupId = groupOrNull(fd.get("group_id"));

  if (!USERNAME_RE.test(username)) {
    return { error: "Identifiant : 3 à 100 caractères parmi a-z, 0-9, point, tiret, underscore, @." };
  }
  if (password.length < MIN_PASSWORD) return { error: `Mot de passe : ${MIN_PASSWORD} caractères minimum.` };
  if (role === "admin" && !groupId) return { error: "Un admin doit appartenir à un groupe." };
  if (groupId) {
    const quotaError = await userQuotaError(groupId);
    if (quotaError) return { error: quotaError };
  }

  const hash = await bcrypt.hash(password, 10);
  const [row] = await sql`
    INSERT INTO app_users (username, password_hash, role, group_id) VALUES (${username}, ${hash}, ${role}, ${groupId})
    ON CONFLICT (username) DO NOTHING RETURNING id`;
  if (!row) return { error: `L’identifiant « ${username} » existe déjà.` };
  return done(`Compte « ${username} » créé.`);
}

export async function updateUser(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await requireManager();
  const id = Number(fd.get("id"));
  const target = await manageable(me, id);
  if (!target) return { error: "Compte introuvable ou hors de votre périmètre." };
  const active = fd.get("active") === "on";

  // Un admin de groupe ne peut qu'ouvrir ou fermer l'accès de ses utilisateurs
  if (me.role !== "super_admin") {
    await sql`UPDATE app_users SET active = ${active} WHERE id = ${id}`;
    return done(active ? "Accès ouvert." : "Accès fermé.");
  }

  const role = parseRole(fd.get("role"));
  const groupId = groupOrNull(fd.get("group_id"));
  if (id === me.id && (role !== "super_admin" || !active)) {
    return { error: "Vous ne pouvez pas retirer vos propres droits ni désactiver votre compte." };
  }
  if (role === "admin" && !groupId) return { error: "Un admin doit appartenir à un groupe." };
  await sql`UPDATE app_users SET role = ${role}, active = ${active}, group_id = ${groupId} WHERE id = ${id}`;
  return done("Modifications enregistrées.");
}

export async function resetPassword(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = Number(fd.get("id"));
  const password = String(fd.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `Mot de passe : ${MIN_PASSWORD} caractères minimum.` };

  const hash = await bcrypt.hash(password, 10);
  await sql`UPDATE app_users SET password_hash = ${hash} WHERE id = ${id}`;
  return done("Mot de passe réinitialisé.");
}

export async function setEmailAccess(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return { error: "Utilisateur invalide." };
  const hide = fd.get("hide_emails") === "on";
  await ensureSchema();
  await sql`UPDATE app_users SET hide_emails = ${hide} WHERE id = ${id}`;
  revalidatePath(`/admin/users/${id}`);
  return { ok: hide ? "Emails masqués pour cet utilisateur." : "Emails visibles pour cet utilisateur." };
}

export async function deleteUser(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  const id = Number(fd.get("id"));
  if (id === me.id) return { error: "Vous ne pouvez pas supprimer votre propre compte." };
  await sql`DELETE FROM app_users WHERE id = ${id}`;
  return done("Compte supprimé.");
}

// ---------- Invitations ----------

async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Invite une personne par email. Admin : uniquement des utilisateurs de son groupe.
 * Super admin : admins ou utilisateurs, dans un groupe existant ou nouveau.
 */
export async function inviteUser(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await requireManager();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 100) return { error: "Adresse email invalide." };

  let role: Role = "user";
  let groupId: number | null;
  if (me.role === "super_admin") {
    role = fd.get("role") === "admin" ? "admin" : "user";
    const newName = String(fd.get("new_group") ?? "").trim().slice(0, 100);
    if (newName) {
      const [g] = await sql<{ id: number }[]>`
        INSERT INTO groups (name) VALUES (${newName})
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
      groupId = g.id;
    } else {
      groupId = groupOrNull(fd.get("group_id"));
    }
    if (!groupId) return { error: "Choisissez un groupe ou saisissez le nom d'une nouvelle société." };
  } else {
    groupId = me.group_id;
    if (!groupId) return { error: "Votre compte n'est rattaché à aucun groupe." };
  }

  const quotaError = await userQuotaError(groupId);
  if (quotaError) return { error: quotaError };

  const [existing] = await sql`SELECT 1 FROM app_users WHERE username = ${email}`;
  if (existing) return { error: `Un compte existe déjà pour ${email}.` };

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await sql`DELETE FROM invitations WHERE email = ${email} AND used_at IS NULL`;
  await sql`
    INSERT INTO invitations (email, role, group_id, token_hash, invited_by, expires_at)
    VALUES (${email}, ${role}, ${groupId}, ${tokenHash}, ${me.id}, now() + ${`${INVITE_DAYS} days`}::interval)`;

  const link = `${await appOrigin()}/invite/${token}`;
  const [group] = await sql<{ name: string }[]>`SELECT name FROM groups WHERE id = ${groupId}`;
  const sent = await sendInvitationEmail({ to: email, link, groupName: group.name, inviter: me.username });

  revalidatePath("/admin/users");
  return sent
    ? { ok: `Invitation envoyée à ${email}.` }
    : { ok: `Invitation créée pour ${email}. Transmettez-lui ce lien (valable ${INVITE_DAYS} jours) :`, link };
}

/** Nouveau lien (et nouvel email) pour une invitation en attente ; l'ancien lien cesse de fonctionner. */
export async function resendInvitation(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await requireManager();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return { error: "Invitation invalide." };

  const [inv] = await sql<{ id: number; email: string; group_id: number; group_name: string }[]>`
    SELECT i.id, i.email, i.group_id, g.name AS group_name FROM invitations i JOIN groups g ON g.id = i.group_id
    WHERE i.id = ${id} AND i.used_at IS NULL ${me.role === "super_admin" ? sql`` : sql`AND i.group_id = ${me.group_id ?? 0}`}`;
  if (!inv) return { error: "Invitation introuvable ou déjà utilisée." };

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await sql`
    UPDATE invitations SET token_hash = ${tokenHash}, created_at = now(), invited_by = ${me.id},
      expires_at = now() + ${`${INVITE_DAYS} days`}::interval
    WHERE id = ${inv.id}`;

  const link = `${await appOrigin()}/invite/${token}`;
  const sent = await sendInvitationEmail({ to: inv.email, link, groupName: inv.group_name, inviter: me.username });

  revalidatePath("/admin/users");
  return sent
    ? { ok: `Invitation renvoyée à ${inv.email}.` }
    : { ok: `Nouveau lien pour ${inv.email} (valable ${INVITE_DAYS} jours) :`, link };
}

// ---------- Quotas (super admin) ----------

const quotaValue = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

export async function setGroupQuota(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = Number(fd.get("id"));
  const maxUsers = quotaValue(fd.get("max_users"));
  const maxExports = quotaValue(fd.get("max_exports_month"));
  if (!Number.isInteger(id)) return { error: "Groupe invalide." };
  if (Number.isNaN(maxUsers) || Number.isNaN(maxExports)) return { error: "Quotas : nombres entiers positifs, ou vide pour illimité." };
  const sharedAccess = fd.get("shared_access") === "on";
  await sql`
    UPDATE groups SET max_users = ${maxUsers}, max_exports_month = ${maxExports}, shared_access = ${sharedAccess}
    WHERE id = ${id}`;
  return done("Réglages du groupe enregistrés.");
}

/** Crée une société (groupe) en choisissant si elle accède à la base commune ou seulement à son espace privé. */
export async function createGroup(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const name = String(fd.get("name") ?? "").trim().slice(0, 100);
  if (!name) return { error: "Saisissez le nom de la société." };
  const sharedAccess = fd.get("shared_access") === "on";
  const [row] = await sql`
    INSERT INTO groups (name, shared_access) VALUES (${name}, ${sharedAccess})
    ON CONFLICT (name) DO NOTHING RETURNING id`;
  if (!row) return { error: `La société « ${name} » existe déjà.` };
  return done(`Société « ${name} » créée.`);
}

export async function revokeInvitation(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await requireManager();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return { error: "Invitation invalide." };
  if (me.role === "super_admin") await sql`DELETE FROM invitations WHERE id = ${id} AND used_at IS NULL`;
  else await sql`DELETE FROM invitations WHERE id = ${id} AND used_at IS NULL AND group_id = ${me.group_id}`;
  return done("Invitation annulée.");
}
