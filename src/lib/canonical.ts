// Valeurs canoniques des filtres : « Greater Lyon Area », « Lyon, France » et « Lyon » donnent la même entrée « Lyon ».
import { titleKey } from "./job-families";
import type { FilterField } from "./fields";

const CITY_NOISE = new Set([
  "greater", "area", "metropolitan", "metropolis", "metro", "region", "grand", "grande", "agglomeration",
  "metropole", "cedex", "arrondissement", "arr", "city", "ville",
]);
const SMALL_WORDS = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "of", "the", "and", "et"]);
const ORDINAL = /^\d+(e|er|ere|eme|nd|rd|th|st)?$/;

function cleanCity(raw: string) {
  // Premier segment avant la virgule, parenthèses retirées : « Lyon (69), France » → « Lyon »
  const first = raw.replace(/\([^)]*\)/g, " ").split(",")[0];
  const tokens = first.split(/\s+/).filter(Boolean);
  const kept = tokens.filter((t, i) => {
    const k = titleKey(t);
    if (!k) return false;
    if (ORDINAL.test(k)) return i === 0 && tokens.length === 1;
    // « Grand » n'est du bruit qu'en tête (« Grand Lyon »), pas dans « Le Grand Bornand »
    if (k === "grand" || k === "grande") return !(i === 0 && tokens.length > 1);
    return !CITY_NOISE.has(k);
  });
  // Pays collé à la ville sans virgule : « LYON FRANCE » → « LYON » (clés de 2 lettres ignorées : « Lyon IT »)
  for (let n = Math.min(3, kept.length - 1); n >= 1; n--) {
    const k = titleKey(kept.slice(-n).join(" "));
    if (k.length > 3 && COUNTRY_BY_KEY.has(k)) {
      kept.length -= n;
      break;
    }
  }
  const removed = kept.length !== tokens.length;
  if (removed) {
    while (kept.length > 1 && SMALL_WORDS.has(titleKey(kept[0]))) kept.shift();
    while (kept.length > 1 && SMALL_WORDS.has(titleKey(kept[kept.length - 1]))) kept.pop();
  }
  return kept.join(" ") || raw.trim();
}

const COUNTRIES: Record<string, string[]> = {
  "France": ["fr", "france", "republique francaise", "french republic", "metropolitan france"],
  "États-Unis": ["us", "usa", "u s a", "united states", "united states of america", "etats unis", "etats unis d amerique"],
  "Royaume-Uni": ["uk", "gb", "u k", "united kingdom", "great britain", "royaume uni", "angleterre", "england"],
  "Allemagne": ["de", "germany", "allemagne", "deutschland"],
  "Belgique": ["be", "belgium", "belgique", "belgie"],
  "Suisse": ["ch", "switzerland", "suisse", "schweiz"],
  "Espagne": ["es", "spain", "espagne", "espana"],
  "Italie": ["it", "italy", "italie", "italia"],
  "Pays-Bas": ["nl", "netherlands", "the netherlands", "pays bas", "holland"],
  "Luxembourg": ["lu", "luxembourg"],
  "Canada": ["ca", "canada"],
  "Portugal": ["pt", "portugal"],
  "Irlande": ["ie", "ireland", "irlande"],
  "Maroc": ["ma", "morocco", "maroc"],
  "Tunisie": ["tn", "tunisia", "tunisie"],
  "Algérie": ["dz", "algeria", "algerie"],
};
const COUNTRY_BY_KEY = new Map<string, string>();
for (const [name, keys] of Object.entries(COUNTRIES)) for (const k of keys) COUNTRY_BY_KEY.set(k, name);

function cleanCountry(raw: string) {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? raw.trim();
  return COUNTRY_BY_KEY.get(titleKey(last)) ?? last;
}

const LEGAL_FORMS = new Set(["sas", "sasu", "sarl", "eurl", "sa", "sci", "snc", "inc", "llc", "ltd", "gmbh", "corp", "co"]);

function cleanCompany(raw: string) {
  const tokens = raw.trim().split(/\s+/);
  const kept = tokens.filter((t) => !LEGAL_FORMS.has(titleKey(t)));
  return kept.length ? kept.join(" ") : raw.trim();
}

/** Valeur affichable normalisée d'une valeur brute pour le filtre donné. */
export function canonicalValue(field: FilterField, raw: string) {
  const v = raw.trim();
  if (field === "city") return cleanCity(v);
  if (field === "country") return cleanCountry(v);
  if (field === "company") return cleanCompany(v);
  return v;
}

/** Clé de regroupement : deux valeurs de même clé comptent dans la même entrée du filtre. */
export const canonicalKey = (field: FilterField, raw: string) => titleKey(canonicalValue(field, raw));

/** Regroupe des valeurs brutes (avec effectifs) en entrées canoniques ; l'intitulé est celui de la variante la plus fréquente. */
export function groupFacet(field: FilterField, rows: { value: string; count: number }[]) {
  const groups = new Map<string, { label: string; best: number; count: number }>();
  for (const r of rows) {
    const label = canonicalValue(field, r.value);
    const key = titleKey(label);
    if (!key) continue;
    const g = groups.get(key);
    if (!g) groups.set(key, { label, best: r.count, count: r.count });
    else {
      g.count += r.count;
      if (r.count > g.best) {
        g.best = r.count;
        g.label = label;
      }
    }
  }
  return [...groups.values()]
    .map((g) => ({ value: g.label, count: g.count }))
    .sort((a, b) => a.value.localeCompare(b.value, "fr"));
}
