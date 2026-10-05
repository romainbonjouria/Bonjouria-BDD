// Liste métier des secteurs d'activité (partagée client / serveur) et correspondance avec les codes NAF.

export const SECTORS = [
  "Aéronautique & Spatial",
  "Agriculture & Agroalimentaire",
  "Associations & ESS",
  "Automobile & Mobilité",
  "Banque, Finance & Assurance",
  "BTP & Construction",
  "Commerce & Distribution",
  "Conseil & Audit",
  "Éducation & Recherche",
  "Énergie & Environnement",
  "Immobilier",
  "Industrie",
  "Ingénierie & R&D",
  "Juridique & Comptabilité",
  "Marketing, Communication & Médias",
  "Numérique, IT & Télécoms",
  "RH, Recrutement & Formation",
  "Santé, Pharma & Biotech",
  "Secteur public & Collectivités",
  "Services aux entreprises",
  "Sport, Culture & Loisirs",
  "Tourisme, Hôtellerie & Restauration",
  "Transport & Logistique",
] as const;

export type Sector = (typeof SECTORS)[number];

// Codes NAF trop génériques pour conclure (holdings, « autres services »…)
const GENERIC_NAF = new Set(["70.10Z", "64.20Z", "82.99Z", "94.99Z", "68.20B", "66.30Z", "74.90B", "96.09Z"]);

/** Secteur correspondant à un code NAF (ex. "30.30Z"), ou null si trop générique / inconnu. */
export function sectorFromNaf(naf: string | null | undefined): Sector | null {
  if (!naf || GENERIC_NAF.has(naf)) return null;
  const d = Number(naf.slice(0, 2));
  const code = naf.slice(0, 5);
  if (Number.isNaN(d)) return null;

  if (code === "30.30" || code === "33.16" || code === "51.10" || code === "51.21") return "Aéronautique & Spatial";
  if (code === "58.29") return "Numérique, IT & Télécoms";
  if (code.startsWith("85.5") || code === "85.59") return "RH, Recrutement & Formation";
  if (code.startsWith("70.2")) return "Conseil & Audit";

  if (d <= 3) return "Agriculture & Agroalimentaire";
  if (d <= 9) return "Énergie & Environnement";
  if (d <= 12) return "Agriculture & Agroalimentaire";
  if (d === 19 || d === 35 || (d >= 36 && d <= 39)) return "Énergie & Environnement";
  if (d === 21) return "Santé, Pharma & Biotech";
  if (d === 29 || d === 30 || d === 45) return "Automobile & Mobilité";
  if (d <= 33) return "Industrie";
  if (d >= 41 && d <= 43) return "BTP & Construction";
  if (d === 46 || d === 47) return "Commerce & Distribution";
  if (d >= 49 && d <= 53) return "Transport & Logistique";
  if (d === 55 || d === 56 || d === 79) return "Tourisme, Hôtellerie & Restauration";
  if (d >= 58 && d <= 60) return "Marketing, Communication & Médias";
  if (d >= 61 && d <= 63) return "Numérique, IT & Télécoms";
  if (d >= 64 && d <= 66) return "Banque, Finance & Assurance";
  if (d === 68) return "Immobilier";
  if (d === 69) return "Juridique & Comptabilité";
  if (d === 71 || d === 72) return "Ingénierie & R&D";
  if (d === 73) return "Marketing, Communication & Médias";
  if (d === 78) return "RH, Recrutement & Formation";
  if (d === 84 || d === 99) return "Secteur public & Collectivités";
  if (d === 85) return "Éducation & Recherche";
  if (d >= 86 && d <= 88) return "Santé, Pharma & Biotech";
  if (d >= 90 && d <= 93) return "Sport, Culture & Loisirs";
  if (d === 94) return "Associations & ESS";
  if (d === 74 || d === 75 || d === 77 || (d >= 80 && d <= 82) || d === 95 || d === 96) return "Services aux entreprises";
  return null;
}
