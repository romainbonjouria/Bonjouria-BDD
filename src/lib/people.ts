import "server-only";
import { sql } from "./db";
import { FILTER_FIELDS, PERSON_KEYS, type FilterField, type Filters, type Person, type PersonField } from "./fields";

type SearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

export function parseFilters(params: SearchParams): Filters {
  const getAll = (k: string) => {
    const v = params instanceof URLSearchParams ? params.getAll(k) : params[k];
    const list = Array.isArray(v) ? v : v === undefined ? [] : [v];
    return [...new Set(list.map((s) => s.trim().slice(0, 500)).filter(Boolean))].slice(0, 200);
  };
  const filters: Filters = {};
  const q = getAll("q")[0];
  if (q) filters.q = q;
  // Espace de données (réservé au super admin, ignoré pour les autres) : "shared" ou id de groupe
  const space = getAll("space")[0];
  if (space && (space === "shared" || /^\d+$/.test(space))) filters.space = space;
  for (const k of FILTER_FIELDS) {
    const v = getAll(k);
    if (v.length) filters[k] = v;
  }
  return filters;
}

/** Motif "contient" pour ILIKE, en échappant les jokers saisis par l'utilisateur. */
function contains(v: string) {
  return "%" + v.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
}

/**
 * Qui regarde l'annuaire : détermine les fiches visibles (base commune et/ou espace privé du groupe)
 * et si les emails sont masqués.
 */
export type Viewer = { noEmail: boolean; superAdmin: boolean; groupId: number | null; sharedAccess: boolean };

export const viewerOf = (u: {
  role: string; hide_emails: boolean; group_id: number | null; shared_access: boolean;
}): Viewer => ({
  noEmail: u.hide_emails,
  superAdmin: u.role === "super_admin",
  groupId: u.group_id,
  sharedAccess: u.shared_access,
});

/** Fiches de la base commune : owner_group_id NULL ; fiches privées : owner_group_id = id du groupe. */
function spaceCondition(f: Filters, v: Viewer) {
  if (v.superAdmin) {
    if (f.space === "shared") return sql`owner_group_id IS NULL`;
    if (f.space) return sql`owner_group_id = ${Number(f.space)}`;
    return null;
  }
  if (v.groupId === null) return sql`owner_group_id IS NULL`;
  return v.sharedAccess
    ? sql`(owner_group_id IS NULL OR owner_group_id = ${v.groupId})`
    : sql`owner_group_id = ${v.groupId}`;
}

/** Conditions SQL des filtres ; `except` permet d'ignorer un champ (calcul des facettes). */
function conditions(f: Filters, except: FilterField | undefined, viewer: Viewer) {
  const conds = [];
  const space = spaceCondition(f, viewer);
  if (space) conds.push(space);
  if (f.q) {
    const p = contains(f.q);
    // Un utilisateur sans accès aux emails ne peut pas non plus les retrouver par la recherche libre
    const text = viewer.noEmail
      ? sql`concat_ws(' ', first_name, last_name, company, last_name, first_name)`
      : sql`concat_ws(' ', first_name, last_name, email, company, last_name, first_name)`;
    conds.push(sql`unaccent(${text}) ILIKE unaccent(${p})`);
  }
  // Les filtres viennent de menus déroulants alimentés par la base : correspondance exacte
  for (const k of FILTER_FIELDS) {
    const v = f[k];
    if (!v?.length || k === except) continue;
    conds.push(sql`${sql(k)} IN ${sql(v)}`);
  }
  return conds;
}

function whereOf(conds: ReturnType<typeof conditions>) {
  if (conds.length === 0) return sql``;
  return sql`WHERE ${conds.reduce((acc, c) => sql`${acc} AND ${c}`)}`;
}

function whereClause(f: Filters, viewer: Viewer) {
  return whereOf(conditions(f, undefined, viewer));
}

/** Retire les emails des fiches pour un utilisateur sans droit de les voir. */
function maskEmails<T extends { email: string | null }>(rows: T[], hide: boolean) {
  if (hide) for (const r of rows) r.email = null;
  return rows;
}

export type Facets = Record<FilterField, { value: string; count: number }[]>;
const FACET_LIMIT = 2000;

/**
 * Valeurs disponibles pour chaque menu déroulant, avec leur nombre de fiches,
 * en tenant compte des autres filtres actifs (mais pas de celui du menu lui-même).
 */
export async function facetValues(f: Filters, viewer: Viewer): Promise<Facets> {
  const lists = await Promise.all(
    FILTER_FIELDS.map((k) => {
      const conds = [...conditions(f, k, viewer), sql`${sql(k)} IS NOT NULL`, sql`${sql(k)} <> ''`];
      return sql<{ value: string; count: number }[]>`
        SELECT ${sql(k)} AS value, count(*)::int AS count FROM people ${whereOf(conds)}
        GROUP BY 1 ORDER BY 1 LIMIT ${FACET_LIMIT}`;
    }),
  );
  // Copie en tableaux simples (sérialisables vers les composants client)
  return Object.fromEntries(FILTER_FIELDS.map((k, i) => [k, lists[i].map((r) => ({ value: r.value, count: r.count }))])) as Facets;
}

const ORDER = sql`ORDER BY last_name NULLS LAST, first_name NULLS LAST, id`;

export async function searchPeople(f: Filters, page: number, pageSize: number, viewer: Viewer) {
  const [[{ total }], rows] = await Promise.all([
    sql<{ total: number }[]>`SELECT count(*)::int AS total FROM people ${whereClause(f, viewer)}`,
    sql<Person[]>`
      SELECT id, ${sql(PERSON_KEYS)} FROM people ${whereClause(f, viewer)} ${ORDER}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
  ]);
  return { total, rows: maskEmails(rows, viewer.noEmail) };
}

export const EXPORT_LIMIT = 100_000;

export async function exportPeople(f: Filters, viewer: Viewer) {
  const rows = await sql<Person[]>`
    SELECT id, ${sql(PERSON_KEYS)} FROM people ${whereClause(f, viewer)} ${ORDER} LIMIT ${EXPORT_LIMIT}`;
  return maskEmails(rows, viewer.noEmail);
}

export async function deletePeopleByIds(ids: number[]) {
  if (ids.length === 0) return 0;
  const res = await sql`DELETE FROM people WHERE id IN ${sql(ids)}`;
  return res.count;
}

/** Supprime toutes les fiches correspondant aux filtres (sans filtre : toute la table). Super admin uniquement. */
export async function deletePeopleMatching(f: Filters) {
  const res = await sql`DELETE FROM people ${whereClause(f, { noEmail: false, superAdmin: true, groupId: null, sharedAccess: true })}`;
  return res.count;
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
export async function upsertPeople(raw: ImportRow[], ownerGroupId: number | null = null) {
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

  // Un même email peut exister dans la base commune et dans l'espace privé d'un groupe : l'unicité se
  // vérifie dans l'espace de destination (deux index uniques partiels), sans jamais toucher à l'autre.
  const columns: (PersonField | "owner_group_id")[] = [...PERSON_KEYS, "owner_group_id"];
  const withOwner = rows.map((r) => ({ ...r, owner_group_id: ownerGroupId }));
  const conflict =
    ownerGroupId === null
      ? sql`ON CONFLICT (email) WHERE owner_group_id IS NULL`
      : sql`ON CONFLICT (owner_group_id, email) WHERE owner_group_id IS NOT NULL`;
  const result = await sql<{ inserted: boolean }[]>`
    INSERT INTO people ${sql(withOwner, columns)}
    ${conflict} DO UPDATE SET ${sql.unsafe(updates)}, updated_at = now()
    RETURNING (xmax = 0) AS inserted`;

  const created = result.filter((r) => r.inserted).length;
  return { created, updated: result.length - created, skipped };
}
