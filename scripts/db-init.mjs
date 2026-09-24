// Crée les tables et le premier compte administrateur.
// Usage : npm run db:init   (lit DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD dans .env)
import "dotenv/config";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import bcrypt from "bcryptjs";

const { DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
if (!DATABASE_URL) {
  console.error("DATABASE_URL manquant dans .env");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, onnotice: () => {} });

try {
  const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  await sql.unsafe(schema);
  console.log("✔ Schéma appliqué");

  if (ADMIN_USERNAME && ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const [row] = await sql`
      INSERT INTO app_users (username, password_hash, role)
      VALUES (${ADMIN_USERNAME.trim().toLowerCase()}, ${hash}, 'admin')
      ON CONFLICT (username) DO NOTHING
      RETURNING id`;
    console.log(row ? `✔ Admin "${ADMIN_USERNAME}" créé` : `• Admin "${ADMIN_USERNAME}" existe déjà (inchangé)`);
  } else {
    console.log("• ADMIN_USERNAME / ADMIN_PASSWORD absents : aucun admin créé");
  }
} catch (err) {
  console.error("✘ Erreur :", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
