import { getCurrentUser } from "@/lib/auth";
import { classifyPending, jobFamilyStats } from "@/lib/job-detect";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH = 160;

// Classe un lot d'intitulés de poste sans famille ; le navigateur rappelle jusqu'à ce qu'il n'y ait plus de progrès.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "super_admin") {
    return Response.json({ error: "Accès réservé au super admin" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const limit = Math.min(Math.max(Number(body?.limit) || 80, 1), MAX_BATCH);

  try {
    const batch = await classifyPending(limit, body?.useAi !== false);
    return Response.json({ ...batch, ...(await jobFamilyStats()) });
  } catch (err) {
    console.error("Classement des postes en échec", err);
    return Response.json({ error: "Erreur : " + (err as Error).message }, { status: 500 });
  }
}
