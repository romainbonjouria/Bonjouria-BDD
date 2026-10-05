import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { sql } from "./db";
import { SECTORS, sectorFromNaf, type Sector } from "./sectors";

/**
 * Détection du secteur d'une société à partir de son nom :
 *  1. cache en base (une société n'est classée qu'une fois) ;
 *  2. registre officiel (API Recherche d'entreprises) si le nom correspond exactement
 *     et que le code NAF est assez précis ;
 *  3. sinon une IA (Claude si ANTHROPIC_API_KEY, sinon OpenAI si OPENAI_API_KEY),
 *     avec les candidats du registre comme indices.
 */

export type SectorSource = "cache" | "registre" | "ia";
export type CompanyInput = { company: string; emailDomain?: string | null; jobTitle?: string | null };
// staff : tranche d'effectif INSEE (ex. 53 = 5 000 à 9 999 salariés), -1 si aucun salarié / inconnu
type Candidate = { name: string; naf: string | null; establishments: number; staff: number };

const REGISTRY_URL = "https://recherche-entreprises.api.gouv.fr/search";
const REGISTRY_CONCURRENCY = 4; // limite de l'API : 7 requêtes / seconde
const AI_BATCH = 60;
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.fr", "yahoo.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr",
  "live.fr", "orange.fr", "free.fr", "sfr.fr", "laposte.net", "wanadoo.fr", "icloud.com", "me.com",
]);

export function companyKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function emailDomain(email: string | null | undefined) {
  const d = email?.split("@")[1]?.trim().toLowerCase();
  return d && !GENERIC_EMAIL_DOMAINS.has(d) ? d : null;
}

let tableReady: Promise<unknown> | null = null;
function ensureTable() {
  tableReady ??= sql`
    CREATE TABLE IF NOT EXISTS company_sectors (
      company_key TEXT PRIMARY KEY,
      sector      TEXT,
      source      TEXT NOT NULL,
      naf         TEXT,
      checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`.then(() => sql`ALTER TABLE company_sectors ENABLE ROW LEVEL SECURITY`);
  return tableReady;
}

// ---------- Registre ----------

async function searchRegistry(company: string): Promise<Candidate[]> {
  const url = `${REGISTRY_URL}?per_page=5&q=${encodeURIComponent(company)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return [];
      const data = (await res.json()) as {
        results?: {
          nom_complet?: string;
          activite_principale?: string;
          nombre_etablissements?: number;
          tranche_effectif_salarie?: string | null;
        }[];
      };
      return (data.results ?? []).map((r) => ({
        name: r.nom_complet ?? "",
        naf: r.activite_principale ?? null,
        establishments: r.nombre_etablissements ?? 0,
        staff: Number.parseInt(r.tranche_effectif_salarie ?? "", 10) || -1,
      }));
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Secteur déduit du registre seul, uniquement en cas de correspondance exacte du nom avec
 * une entreprise qui emploie des salariés (sinon : homonymes, SCI, coquilles vides…),
 * ou s'il n'existe qu'un seul homonyme exact.
 */
function confidentFromRegistry(company: string, candidates: Candidate[]) {
  const key = companyKey(company);
  const exact = candidates.filter((c) => companyKey(c.name) === key);
  const employers = exact.filter((c) => c.staff >= 0).sort((a, b) => b.staff - a.staff || b.establishments - a.establishments);
  const best = employers[0] ?? (exact.length === 1 ? exact[0] : undefined);
  const sector = best ? sectorFromNaf(best.naf) : null;
  return sector ? { sector, naf: best!.naf } : null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
        await new Promise((r) => setTimeout(r, 150));
      }
    }),
  );
  return out;
}

// ---------- IA ----------

const SYSTEM_PROMPT = `Tu classes des entreprises dans un secteur d'activité, pour un annuaire professionnel français.
Pour chaque entrée, choisis le secteur le plus pertinent dans la liste imposée, en te fondant sur l'activité réelle de l'entreprise (pas sur le poste de la personne).
Indices disponibles : le nom de la société, le domaine de l'email professionnel, un intitulé de poste, et des candidats issus du registre officiel des entreprises françaises (nom + code NAF). Les candidats du registre peuvent être des homonymes, des filiales ou des associations sans rapport : ne les utilise que s'ils correspondent manifestement à la même entreprise.
Pour un grand groupe, retiens son métier principal (ex. un constructeur aéronautique reste « Aéronautique & Spatial » même pour sa filiale de services).
Si tu ne peux pas raisonnablement déterminer le secteur, réponds « Inconnu » plutôt que de deviner.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          sector: { type: "string", enum: [...SECTORS, "Inconnu"] },
        },
        required: ["id", "sector"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

type AiItem = { input: CompanyInput; candidates: Candidate[] };

/** Fournisseur d'IA configuré : Claude en priorité, sinon OpenAI. */
export function aiProvider(): "anthropic" | "openai" | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

function userPrompt(items: AiItem[]) {
  const lines = items.map(({ input, candidates }, id) =>
    JSON.stringify({
      id,
      societe: input.company,
      domaine_email: input.emailDomain ?? undefined,
      poste: input.jobTitle ?? undefined,
      registre: candidates
        .slice(0, 4)
        .map((c) => `${c.name} [NAF ${c.naf ?? "?"}${c.staff < 0 ? ", sans salarié" : ""}]`),
    }),
  );
  return `Entreprises à classer (une par ligne, JSON) :\n${lines.join("\n")}`;
}

function parseResults(text: string, items: AiItem[]) {
  const parsed = JSON.parse(text) as { results: { id: number; sector: string }[] };
  const byId = new Map(parsed.results.map((r) => [r.id, r.sector]));
  return items.map((_, id) => {
    const s = byId.get(id);
    return s && (SECTORS as readonly string[]).includes(s) ? (s as Sector) : null;
  });
}

let anthropic: Anthropic | null = null;

async function classifyWithClaude(items: AiItem[]) {
  anthropic ??= new Anthropic({ timeout: 45_000, maxRetries: 1 });
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";
  // effort et fallbacks ne sont pas acceptés par les petits modèles (ex. claude-haiku-4-5)
  const opusClass = /^claude-(opus-5|fable-5)/.test(model);
  const response = await anthropic.beta.messages.create({
    model,
    max_tokens: 8000,
    ...(opusClass ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    output_config: {
      ...(opusClass ? { effort: "low" as const } : {}),
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt(items) }],
  });

  if (response.stop_reason !== "end_turn") {
    console.warn("Classification IA interrompue :", response.stop_reason);
    return items.map(() => null);
  }
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return parseResults(text, items);
}

let openai: OpenAI | null = null;

async function classifyWithOpenAI(items: AiItem[]) {
  openai ??= new OpenAI({ timeout: 45_000, maxRetries: 1 });
  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
  const completion = await openai.chat.completions.create({
    model,
    max_completion_tokens: 8000,
    // Les modèles de raisonnement (gpt-5…, o…) acceptent un effort réduit pour une tâche simple
    ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: "low" as const } : {}),
    response_format: {
      type: "json_schema",
      json_schema: { name: "secteurs", strict: true, schema: OUTPUT_SCHEMA },
    },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt(items) },
    ],
  });

  const choice = completion.choices[0];
  if (!choice || choice.finish_reason !== "stop" || choice.message.refusal || !choice.message.content) {
    console.warn("Classification IA interrompue :", choice?.finish_reason, choice?.message.refusal);
    return items.map(() => null);
  }
  return parseResults(choice.message.content, items);
}

async function classifyWithAI(items: AiItem[]) {
  const provider = aiProvider();
  if (!provider || items.length === 0) return items.map(() => null);
  return provider === "anthropic" ? classifyWithClaude(items) : classifyWithOpenAI(items);
}

// ---------- Orchestration ----------

/** Renvoie, pour chaque société (clé normalisée), le secteur détecté et sa source. */
export async function detectSectors(inputs: CompanyInput[]) {
  await ensureTable();
  const result = new Map<string, { sector: Sector | null; source: SectorSource }>();

  // Une seule entrée par société
  const unique = new Map<string, CompanyInput>();
  for (const i of inputs) {
    const key = companyKey(i.company);
    if (key && !unique.has(key)) unique.set(key, i);
  }
  if (unique.size === 0) return result;

  const cached = await sql<{ company_key: string; sector: Sector | null }[]>`
    SELECT company_key, sector FROM company_sectors WHERE company_key IN ${sql([...unique.keys()])}`;
  for (const c of cached) {
    result.set(c.company_key, { sector: c.sector, source: "cache" });
    unique.delete(c.company_key);
  }

  const todo = [...unique.entries()];
  const candidates = await mapLimit(todo, REGISTRY_CONCURRENCY, ([, i]) => searchRegistry(i.company));

  const toCache: { company_key: string; sector: string | null; source: string; naf: string | null }[] = [];
  const forAi: { key: string; input: CompanyInput; candidates: Candidate[] }[] = [];
  todo.forEach(([key, input], idx) => {
    const confident = confidentFromRegistry(input.company, candidates[idx]);
    if (confident) {
      result.set(key, { sector: confident.sector, source: "registre" });
      toCache.push({ company_key: key, sector: confident.sector, source: "registre", naf: confident.naf });
    } else {
      forAi.push({ key, input, candidates: candidates[idx] });
    }
  });

  const aiEnabled = aiProvider() !== null;
  for (let i = 0; i < forAi.length; i += AI_BATCH) {
    const batch = forAi.slice(i, i + AI_BATCH);
    let sectors: (Sector | null)[];
    try {
      sectors = await classifyWithAI(batch);
    } catch (err) {
      // En cas d'erreur IA on n'écrit rien en cache : la société sera retentée au prochain import
      console.error("Classification IA en échec", err);
      continue;
    }
    batch.forEach((b, j) => {
      result.set(b.key, { sector: sectors[j], source: "ia" });
      // Sans clé API, on ne mémorise pas l'échec (pour réessayer quand la clé sera configurée)
      if (aiEnabled) toCache.push({ company_key: b.key, sector: sectors[j], source: "ia", naf: null });
    });
  }

  if (toCache.length) {
    await sql`
      INSERT INTO company_sectors ${sql(toCache, ["company_key", "sector", "source", "naf"])}
      ON CONFLICT (company_key) DO UPDATE SET sector = EXCLUDED.sector, source = EXCLUDED.source,
        naf = EXCLUDED.naf, checked_at = now()`;
  }
  return result;
}
