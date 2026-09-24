// Test de bout en bout (à lancer contre un serveur local) : node scripts/e2e-test.mts <fichier.csv>
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { matchHeader } from "../src/lib/fields.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "✔" : "✘"} ${msg}`);
  if (!ok) failures++;
};

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'");

/** Soumet le premier <form> contenant tous les champs donnés, comme un navigateur sans JS. */
async function submitForm(path: string, cookie: string, fields: Record<string, string>) {
  const html = await (await fetch(BASE + path, { headers: { cookie } })).text();
  const form =
    [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)]
      .map((m) => m[1])
      .find((f) => Object.keys(fields).every((k) => f.includes(`name="${k}"`))) ?? "";
  const fd = new FormData();
  for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = m[0].match(/name="([^"]*)"/)?.[1];
    const value = m[0].match(/value="([^"]*)"/)?.[1] ?? "";
    if (name) fd.append(decode(name), decode(value));
  }
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fetch(BASE + path, { method: "POST", body: fd, headers: { cookie, origin: BASE }, redirect: "manual" });
}

async function login(username: string, password: string) {
  const res = await submitForm("/login", "", { username, password });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { res, cookie: setCookie.split(";")[0], html: res.status === 200 ? await res.text() : "" };
}

// --- Accès sans session
check((await fetch(BASE + "/api/export")).status === 401, "export sans session → 401");
check((await fetch(BASE + "/admin/users", { redirect: "manual" })).status === 307, "admin sans session → redirection");

// --- Connexion
const bad = await login("admin", "mauvais");
check(!bad.cookie.startsWith("session=") && bad.html.includes("incorrect"), "mauvais mot de passe refusé");
const admin = await login("ADMIN", "Admin12345!");
check(admin.cookie.startsWith("session="), "connexion admin (identifiant insensible à la casse)");

// --- Import CSV (même logique que le navigateur)
const text = readFileSync(process.argv[2], "utf8");
const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
const mapping = Object.fromEntries((parsed.meta.fields ?? []).map((h) => [h, matchHeader(h)]));
console.log("  mapping :", mapping);
const rows = parsed.data.map((r) => Object.fromEntries(Object.entries(mapping).filter(([, f]) => f).map(([h, f]) => [f, r[h]])));
const doImport = async (cookie: string) =>
  fetch(BASE + "/api/import", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });

const imp1 = await (await doImport(admin.cookie)).json();
console.log("  import 1 :", imp1);
check(imp1.created === 4 && imp1.updated === 0 && imp1.skipped === 0, "1er import : 4 créées (doublon d'email fusionné)");
const imp2 = await (await doImport(admin.cookie)).json();
console.log("  import 2 :", imp2);
check(imp2.updated === 3 && imp2.created === 1, "2e import : 3 mises à jour (email), 1 créée (sans email)");

// --- Recherche
const s1 = await (await fetch(BASE + "/search?city=evry", { headers: { cookie: admin.cookie } })).text();
check(s1.includes("Dupont") && !s1.includes("Martin"), "recherche ville 'evry' (sans accent) trouve Évry");
const s2 = await (await fetch(BASE + "/search?q=dupont%20jean", { headers: { cookie: admin.cookie } })).text();
check(s2.includes("jean.dupont@exemple.fr"), "recherche libre 'dupont jean'");
const s3 = await (await fetch(BASE + "/search?company=100%25", { headers: { cookie: admin.cookie } })).text();
check(s3.includes("Aucun résultat"), "caractère joker '%' échappé");

// --- Export
const exp = await fetch(BASE + "/api/export?sector=informatique", { headers: { cookie: admin.cookie } });
const csv = await exp.text();
console.log("  export :\n" + csv.split("\r\n").map((l) => "    " + l).join("\n"));
check(new Uint8Array(await (await fetch(BASE + "/api/export", { headers: { cookie: admin.cookie } })).arrayBuffer())[0] === 0xef, "export avec BOM UTF-8");
check(csv.split("\r\n").length === 4 && !csv.includes("Dupont"), "export filtré : en-tête + 3 lignes (Paul importé 2 fois, sans email)");
check(csv.includes(`"Test; ""quote"""`) && csv.includes(`'=HYPERLINK`), "échappement CSV + neutralisation des formules");
const all = await (await fetch(BASE + "/api/export", { headers: { cookie: admin.cookie } })).text();
check(all.includes("jean.dupont@exemple.fr;01 02 03 04 05;Acme"), "doublon fusionné : dernier téléphone + société conservée");

// --- Gestion des utilisateurs par l'admin
const create = await submitForm("/admin/users", admin.cookie, { username: "Lucie.B", password: "motdepasse1", role: "user" });
check((await create.text()).includes("créé"), "création de l'utilisateur 'lucie.b'");
const dup = await submitForm("/admin/users", admin.cookie, { username: "lucie.b", password: "motdepasse1", role: "user" });
check((await dup.text()).includes("existe déjà"), "identifiant en double refusé");

const lucie = await login("lucie.b", "motdepasse1");
check(lucie.cookie.startsWith("session="), "connexion de l'utilisateur standard");
check((await fetch(BASE + "/admin/users", { headers: { cookie: lucie.cookie }, redirect: "manual" })).status === 307, "utilisateur : pas d'accès à /admin");
check((await doImport(lucie.cookie)).status === 403, "utilisateur : import interdit (403)");
check((await fetch(BASE + "/api/export", { headers: { cookie: lucie.cookie } })).status === 200, "utilisateur : export autorisé");
const ls = await (await fetch(BASE + "/search", { headers: { cookie: lucie.cookie } })).text();
check(ls.includes("Dupont") && !ls.includes("/admin/people/"), "utilisateur : recherche OK, pas de lien Modifier");

console.log(failures ? `\n${failures} échec(s)` : "\nTous les tests passent");
process.exit(failures ? 1 : 0);
