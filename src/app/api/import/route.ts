import { getCurrentUser } from "@/lib/auth";
import { upsertPeople, type ImportRow } from "@/lib/people";

export const dynamic = "force-dynamic";

const MAX_ROWS_PER_REQUEST = 1000;

// Reçoit un lot de lignes déjà découpées/mappées par le navigateur (voir admin/import).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Accès réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rows: unknown = body?.rows;
  if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_REQUEST) {
    return Response.json({ error: `Lot invalide (1 à ${MAX_ROWS_PER_REQUEST} lignes)` }, { status: 400 });
  }

  try {
    const result = await upsertPeople(rows.filter((r): r is ImportRow => !!r && typeof r === "object"));
    return Response.json(result);
  } catch (err) {
    console.error("Import error", err);
    return Response.json({ error: "Erreur base de données : " + (err as Error).message }, { status: 500 });
  }
}
