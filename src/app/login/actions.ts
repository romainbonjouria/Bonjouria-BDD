"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, type Role } from "@/lib/session";

// Hash factice : permet de garder un temps de réponse constant si l'identifiant n'existe pas
const DUMMY_HASH = bcrypt.hashSync("dummy-password", 10);

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Identifiant et mot de passe requis." };

  const [user] = await sql<{ id: number; username: string; role: Role; password_hash: string; active: boolean }[]>`
    SELECT id, username, role, password_hash, active FROM app_users WHERE username = ${username}`;

  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) return { error: "Identifiant ou mot de passe incorrect." };
  if (!user.active) return { error: "Ce compte est désactivé. Contactez un administrateur." };

  const token = await signSession({ uid: user.id, role: user.role, username: user.username });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  await sql`UPDATE app_users SET last_login_at = now() WHERE id = ${user.id}`;

  redirect("/search");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
