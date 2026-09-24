import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

// Diagnostic de configuration (public) : n'expose aucun secret, seulement des états et codes d'erreur.
export async function GET() {
  const url = process.env.DATABASE_URL ?? "";
  let host: string | null = null;
  let port: string | null = null;
  try {
    const u = new URL(url);
    host = u.hostname;
    port = u.port;
  } catch {}

  const checks = {
    database_url: url ? (host ? "présente" : "présente mais invalide (format d'URL)") : "ABSENTE",
    database_host: host,
    database_port: port,
    auth_secret: !process.env.AUTH_SECRET
      ? "ABSENTE"
      : process.env.AUTH_SECRET.length < 32
        ? "trop courte (32 caractères min.)"
        : "ok",
    database: "non testée",
    tables: "non testées",
  };

  if (host) {
    try {
      await Promise.race([
        sql`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("délai dépassé (10 s)")), 10_000)),
      ]);
      checks.database = "ok";
      const [{ users }] = await sql<{ users: number }[]>`SELECT count(*)::int AS users FROM app_users`;
      checks.tables = `ok (${users} compte(s))`;
    } catch (err) {
      const e = err as { code?: string; message?: string };
      checks.database = checks.database === "ok" ? "ok" : `ERREUR ${e.code ?? ""} ${e.message ?? ""}`.trim();
      if (checks.database === "ok") checks.tables = `ERREUR ${e.code ?? ""} ${e.message ?? ""}`.trim();
    }
  }

  const ok = checks.database === "ok" && checks.auth_secret === "ok" && checks.tables.startsWith("ok");
  return Response.json({ ok, ...checks }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
