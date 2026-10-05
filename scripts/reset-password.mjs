// Réinitialise le mot de passe d'un compte (et le réactive), directement en base.
// Usage : npm run user:reset -- <identifiant> <nouveau-mot-de-passe> [--admin]
//   --admin : redonne aussi le rôle administrateur
import "dotenv/config";
import postgres from "postgres";
import bcrypt from "bcryptjs";

const args = process.argv.slice(2);
const makeAdmin = args.includes("--admin");
const [username, password] = args.filter((a) => a !== "--admin");

if (!username || !password) {
  console.error("Usage : npm run user:reset -- <identifiant> <nouveau-mot-de-passe> [--admin]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Le mot de passe doit faire au moins 8 caractères.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, onnotice: () => {} });
try {
  const hash = await bcrypt.hash(password, 10);
  const login = username.trim().toLowerCase();
  const rows = makeAdmin
    ? await sql`UPDATE app_users SET password_hash = ${hash}, active = true, role = 'admin' WHERE username = ${login} RETURNING username, role`
    : await sql`UPDATE app_users SET password_hash = ${hash}, active = true WHERE username = ${login} RETURNING username, role`;
  if (rows.length === 0) {
    const existing = await sql`SELECT username, role FROM app_users ORDER BY username`;
    console.error(`✘ Aucun compte « ${login} ». Comptes existants : ${existing.map((u) => `${u.username} (${u.role})`).join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`✔ Mot de passe de « ${rows[0].username} » (${rows[0].role}) réinitialisé, compte actif.`);
  }
} catch (err) {
  console.error("✘ Erreur :", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
