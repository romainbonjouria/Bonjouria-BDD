import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";
import { SESSION_COOKIE, verifySession, type Role } from "./session";

export type CurrentUser = { id: number; username: string; role: Role };

// Le jeton seul ne suffit pas : on revérifie en BDD que le compte existe, est actif,
// et on relit son rôle (un admin peut l'avoir modifié depuis la connexion).
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  const [user] = await sql<CurrentUser[]>`
    SELECT id, username, role FROM app_users WHERE id = ${session.uid} AND active`;
  return user ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/search");
  return user;
}
