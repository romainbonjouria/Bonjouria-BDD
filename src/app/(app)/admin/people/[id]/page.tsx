import { requireSuperAdmin } from "@/lib/auth";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { getPerson } from "@/lib/people";
import PersonForm from "./person-form";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  if (id === "new") {
    const groups = await sql<{ id: number; name: string }[]>`SELECT id, name FROM groups ORDER BY name`;
    return <PersonForm person={null} groups={groups} />;
  }
  const num = Number(id);
  const person = Number.isInteger(num) ? await getPerson(num) : null;
  if (!person) notFound();
  return <PersonForm person={person} />;
}
