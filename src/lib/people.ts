import "server-only";
import { sql } from "./db";
import { titleKey } from "./job-families";
import { canonicalKey, groupFacet } from "./canonical";
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

/** Champs dont les valeurs sont regroupées (« Greater Lyon Area » et « Lyon » = « Lyon »). */
const GROUPED: readonly FilterField[] = ["city", "country", "company", "sector", "job_title", "postal_code"];

/** Valeurs brutes de la base correspondant aux entrées choisies dans un filtre. */
async function rawValues(k: FilterField, chosen: string[]) {
  if (!GROUPED.includes(k)) return chosen;
  const keys = new Set(chosen.map((v) => canonicalKey(k, v)));
  const all = await sql<{ v: string }[]>`SELECT DISTINCT ${sql(k)} AS v FROM people WHERE ${sql(k)} IS NOT NULL AND ${sql(k)} <> ''`;
  const raw = all.map((r) => r.v).filter((v) => keys.has(canonicalKey(k, v)));
  return [...new Set([...raw, ...chosen])];
}

/** Conditions SQL des filtres ; `except` permet d'ignorer un champ (calcul des facettes). */
async function conditions(f: Filters, except: FilterField | undefined, viewer: Viewer) {
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
  // Les filtres viennent de menus déroulants alimentés par la base : correspondance exacte sur les valeurs regroupées
  for (const k of FILTER_FIELDS) {
    const v = f[k];
    if (!v?.length || k === except) continue;
    conds.push(sql`${sql(k)} IN ${sql(await rawValues(k, v))}`);
  }
  return conds;
}

function whereOf(conds: Awaited<ReturnType<typeof conditions>>) {
  if (conds.length === 0) return sql``;
  return sql`WHERE ${conds.reduce((acc, c) => sql`${acc} AND ${c}`)}`;
}

// Fragment SQL (thenable) : à ne pas renvoyer depuis une fonction async, il serait exécuté par le await
async function whereParts(f: Filters, viewer: Viewer) {
  return await conditions(f, undefined, viewer);
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
    FILTER_FIELDS.map(async (k) => {
      const conds = [...(await conditions(f, k, viewer)), sql`${sql(k)} IS NOT NULL`, sql`${sql(k)} <> ''`];
      const rows = await sql<{ value: string; count: number }[]>`
        SELECT ${sql(k)} AS value, count(*)::int AS count FROM people ${whereOf(conds)}
        GROUP BY 1 ORDER BY 1`;
      // Variantes d'une même valeur regroupées en une entrée, puis copie en tableaux simples (sérialisables)
      const list = GROUPED.includes(k) ? groupFacet(k, rows) : rows.map((r) => ({ value: r.value, count: r.count }));
      return list.slice(0, FACET_LIMIT);
    }),
  );
  return Object.fromEntries(FILTER_FIELDS.map((k, i) => [k, lists[i]])) as Facets;
}

const ORDER = sql`ORDER BY last_name NULLS LAST, first_name NULLS LAST, id`;

export async function searchPeople(f: Filters, page: number, pageSize: number, viewer: Viewer) {
  const where = whereOf(await whereParts(f, viewer));
  const [[{ total }], rows] = await Promise.all([
    sql<{ total: number }[]>`SELECT count(*)::int AS total FROM people ${where}`,
    sql<Person[]>`
      SELECT id, ${sql(PERSON_KEYS)} FROM people ${where} ${ORDER}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
  ]);
  return { total, rows: maskEmails(rows, viewer.noEmail) };
}

export const EXPORT_LIMIT = 100_000;

export async function exportPeople(f: Filters, viewer: Viewer) {
  const where = whereOf(await whereParts(f, viewer));
  const rows = await sql<Person[]>`
    SELECT id, ${sql(PERSON_KEYS)} FROM people ${where} ${ORDER} LIMIT ${EXPORT_LIMIT}`;
  return maskEmails(rows, viewer.noEmail);
}

export async function deletePeopleByIds(ids: number[]) {
  if (ids.length === 0) return 0;
  const res = await sql`DELETE FROM people WHERE id IN ${sql(ids)}`;
  return res.count;
}

/** Supprime toutes les fiches correspondant aux filtres (sans filtre : toute la table). Super admin uniquement. */
export async function deletePeopleMatching(f: Filters) {
  const where = whereOf(await whereParts(f, { noEmail: false, superAdmin: true, groupId: null, sharedAccess: true }));
  const res = await sql`DELETE FROM people ${where}`;
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

/** Identité d'une personne sans se fier à l'email : prénom + nom + société, normalisés (accents, casse, ponctuation). */
const identityKey = (r: CleanRow) => [r.first_name, r.last_name, r.company].map((v) => titleKey(v ?? "")).join("|");

/** Fusionne `from` dans `into` : `into` garde ses valeurs, `from` ne comble que les vides. */
function fillGaps(into: CleanRow, from: CleanRow) {
  for (const k of PERSON_KEYS) if (into[k] == null) into[k] = from[k];
}

// Même normalisation que titleKey(), côté SQL
const norm = (col: string) => `trim(regexp_replace(lower(unaccent(coalesce(${col}, ''))), '[^a-z0-9]+', ' ', 'g'))`;
const IDENTITY_SQL = sql.unsafe(`${norm("first_name")} || '|' || ${norm("last_name")} || '|' || ${norm("company")}`);

/**
 * Importe sans créer de doublons, dans l'espace de destination (base commune ou espace privé d'un groupe) :
 *  - même email → mise à jour de la fiche existante ;
 *  - sans email : même prénom + nom + société → mise à jour de la fiche existante (qui reçoit aussi l'email du CSV si elle n'en avait pas) ;
 *  - doublons à l'intérieur du fichier → fusionnés en une seule fiche.
 * En cas de mise à jour, une cellule vide du CSV n'efface jamais une valeur existante.
 */
export async function upsertPeople(raw: ImportRow[], ownerGroupId: number | null = null) {
  let skipped = 0;
  let duplicates = 0; // lignes du fichier fusionnées avec une autre ligne du même fichier

  // 1. Doublons dans le fichier : par email, puis les lignes sans email rattachées à une fiche de même identité
  const byEmail = new Map<string, CleanRow>();
  const noEmail = new Map<string, CleanRow>();
  for (const r of raw) {
    const row = clean(r);
    if (!row) {
      skipped++;
      continue;
    }
    if (row.email) {
      const prev = byEmail.get(row.email);
      if (prev) {
        // La dernière valeur non vide gagne
        fillGaps(row, prev);
        duplicates++;
      }
      byEmail.set(row.email, row);
    } else {
      const key = identityKey(row);
      const prev = noEmail.get(key);
      if (prev) {
        fillGaps(row, prev);
        duplicates++;
      }
      noEmail.set(key, row);
    }
  }
  const emailKeys = new Map<string, CleanRow>();
  for (const row of byEmail.values()) if (!emailKeys.has(identityKey(row))) emailKeys.set(identityKey(row), row);
  for (const [key, row] of [...noEmail]) {
    const owner = emailKeys.get(key);
    if (owner) {
      fillGaps(owner, row);
      noEmail.delete(key);
      duplicates++;
    }
  }

  const emailRows = [...byEmail.values()];
  const plainRows = [...noEmail.values()];
  if (emailRows.length + plainRows.length === 0) return { created: 0, updated: 0, skipped, duplicates };

  // 2. Fiches déjà présentes dans l'espace de destination
  const space = ownerGroupId === null ? sql`owner_group_id IS NULL` : sql`owner_group_id = ${ownerGroupId}`;
  const existingEmails = new Set<string>(
    emailRows.length
      ? (await sql<{ email: string }[]>`SELECT email FROM people WHERE ${space} AND email IN ${sql(emailRows.map((r) => r.email!))}`).map((r) => r.email)
      : [],
  );
  const keys = [...new Set([...emailRows, ...plainRows].map(identityKey))];
  const found = await sql<{ id: string; email: string | null; key: string }[]>`
    SELECT id, email, key FROM (SELECT id, email, ${IDENTITY_SQL} AS key FROM people WHERE ${space}) t
    WHERE key IN ${sql(keys)}`;
  const byKey = new Map<string, { id: string; email: string | null }[]>();
  for (const f of found) byKey.set(f.key, [...(byKey.get(f.key) ?? []), { id: f.id, email: f.email }]);

  const usedIds = new Set<string>();
  const matched: (CleanRow & { id: string })[] = []; // à mettre à jour par identifiant
  const fresh: CleanRow[] = []; // à insérer (ou mettre à jour par email)
  for (const row of emailRows) {
    // Email déjà connu : l'insertion avec conflit sur l'email s'en charge
    const candidate = existingEmails.has(row.email!) ? undefined : byKey.get(identityKey(row))?.find((c) => c.email === null && !usedIds.has(c.id));
    if (candidate) {
      usedIds.add(candidate.id);
      matched.push({ ...row, id: candidate.id });
    } else {
      fresh.push(row);
    }
  }
  for (const row of plainRows) {
    const candidate = byKey.get(identityKey(row))?.find((c) => !usedIds.has(c.id));
    if (candidate) {
      usedIds.add(candidate.id);
      matched.push({ ...row, id: candidate.id });
    } else {
      fresh.push(row);
    }
  }

  let created = 0;
  let updated = 0;

  // 3a. Fiches retrouvées par identité : mise à jour par identifiant (les cellules vides n'effacent rien)
  if (matched.length) {
    const cols: string[] = ["id", ...PERSON_KEYS, "owner_group_id"];
    const rows = matched.map((r) => ({ ...r, owner_group_id: ownerGroupId })) as Record<string, string | number | null>[];
    const set = PERSON_KEYS.map((k) => `${k} = COALESCE(EXCLUDED.${k}, people.${k})`).join(", ");
    const res = await sql`
      INSERT INTO people ${sql(rows, cols)}
      ON CONFLICT (id) DO UPDATE SET ${sql.unsafe(set)}, updated_at = now()`;
    updated += res.count;
  }

  // 3b. Nouvelles fiches, ou fiches de même email. Un même email peut exister dans la base commune et dans
  // l'espace privé d'un groupe : l'unicité se vérifie dans l'espace de destination (index uniques partiels).
  if (fresh.length) {
    const updates = PERSON_KEYS.filter((k) => k !== "email")
      .map((k) => `${k} = COALESCE(EXCLUDED.${k}, people.${k})`)
      .join(", ");
    const columns: (PersonField | "owner_group_id")[] = [...PERSON_KEYS, "owner_group_id"];
    const withOwner = fresh.map((r) => ({ ...r, owner_group_id: ownerGroupId }));
    const conflict =
      ownerGroupId === null
        ? sql`ON CONFLICT (email) WHERE owner_group_id IS NULL`
        : sql`ON CONFLICT (owner_group_id, email) WHERE owner_group_id IS NOT NULL`;
    const result = await sql<{ inserted: boolean }[]>`
      INSERT INTO people ${sql(withOwner, columns)}
      ${conflict} DO UPDATE SET ${sql.unsafe(updates)}, updated_at = now()
      RETURNING (xmax = 0) AS inserted`;
    created += result.filter((r) => r.inserted).length;
    updated += result.length - result.filter((r) => r.inserted).length;
  }

  return { created, updated, skipped, duplicates };
}
