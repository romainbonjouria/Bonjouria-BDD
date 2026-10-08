import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { SECTORS } from "./sectors";
import { aiProvider } from "./sector-detect";

/** Critères extraits d'une demande en langage naturel (chaîne vide = non précisé). */
export type SearchIntent = {
  job_title: string;
  sector: string;
  city: string;
  country: string;
  postal_code: string;
  company: string;
  q: string;
};

const SYSTEM_PROMPT = `Tu transformes une demande en français, saisie dans la barre de recherche d'un annuaire de contacts professionnels, en critères de filtrage.
Champs :
- job_title : métier ou fonction recherchés, au singulier et sans article (ex. « peintre », « directeur commercial »). Garde un mot-clé court.
- sector : un secteur de la liste imposée, uniquement si la demande vise clairement un secteur d'activité (pas un métier).
- city : ville. country : pays en français (ex. « France »). postal_code : code postal ou département (ex. « 63000 »).
- company : nom de société si cité.
- q : uniquement un nom, prénom ou email de personne cité dans la demande.
Règles : « de France » / « en France » = country « France ». Laisse une chaîne vide pour tout champ non mentionné. N'invente rien. Si la demande n'est qu'un nom de personne, mets-le dans q.`;

const SCHEMA = {
  type: "object",
  properties: {
    job_title: { type: "string" },
    sector: { type: "string", enum: [...SECTORS, ""] },
    city: { type: "string" },
    country: { type: "string" },
    postal_code: { type: "string" },
    company: { type: "string" },
    q: { type: "string" },
  },
  required: ["job_title", "sector", "city", "country", "postal_code", "company", "q"],
  additionalProperties: false,
};

async function withClaude(text: string) {
  const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";
  const opusClass = /^claude-(opus-5|fable-5)/.test(model);
  const response = await client.beta.messages.create({
    model,
    max_tokens: 1000,
    ...(opusClass ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    output_config: {
      ...(opusClass ? { effort: "low" as const } : {}),
      format: { type: "json_schema", schema: SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
  });
  if (response.stop_reason !== "end_turn") return null;
  return response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

async function withOpenAI(text: string) {
  const client = new OpenAI({ timeout: 20_000, maxRetries: 1 });
  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
  const completion = await client.chat.completions.create({
    model,
    max_completion_tokens: 1000,
    ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: "low" as const } : {}),
    response_format: { type: "json_schema", json_schema: { name: "recherche", strict: true, schema: SCHEMA } },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
  });
  const choice = completion.choices[0];
  return choice?.finish_reason === "stop" ? (choice.message.content ?? null) : null;
}

/** Interprète une demande en langage naturel ; null si aucune IA n'est configurée ou en cas d'échec. */
export async function interpretSearch(text: string): Promise<SearchIntent | null> {
  const provider = aiProvider();
  if (!provider) return null;
  try {
    const raw = await (provider === "anthropic" ? withClaude(text) : withOpenAI(text));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<SearchIntent>;
    const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
    return {
      job_title: s(p.job_title), sector: s(p.sector), city: s(p.city), country: s(p.country),
      postal_code: s(p.postal_code), company: s(p.company), q: s(p.q),
    };
  } catch (err) {
    console.error("Interprétation de la recherche en échec", err);
    return null;
  }
}
