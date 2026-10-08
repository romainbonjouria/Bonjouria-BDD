import { getCurrentUser } from "@/lib/auth";
import { classifyTitles, refreshJobFamilies } from "@/lib/job-detect";
import { upsertPeople, type ImportRow } from "@/lib/people";
import { companyKey, detectSectors, emailDomain } from "@/lib/sector-detect";

export const dynamic = "force-dynamic";
// La détection de secteur (registre + IA) peut prendre plusieurs secondes par lot
export const maxDuration = 60;

const MAX_ROWS_PER_REQUEST = 1000;

const str = (v: unknown) => (v == null ? "" : String(v).trim());

// Reçoit un lot de lignes déjà découpées/mappées par le navigateur (voir admin/import).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") {
    return Response.json({ error: "Accès réservé au super admin" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rawRows: unknown = body?.rows;
  if (!Array.isArray(rawRows) || rawRows.length > MAX_ROWS_PER_REQUEST) {
    return Response.json({ error: `Lot invalide (1 à ${MAX_ROWS_PER_REQUEST} lignes)` }, { status: 400 });
  }
  const rows = rawRows.filter((r): r is ImportRow => !!r && typeof r === "object");

  // Détection du secteur pour les lignes qui n'en ont pas mais ont une société
  const detected = { registre: 0, ia: 0, cache: 0, introuvable: 0 };
  if (body?.detectSector === true) {
    const targets = rows.filter((r) => !str(r.sector) && str(r.company));
    if (targets.length) {
      try {
        const sectors = await detectSectors(
          targets.map((r) => ({
            company: str(r.company),
            emailDomain: emailDomain(str(r.email)),
            jobTitle: str(r.job_title) || null,
          })),
        );
        for (const r of targets) {
          const found = sectors.get(companyKey(str(r.company)));
          if (found?.sector) {
            r.sector = found.sector;
            detected[found.source]++;
          } else {
            detected.introuvable++;
          }
        }
      } catch (err) {
        // La détection ne doit jamais bloquer l'import
        console.error("Détection de secteur en échec", err);
        detected.introuvable += targets.length;
      }
    }
  }

  try {
    const result = await upsertPeople(rows);
    // Familles de métiers : ne doit jamais bloquer l'import (rattrapable depuis « Familles de métiers »)
    try {
      await classifyTitles(rows.map((r) => str(r.job_title)).filter(Boolean), body?.detectSector === true);
      await refreshJobFamilies();
    } catch (err) {
      console.error("Classement des postes en échec", err);
    }
    return Response.json({ ...result, detected });
  } catch (err) {
    console.error("Import error", err);
    return Response.json({ error: "Erreur base de données : " + (err as Error).message }, { status: 500 });
  }
}
