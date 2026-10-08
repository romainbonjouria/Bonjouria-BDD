import "server-only";
import { sql } from "./db";

let ready: Promise<unknown> | null = null;

/** Applique à la volée les ajouts de schéma récents (idempotent, une fois par processus). */
export function ensureSchema() {
  ready ??= (async () => {
    await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS hide_emails BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`
      CREATE TABLE IF NOT EXISTS export_log (
        id          BIGSERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        row_count   INTEGER NOT NULL,
        filters     TEXT
      )`;
    await sql`CREATE INDEX IF NOT EXISTS export_log_user_idx ON export_log (user_id, exported_at DESC)`;
    await sql`ALTER TABLE export_log ENABLE ROW LEVEL SECURITY`;
  })().catch((err) => {
    ready = null; // réessaiera à la requête suivante
    throw err;
  });
  return ready;
}
