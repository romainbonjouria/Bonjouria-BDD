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
  const user = await sql.begin(async (tx) => {
    // Marque l'invitation comme utilisée en premier : une seule personne peut l'utiliser
    const claimed = await tx`UPDATE invitations SET used_at = now() WHERE id = ${inv.id} AND used_at IS NULL RETURNING id`;
    if (claimed.length === 0) return null;
    const [u] = await tx<{ id: number; username: string; role: Role }[]>`
      INSERT INTO app_users (username, password_hash, role, group_id)
      VALUES (${inv.email}, ${hash}, ${inv.role}, ${inv.group_id})
      ON CONFLICT (username) DO NOTHING RETURNING id, username, role`;
    if (!u) throw new Error("exists");
    return u;
  }).catch(() => null);
  if (!user) return { error: "Impossible de créer le compte (invitation déjà utilisée ou compte existant)." };

  await openSession(user);
  redirect("/search");
}
