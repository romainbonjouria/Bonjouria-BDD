"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PERSON_KEYS, type PersonField } from "@/lib/fields";

export type PersonActionResult = { error?: string } | undefined;

export async function savePerson(_prev: PersonActionResult, fd: FormData): Promise<PersonActionResult> {
  await requireAdmin();
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
  redirect("/search");
}

export async function deletePerson(fd: FormData) {
  await requireAdmin();
  await sql`DELETE FROM people WHERE id = ${Number(fd.get("id"))}`;
  redirect("/search");
}
