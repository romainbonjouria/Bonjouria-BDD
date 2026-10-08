import { getCurrentUser } from "@/lib/auth";
import { PERSON_FIELDS } from "@/lib/fields";
import { sql } from "@/lib/db";
import { groupQuota } from "@/lib/quotas";
import { exportPeople, parseFilters } from "@/lib/people";

export const dynamic = "force-dynamic";

function cell(v: string | null) {
  if (v == null) return "";
  // Neutralise les formules (injection CSV dans Excel)
  const s = /^[=@\t\r]|^[+-][^\d\s(]/.test(v) ? "'" + v : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const filters = parseFilters(new URL(req.url).searchParams);
  const rows = await exportPeople(filters, user.hide_emails);
  // Quota mensuel d'exports du groupe (le super admin n'est pas concerné)
  if (user.role !== "super_admin" && user.group_id) {
    const quota = await groupQuota(user.group_id);
    if (quota?.maxExportsMonth != null && quota.exportedThisMonth + rows.length > quota.maxExportsMonth) {
      const left = Math.max(0, quota.maxExportsMonth - quota.exportedThisMonth);
      return Response.json(
        { error: `Quota d'exports du groupe dépassé : ${left} personne(s) exportable(s) ce mois-ci, ${rows.length} demandées.` },
        { status: 403 },
      );
    }
  }
  // Historique des téléchargements (consultable par les admins sur la fiche utilisateur)
  await sql`
    INSERT INTO export_log (user_id, row_count, filters)
    VALUES (${user.id}, ${rows.length}, ${new URL(req.url).searchParams.toString() || null})`;

  // Séparateur ";" + BOM UTF-8 : ouverture directe et correcte dans Excel (version française)
  const lines = [
    PERSON_FIELDS.map((f) => cell(f.label)).join(";"),
    ...rows.map((r) => PERSON_FIELDS.map((f) => cell(r[f.key])).join(";")),
  ];
  const csv = "﻿" + lines.join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="export-personnes-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
