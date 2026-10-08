import { requireSuperAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { jobFamilyStats } from "@/lib/job-detect";
import { aiProvider } from "@/lib/sector-detect";
import ClassifyForm from "./classify-form";

export default async function JobFamiliesPage() {
  await requireSuperAdmin();
  const [stats, families] = await Promise.all([
    jobFamilyStats(),
    sql<{ family: string; n: number }[]>`
      SELECT job_family AS family, count(*)::int AS n FROM people
      WHERE job_family IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl">Familles de métiers</h1>
        <p className="mt-1 max-w-2xl font-serif text-sm text-slate-500">
          Regroupe les intitulés de poste libres (« Plombier », « Plombier chauffagiste »…) en familles de métiers, pour filtrer
          sans lister des centaines de postes. Les intitulés courants sont reconnus par des règles ; l’IA classe les autres.
          Les nouveaux imports et les fiches modifiées sont classés automatiquement.
        </p>
      </div>

      <ClassifyForm initial={stats} aiAvailable={aiProvider() !== null} />

      <div className="card">
        <h2 className="mb-3 font-medium">Répartition actuelle</h2>
        {families.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune fiche classée pour le moment.</p>
        ) : (
          <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {families.map((f) => (
              <li key={f.family} className="flex justify-between border-b border-slate-100 py-1.5">
                <span>{f.family}</span>
                <span className="font-medium">{f.n.toLocaleString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
