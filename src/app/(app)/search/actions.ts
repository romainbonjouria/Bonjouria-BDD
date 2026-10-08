"use server";

import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { FIELD_LABEL, type FilterField } from "@/lib/fields";
import { interpretSearch, type SearchIntent } from "@/lib/search-intent";

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/**
 * Valeur de filtre pour un mot-clé : la valeur exacte de la base si elle existe
 * (ou si un seul libellé correspond), sinon un filtre « contient » (préfixe ~).
 */
async function resolve(field: FilterField, keyword: string) {
  const pattern = "%" + keyword.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
  const rows = await sql<{ v: string }[]>`
    SELECT DISTINCT ${sql(field)} AS v FROM people
    WHERE unaccent(${sql(field)}) ILIKE unaccent(${pattern}) LIMIT 50`;
  const exact = rows.find((r) => norm(r.v) === norm(keyword));
  if (exact) return exact.v;
  if (rows.length === 1) return rows[0].v;
  return "~" + keyword;
}

const FILLER = [
  /^(bonjour|salut)\s+/,
  /^(je\s+(voudrais|veux|souhaite|souhaiterais|cherche|recherche|aimerais)|donne(-| )moi|montre(-| )moi|trouve(-| )moi|affiche(-| )moi|affiche|liste(-| )moi|peux tu me (trouver|donner|montrer)|pouvez vous me (trouver|donner|montrer))\s+/,
  /\b(s il (te|vous) plait|svp|stp|merci)\b/g,
  /\b(tous|toutes|tout|toute)\b/g,
  /\b(les|des|un|une|le|la|l)\b(?=\s)/g,
  /^(personnes?|contacts?|gens|profils?|fiches?)\s+(qui sont|qui travaillent|qui exercent)?\s*/,
  /^(qui sont|qui travaillent|qui exercent)\s+/,
];
const PLACE_PREP = /\b(?:de|du|des|en|a|au|aux|dans|sur|pres de|autour de)\s+/g;

async function exists(field: FilterField, keyword: string, mode: "equals" | "contains" = "contains") {
  const pattern = mode === "equals" ? keyword : "%" + keyword.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
  const [row] = await sql`
    SELECT 1 AS ok FROM people WHERE unaccent(lower(${sql(field)})) ${mode === "equals" ? sql`=` : sql`LIKE`} ${pattern} LIMIT 1`;
  return !!row;
}

function singular(word: string) {
  if (word.length <= 3) return word;
  if (word.endsWith("aux")) return word.slice(0, -3) + "al";
  return word.replace(/s$/, "");
}

/** Repli sans IA : retire les mots de liaison, repère un lieu connu de la base, le reste est le métier. */
async function heuristicIntent(input: string): Promise<SearchIntent | null> {
  let text = norm(input).replace(/['’]/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ");
  for (const re of FILLER) text = text.replace(re, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const intent: SearchIntent = { job_title: "", sector: "", city: "", country: "", postal_code: "", company: "", q: "" };

  const chez = text.match(/\bchez\s+(.+)$/);
  if (chez) {
    intent.company = chez[1];
    text = text.slice(0, chez.index).trim();
  }

  // Premier « de/en/à… X » dont X est un pays, une ville ou un code postal présent dans la base
  for (const m of text.matchAll(PLACE_PREP)) {
    const place = text.slice(m.index + m[0].length).replace(/^(la|le|les|l)\s+/, "").trim();
    if (!place) continue;
    if (/^\d{2,5}$/.test(place)) intent.postal_code = place;
    else if (await exists("country", place, "equals")) intent.country = place;
    else if (await exists("city", place, "equals")) intent.city = place;
    else continue;
    text = text.slice(0, m.index).trim();
    break;
  }

  const keyword = text.split(" ").filter(Boolean).map(singular).join(" ");
  if (keyword) {
    if (await exists("job_title", keyword)) intent.job_title = keyword;
    else if (await exists("sector", keyword)) intent.sector = keyword;
    else if (await exists("company", keyword)) intent.company = intent.company || keyword;
    else intent.job_title = keyword;
  }
  return Object.values(intent).some(Boolean) ? intent : null;
}

export type InterpretResult = { query: string; summary: string[] } | { error: string };

/** Transforme « je voudrais tous les peintres de France » en filtres de recherche. */
export async function interpretQuery(text: string): Promise<InterpretResult> {
  await requireUser();
  const input = text.trim().slice(0, 300);
  if (!input) return { error: "Saisissez une demande." };

  const intent = (await interpretSearch(input)) ?? (await heuristicIntent(input));
  if (!intent) return { error: "Demande non comprise : recherche classique utilisée." };

  const params = new URLSearchParams();
  const summary: string[] = [];
  for (const field of ["job_title", "sector", "city", "country", "postal_code", "company"] as const) {
    if (!intent[field]) continue;
    const value = await resolve(field, intent[field]);
    params.set(field, value);
    summary.push(`${FIELD_LABEL[field]} : ${value.replace(/^~/, "")}`);
  }
  if (intent.q) params.set("q", intent.q);
  if (params.size === 0) params.set("q", input);
  else params.set("ask", input);
  return { query: params.toString(), summary };
}
