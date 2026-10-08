"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { openSession } from "@/lib/login-session";
import { SESSION_COOKIE, type Role } from "@/lib/session";

// Hash factice : permet de garder un temps de réponse constant si l'identifiant n'existe pas
const DUMMY_HASH = bcrypt.hashSync("dummy-password", 10);

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Identifiant et mot de passe requis." };

  let user: { id: number; username: string; role: Role; password_hash: string; active: boolean } | undefined;
  try {
    [user] = await sql<NonNullable<typeof user>[]>`
      SELECT id, username, role, password_hash, active FROM app_users WHERE username = ${username}`;
  } catch (err) {
    console.error("Login: base de données injoignable", err);
    return { error: "Base de données injoignable. Vérifiez la configuration (voir /api/health)." };
  }

  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) return { error: "Identifiant ou mot de passe incorrect." };
  if (!user.active) return { error: "Ce compte est désactivé. Contactez un administrateur." };

  await openSession(user);

  redirect("/search");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
