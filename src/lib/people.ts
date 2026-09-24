import "server-only";
import { sql } from "./db";
import { FILTER_FIELDS, PERSON_KEYS, type Filters, type Person, type PersonField } from "./fields";

type SearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

export function parseFilters(params: SearchParams): Filters {
  const get = (k: string) => {
    const v = params instanceof URLSearchParams ? params.get(k) : params[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    return s ? s.slice(0, 200) : undefined;
  };
  const filters: Filters = {};
  for (const k of ["q", ...FILTER_FIELDS] as const) {
    const v = get(k);
    if (v) filters[k] = v;
  }
  return filters;
}

/** Motif "contient" pour ILIKE, en échappant les jokers saisis par l'utilisateur. */
function contains(v: string) {
  return "%" + v.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
}

function whereClause(f: Filters) {
  const conds = [];
  if (f.q) {
    const p = contains(f.q);
    conds.push(sql`unaccent(concat_ws(' ', first_name, last_name, email, company, last_name, first_name)) ILIKE unaccent(${p})`);
  }
  for (const k of FILTER_FIELDS) {
    const v = f[k];
    if (v) conds.push(sql`unaccent(${sql(k)}) ILIKE unaccent(${contains(v)})`);
  }
  if (conds.length === 0) return sql``;
  return sql`WHERE ${conds.reduce((acc, c) => sql`${acc} AND ${c}`)}`;
}

const ORDER = sql`ORDER BY last_name NULLS LAST, first_name NULLS LAST, id`;

export async function searchPeople(f: Filters, page: number, pageSize: number) {
  const [[{ total }], rows] = await Promise.all([
    sql<{ total: number }[]>`SELECT count(*)::int AS total FROM people ${whereClause(f)}`,
    sql<Person[]>`
      SELECT id, ${sql(PERSON_KEYS)} FROM people ${whereClause(f)} ${ORDER}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
  ]);
  return { total, rows };
}

export const EXPORT_LIMIT = 100_000;

export async function exportPeople(f: Filters) {
  return sql<Person[]>`
    SELECT id, ${sql(PERSON_KEYS)} FROM people ${whereClause(f)} ${ORDER} LIMIT ${EXPORT_LIMIT}`;
}

/** Valeurs distinctes pour l'autocomplétion des filtres. */
export async function distinctValues(fields: readonly PersonField[]) {
  const lists = await Promise.all(
    fields.map(
      (k) => sql<{ v: string }[]>`
        SELECT DISTINCT ${sql(k)} AS v FROM people
        WHERE ${sql(k)} IS NOT NULL AND ${sql(k)} <> '' ORDER BY 1 LIMIT 500`,
    ),
  );
  return Object.fromEntries(fields.map((k, i) => [k, lists[i].map((r) => r.v)])) as Record<PersonField, string[]>;
}

export async function getPerson(id: number) {
  const [p] = await sql<Person[]>`SELECT id, ${sql(PERSON_KEYS)} FROM people WHERE id = ${id}`;
  return p ?? null;
}

// ---------- Import ----------

export type ImportRow = Partial<Record<PersonField, unknown>>;
type CleanRow = Record<PersonField, string | null>;

function clean(raw: ImportRow): CleanRow | null {
  const row = {} as CleanRow;
  for (const k of PERSON_KEYS) {
    const v = raw[k] == null ? "" : String(raw[k]).trim().slice(0, 2000);
    row[k] = v === "" ? null : v;
  }
  if (row.email) row.email = row.email.toLowerCase();
  // Une ligne sans nom, prénom, email ni société est inexploitable
  if (!row.first_name && !row.last_name && !row.email && !row.company) return null;
  return row;
}

/**
 * Insère ou met à jour (clé = email). En cas de mise à jour, une cellule vide
 * dans le CSV ne vient pas effacer une valeur existante.
 */
export async function upsertPeople(raw: ImportRow[]) {
  const byEmail = new Map<string, CleanRow>();
  const noEmail: CleanRow[] = [];
  let skipped = 0;

  for (const r of raw) {
    const row = clean(r);
    if (!row) {
      skipped++;
      continue;
    }
    if (!row.email) {
      noEmail.push(row);
      continue;
    }
    // Doublon d'email dans le même fichier : on fusionne (la dernière valeur non vide gagne)
    const prev = byEmail.get(row.email);
    if (prev) {
      for (const k of PERSON_KEYS) if (row[k] == null) row[k] = prev[k];
    }
    byEmail.set(row.email, row);
  }

  const rows = [...byEmail.values(), ...noEmail];
  if (rows.length === 0) return { created: 0, updated: 0, skipped };

  const updates = PERSON_KEYS.filter((k) => k !== "email")
    .map((k) => `${k} = COALESCE(EXCLUDED.${k}, people.${k})`)
    .join(", ");

  const result = await sql<{ inserted: boolean }[]>`
    INSERT INTO people ${sql(rows, PERSON_KEYS)}
    ON CONFLICT (email) DO UPDATE SET ${sql.unsafe(updates)}, updated_at = now()
    RETURNING (xmax = 0) AS inserted`;

  const created = result.filter((r) => r.inserted).length;
  return { created, updated: result.length - created, skipped };
}
