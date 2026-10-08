import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";
import { ensureSchema } from "./schema";
import { SESSION_COOKIE, verifySession, type Role } from "./session";

export type CurrentUser = { id: number; username: string; role: Role; hide_emails: boolean; group_id: number | null };

// Le jeton seul ne suffit pas : on revérifie en BDD que le compte existe, est actif,
// et on relit son rôle (un admin peut l'avoir modifié depuis la connexion).
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  await ensureSchema();
  const [user] = await sql<CurrentUser[]>`
    SELECT id, username, role, hide_emails, group_id FROM app_users WHERE id = ${session.uid} AND active`;
  return user ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Super admin uniquement : données de l'annuaire, groupes, rôles, visibilité des emails. */
export async function requireSuperAdmin() {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect("/search");
  return user;
}

/** Super admin ou admin de groupe : gestion des utilisateurs (dans leur périmètre). */
export async function requireManager() {
  const user = await requireUser();
  if (user.role === "user") redirect("/search");
  return user;
}
