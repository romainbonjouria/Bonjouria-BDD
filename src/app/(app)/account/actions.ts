"use server";

import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";

export type AccountResult = { ok?: string; error?: string } | undefined;

export async function changePassword(_prev: AccountResult, fd: FormData): Promise<AccountResult> {
  const me = await requireUser();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const confirm = String(fd.get("confirm") ?? "");

  if (next.length < 8) return { error: "Le nouveau mot de passe doit faire 8 caractères minimum." };
  if (next !== confirm) return { error: "La confirmation ne correspond pas." };

  const [row] = await sql<{ password_hash: string }[]>`SELECT password_hash FROM app_users WHERE id = ${me.id}`;
  if (!row || !(await bcrypt.compare(current, row.password_hash))) {
    return { error: "Mot de passe actuel incorrect." };
  }
  await sql`UPDATE app_users SET password_hash = ${await bcrypt.hash(next, 10)} WHERE id = ${me.id}`;
  return { ok: "Mot de passe modifié." };
}
