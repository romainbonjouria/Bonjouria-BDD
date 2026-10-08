import "server-only";
import { cookies } from "next/headers";
import { sql } from "./db";
import { ensureSchema } from "./schema";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, type Role } from "./session";

/** Ouvre une session (cookie signé) pour un compte et enregistre sa connexion. */
export async function openSession(user: { id: number; username: string; role: Role }) {
  const token = await signSession({ uid: user.id, role: user.role, username: user.username });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  await sql`UPDATE app_users SET last_login_at = now() WHERE id = ${user.id}`;
  // L'historique ne doit jamais empêcher une connexion
  try {
    await ensureSchema();
    await sql`INSERT INTO login_log (user_id) VALUES (${user.id})`;
  } catch (err) {
    console.error("Historique de connexion en échec", err);
  }
}
