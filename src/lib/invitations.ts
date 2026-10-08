import "server-only";
import { createHash } from "node:crypto";
import { sql } from "./db";
import { ensureSchema } from "./schema";

/** Invitation valide (non utilisée, non expirée) correspondant au jeton du lien. */
export async function findInvitation(token: string) {
  await ensureSchema();
  const hash = createHash("sha256").update(token).digest("hex");
  const [inv] = await sql<{ id: number; email: string; role: "admin" | "user"; group_id: number; group_name: string }[]>`
    SELECT i.id, i.email, i.role, i.group_id, g.name AS group_name
    FROM invitations i JOIN groups g ON g.id = i.group_id
    WHERE i.token_hash = ${hash} AND i.used_at IS NULL AND i.expires_at > now()`;
  return inv ?? null;
}
