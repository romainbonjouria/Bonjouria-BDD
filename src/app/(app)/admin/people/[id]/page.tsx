import { notFound } from "next/navigation";
import { getPerson } from "@/lib/people";
import PersonForm from "./person-form";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "new") {
    return <PersonForm person={null} />;
  }
  const num = Number(id);
  const person = Number.isInteger(num) ? await getPerson(num) : null;
  if (!person) notFound();
  return <PersonForm person={person} />;
}
