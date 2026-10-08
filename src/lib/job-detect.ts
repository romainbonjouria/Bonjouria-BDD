import "server-only";
import { classifyWithEnum } from "./ai-classify";
import { sql } from "./db";
import { familyFromRules, JOB_FAMILIES, titleKey } from "./job-families";
import { aiProvider } from "./sector-detect";

/**
 * Familles de métiers : chaque intitulé de poste (clé normalisée) est classé une seule fois
 * (règles par mots-clés, puis IA pour le reste) dans `job_families` ; `people.job_family`
 * est ensuite recopié depuis cette table.
 */

// Même normalisation que titleKey() côté JS
const KEY_SQL = sql`trim(regexp_replace(lower(unaccent(job_title)), '[^a-z0-9]+', ' ', 'g'))`;

const AI_BATCH = 80;
const PENDING_MAX = 20_000;
const SYSTEM_PROMPT = `Tu regroupes des intitulés de poste (français ou anglais) d'un annuaire professionnel en familles de métiers.
Choisis pour chaque intitulé la famille la plus pertinente dans la liste imposée. Un plombier, un peintre en bâtiment ou un électricien relèvent de « BTP, Artisanat & Métiers manuels ».
Réponds « Autre » si l'intitulé est trop vague ou ne correspond à aucune famille.`;

/** Classe les intitulés pas encore connus. Sans IA (`useAi` faux), seuls ceux couverts par les règles sont classés. */
export async function classifyTitles(titles: string[], useAi: boolean, aiLimit = Infinity) {
  const byKey = new Map<string, string>();
  for (const t of titles) {
    const key = titleKey(t);
    if (key && !byKey.has(key)) byKey.set(key, t);
  }
  const stats = { regle: 0, ia: 0, nonClasses: 0 };
  if (byKey.size === 0) return stats;

  const known = await sql<{ title_key: string }[]>`
    SELECT title_key FROM job_families WHERE title_key IN ${sql([...byKey.keys()])}`;
  for (const k of known) byKey.delete(k.title_key);

  const rows: { title_key: string; family: string; source: string }[] = [];
  const forAi: [string, string][] = [];
  for (const [key, title] of byKey) {
    const family = familyFromRules(title);
    if (family) {
      rows.push({ title_key: key, family, source: "regle" });
      stats.regle++;
    } else {
      forAi.push([key, title]);
    }
  }

  if (useAi && aiProvider()) {
    const todo = forAi.slice(0, aiLimit);
    stats.nonClasses += forAi.length - todo.length;
    for (let i = 0; i < todo.length; i += AI_BATCH) {
      const batch = todo.slice(i, i + AI_BATCH);
      const results = await classifyWithEnum({ system: SYSTEM_PROMPT, items: batch.map(([, t]) => t), values: JOB_FAMILIES });
      batch.forEach(([key], j) => {
        if (results[j]) {
          rows.push({ title_key: key, family: results[j]!, source: "ia" });
          stats.ia++;
        } else {
          stats.nonClasses++;
        }
      });
    }
  } else {
    stats.nonClasses = forAi.length;
  }

  if (rows.length) {
    await sql`INSERT INTO job_families ${sql(rows, ["title_key", "family", "source"])} ON CONFLICT (title_key) DO NOTHING`;
  }
  return stats;
}

/** Recopie la famille de chaque fiche depuis la table de correspondance (seulement ce qui change). */
export async function refreshJobFamilies() {
  const res = await sql`
    UPDATE people SET job_family = (SELECT family FROM job_families WHERE title_key = ${KEY_SQL})
    WHERE job_family IS DISTINCT FROM (SELECT family FROM job_families WHERE title_key = ${KEY_SQL})`;
  return res.count;
}

/** Classe un lot d'intitulés présents en base mais encore sans famille. */
export async function classifyPending(limit: number, useAi: boolean) {
  const pending = await sql<{ title: string }[]>`
    SELECT min(job_title) AS title FROM people
    WHERE job_title IS NOT NULL AND ${KEY_SQL} <> ''
      AND NOT EXISTS (SELECT 1 FROM job_families jf WHERE jf.title_key = ${KEY_SQL})
    GROUP BY ${KEY_SQL} LIMIT ${PENDING_MAX}`;
  // Les règles s'appliquent à tous les intitulés en attente ; l'IA ne traite qu'un lot à la fois
  const stats = await classifyTitles(pending.map((p) => p.title), useAi, limit);
  await refreshJobFamilies();
  return { ...stats, traites: pending.length };
}

export async function jobFamilyStats() {
  const [[counts], [unmapped]] = await Promise.all([
    sql<{ total: number; classees: number }[]>`
      SELECT count(*) FILTER (WHERE job_title IS NOT NULL)::int AS total,
             count(job_family)::int AS classees FROM people`,
    sql<{ n: number }[]>`
      SELECT count(DISTINCT ${KEY_SQL})::int AS n FROM people
      WHERE job_title IS NOT NULL AND ${KEY_SQL} <> ''
        AND NOT EXISTS (SELECT 1 FROM job_families jf WHERE jf.title_key = ${KEY_SQL})`,
  ]);
  return { total: counts.total, classees: counts.classees, intitulesRestants: unmapped.n };
}
