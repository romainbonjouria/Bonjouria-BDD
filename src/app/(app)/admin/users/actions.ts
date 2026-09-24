"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

export type ActionResult = { ok?: string; error?: string } | undefined;

const USERNAME_RE = /^[a-z0-9._-]{3,50}$/;
const MIN_PASSWORD = 8;

function done(ok: string): ActionResult {
  revalidatePath("/admin/users");
  return { ok };
}

export async function createUser(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const username = String(fd.get("username") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const role = fd.get("role") === "admin" ? "admin" : "user";

  if (!USERNAME_RE.test(username)) {
    return { error: "Identifiant : 3 à 50 caractères parmi a-z, 0-9, point, tiret, underscore." };
  }
  if (password.length < MIN_PASSWORD) return { error: `Mot de passe : ${MIN_PASSWORD} caractères minimum.` };

  const hash = await bcrypt.hash(password, 10);
  const [row] = await sql`
    INSERT INTO app_users (username, password_hash, role) VALUES (${username}, ${hash}, ${role})
    ON CONFLICT (username) DO NOTHING RETURNING id`;
  if (!row) return { error: `L’identifiant « ${username} » existe déjà.` };
  return done(`Compte « ${username} » créé.`);
}

export async function updateUser(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const id = Number(fd.get("id"));
  const role = fd.get("role") === "admin" ? "admin" : "user";
  const active = fd.get("active") === "on";

  if (id === me.id && (role !== "admin" || !active)) {
    return { error: "Vous ne pouvez pas retirer vos propres droits admin ni désactiver votre compte." };
  }
  await sql`UPDATE app_users SET role = ${role}, active = ${active} WHERE id = ${id}`;
  return done("Modifications enregistrées.");
}

export async function resetPassword(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const password = String(fd.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `Mot de passe : ${MIN_PASSWORD} caractères minimum.` };

  const hash = await bcrypt.hash(password, 10);
  await sql`UPDATE app_users SET password_hash = ${hash} WHERE id = ${id}`;
  return done("Mot de passe réinitialisé.");
}

export async function deleteUser(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const id = Number(fd.get("id"));
  if (id === me.id) return { error: "Vous ne pouvez pas supprimer votre propre compte." };
  await sql`DELETE FROM app_users WHERE id = ${id}`;
  return done("Compte supprimé.");
}
