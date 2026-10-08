"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { openSession } from "@/lib/login-session";
import { findInvitation } from "@/lib/invitations";
import type { Role } from "@/lib/session";

export async function acceptInvitation(_prev: { error?: string } | undefined, fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return { error: "Mot de passe : 8 caractères minimum." };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "Les deux mots de passe ne correspondent pas." };

  const inv = await findInvitation(token);
  if (!inv) return { error: "Cette invitation n'est plus valide. Demandez-en une nouvelle." };

  const hash = await bcrypt.hash(password, 10);
  // Pas de sql.begin : la connexion (pooler Supabase, max_pipeline: 0) n'autorise pas les transactions.
  // On réserve d'abord l'invitation (usage unique), puis on la libère si la création échoue.
  const claimed = await sql`UPDATE invitations SET used_at = now() WHERE id = ${inv.id} AND used_at IS NULL RETURNING id`;
  if (claimed.length === 0) return { error: "Cette invitation a déjà été utilisée." };

  let user: { id: number; username: string; role: Role } | undefined;
  try {
    [user] = await sql<{ id: number; username: string; role: Role }[]>`
      INSERT INTO app_users (username, password_hash, role, group_id)
      VALUES (${inv.email}, ${hash}, ${inv.role}, ${inv.group_id})
      ON CONFLICT (username) DO NOTHING RETURNING id, username, role`;
  } catch (err) {
    console.error("Création du compte invité en échec", err);
  }
  if (!user) {
    await sql`UPDATE invitations SET used_at = NULL WHERE id = ${inv.id}`;
    return { error: "Impossible de créer le compte : un compte existe déjà pour cette adresse, ou une erreur est survenue." };
  }

  await openSession(user);
  redirect("/search");
}
