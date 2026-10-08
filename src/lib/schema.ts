import "server-only";
import { sql } from "./db";

let ready: Promise<unknown> | null = null;

/** Applique à la volée les ajouts de schéma récents (idempotent, une fois par processus). */
export function ensureSchema() {
  ready ??= migrate().catch((err) => {
    ready = null; // réessaiera à la requête suivante
    throw err;
  });
  return ready;
}

async function migrate() {
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

  // Groupes (sociétés clientes) et invitations par email
  await sql`
    CREATE TABLE IF NOT EXISTS groups (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await sql`ALTER TABLE groups ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL`;
  await sql`
    CREATE TABLE IF NOT EXISTS invitations (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL,
      role       TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      invited_by INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ
    )`;
  await sql`ALTER TABLE invitations ENABLE ROW LEVEL SECURITY`;

  // Rôles : super_admin / admin / user
  const constraints = await sql<{ conname: string; def: string }[]>`
    SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'app_users'::regclass AND contype = 'c'`;
  const roleCheck = constraints.find((c) => c.def.includes("role"));
  if (!roleCheck?.def.includes("super_admin")) {
    if (roleCheck) await sql`ALTER TABLE app_users DROP CONSTRAINT ${sql(roleCheck.conname)}`;
    await sql`ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('super_admin', 'admin', 'user'))`;
  }
  // Les anciens administrateurs (sans groupe) deviennent super admins
  await sql`UPDATE app_users SET role = 'super_admin' WHERE role = 'admin' AND group_id IS NULL`;
}
