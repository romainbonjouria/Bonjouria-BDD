// Définition des champs d'une personne, partagée entre client et serveur.

export const PERSON_FIELDS = [
  { key: "first_name", label: "Prénom", aliases: ["prenom", "firstname", "first name", "given name"] },
  { key: "last_name", label: "Nom", aliases: ["nom", "lastname", "last name", "nom de famille", "surname", "family name"] },
  { key: "email", label: "Email", aliases: ["email", "e mail", "mail", "courriel", "adresse email", "adresse mail", "adresse e mail"] },
  { key: "phone", label: "Téléphone", aliases: ["telephone", "tel", "phone", "mobile", "portable", "numero", "numero de telephone", "n de telephone", "n telephone", "numero tel", "num tel", "numero de tel", "n de tel", "tel portable", "telephone portable", "telephone mobile", "gsm"] },
  { key: "company", label: "Société", aliases: ["societe", "entreprise", "company", "organisation", "organization", "raison sociale", "nom de societe", "nom societe", "nom de la societe", "nom entreprise", "employeur"] },
  { key: "job_title", label: "Poste", aliases: ["poste", "fonction", "titre", "job title", "title", "position", "intitule de poste"] },
  { key: "sector", label: "Secteur d'activité", aliases: ["secteur", "secteur d activite", "secteur activite", "activite", "industry", "industrie", "domaine", "domaine d activite"] },
  { key: "city", label: "Ville", aliases: ["ville", "city", "commune", "localite"] },
  { key: "postal_code", label: "Code postal", aliases: ["code postal", "cp", "postal code", "zip", "zip code", "codepostal"] },
  { key: "country", label: "Pays", aliases: ["pays", "country"] },
  { key: "linkedin", label: "LinkedIn", aliases: ["linkedin", "profil linkedin", "linkedin url", "url linkedin"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "commentaire", "commentaires", "remarques"] },
] as const;

export type PersonField = (typeof PERSON_FIELDS)[number]["key"];
export const PERSON_KEYS = PERSON_FIELDS.map((f) => f.key) as PersonField[];
export const FIELD_LABEL = Object.fromEntries(PERSON_FIELDS.map((f) => [f.key, f.label])) as Record<PersonField, string>;

export type Person = { id: number } & Record<PersonField, string | null>;

export function normalizeHeader(h: string) {
  return h
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ALIAS_MAP = new Map<string, PersonField>();
for (const f of PERSON_FIELDS) {
  for (const a of [f.key, f.label, ...f.aliases]) ALIAS_MAP.set(normalizeHeader(a), f.key);
}

/** Associe un en-tête CSV à un champ connu (ou null si non reconnu). */
export function matchHeader(header: string): PersonField | null {
  return ALIAS_MAP.get(normalizeHeader(header)) ?? null;
}

// Filtres de recherche disponibles (en plus de la recherche libre "q")
export const FILTER_FIELDS = ["city", "sector", "company", "job_title", "postal_code", "country"] as const satisfies readonly PersonField[];
export type FilterField = (typeof FILTER_FIELDS)[number];
export type Filters = Partial<Record<FilterField | "q", string>>;

// Champs saisissables une fois pour tout un fichier importé (appliqués aux lignes où la cellule est vide)
export const BATCH_FIELDS = ["sector", "city"] as const satisfies readonly PersonField[];
export type BatchField = (typeof BATCH_FIELDS)[number];
