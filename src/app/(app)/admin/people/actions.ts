"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { classifyTitles, refreshJobFamilies } from "@/lib/job-detect";
import { PERSON_KEYS, type PersonField } from "@/lib/fields";
import { deletePeopleByIds, deletePeopleMatching, parseFilters } from "@/lib/people";

export type PersonActionResult = { error?: string } | undefined;

/**
 * Suppression en masse : soit une liste d'ids, soit tout ce qui correspond
 * à une recherche (query string des filtres ; vide = toute la base).
 */
export async function bulkDeletePeople(
  target: { ids: number[] } | { query: string },
): Promise<{ deleted: number } | { error: string }> {
  await requireSuperAdmin();
  let deleted: number;
  if ("ids" in target) {
    const ids = target.ids.map(Number).filter(Number.isInteger).slice(0, 10_000);
    deleted = await deletePeopleByIds(ids);
  } else {
    deleted = await deletePeopleMatching(parseFilters(new URLSearchParams(target.query)));
  }
  revalidatePath("/search");
  return { deleted };
}

export async function savePerson(_prev: PersonActionResult, fd: FormData): Promise<PersonActionResult> {
  await requireSuperAdmin();
  const id = fd.get("id") ? Number(fd.get("id")) : null;

  const values = {} as Record<PersonField, string | null>;
  for (const k of PERSON_KEYS) {
    const v = String(fd.get(k) ?? "").trim().slice(0, 2000);
    values[k] = v || null;
  }
  if (values.email) values.email = values.email.toLowerCase();
  if (!values.first_name && !values.last_name && !values.email && !values.company) {
    return { error: "Renseignez au moins un nom, un prénom, un email ou une société." };
  }

  try {
    if (id) {
      await sql`UPDATE people SET ${sql(values, PERSON_KEYS)}, updated_at = now() WHERE id = ${id}`;
    } else {
      await sql`INSERT INTO people ${sql(values, PERSON_KEYS)}`;
    }
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return { error: "Une autre fiche utilise déjà cet email." };
    throw err;
  }
  try {
    if (values.job_title) await classifyTitles([values.job_title], true);
    await refreshJobFamilies();
  } catch (err) {
    console.error("Classement du poste en échec", err);
  }
  redirect("/search");
}

export async function deletePerson(fd: FormData) {
  await requireSuperAdmin();
  await sql`DELETE FROM people WHERE id = ${Number(fd.get("id"))}`;
  redirect("/search");
}
