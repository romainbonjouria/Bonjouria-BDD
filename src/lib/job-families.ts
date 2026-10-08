// Familles de métiers : regroupe les intitulés de poste libres (« Plombier », « Plombier chauffagiste »…)
// pour que les filtres restent lisibles. Partagé client / serveur.

export const JOB_FAMILIES = [
  "Direction & Gouvernance",
  "Commercial & Ventes",
  "Marketing & Communication",
  "Ressources humaines",
  "Finance & Comptabilité",
  "Juridique & Conformité",
  "Informatique & Data",
  "Projet & Produit",
  "Ingénierie & R&D",
  "Production & Industrie",
  "Qualité, Hygiène & Sécurité",
  "Logistique, Achats & Transport",
  "Santé & Social",
  "Enseignement & Formation",
  "BTP, Artisanat & Métiers manuels",
  "Immobilier",
  "Hôtellerie, Restauration & Tourisme",
  "Administratif & Support",
  "Conseil & Expertise",
  "Autre",
] as const;

export type JobFamily = (typeof JOB_FAMILIES)[number];

/** Clé normalisée d'un intitulé (sans accents ni ponctuation) : même calcul que la clé SQL. */
export function titleKey(title: string) {
  return title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Règles par mots-clés, appliquées dans l'ordre sur la clé normalisée : la première qui correspond gagne.
// Elles couvrent les intitulés courants sans IA ; le reste est confié à l'IA.
const RULES: [RegExp, JobFamily][] = [
  [/\b(dsi|cto|cio|developpeu[rs]e?|developer|devops|data|informatique|software|logiciel|cybersecurite|sysadmin|administrateur systemes?|reseaux?|it manager|web ?master|full ?stack|front ?end|back ?end|scrum master)\b/, "Informatique & Data"],
  [/\b(plombi\w+|peintre|electricien\w*|macon\w*|menuisi\w+|charpenti\w+|couvreu\w+|carreleu\w+|chauffagiste|serrurier|plaquiste|vitrier|artisan\w*|ouvrier\w*|conducteur de travaux|chef de chantier|btp|batiment|travaux|installateur|frigoriste|soudeu\w+|monteur)\b/, "BTP, Artisanat & Métiers manuels"],
  [/\b(cuisini\w+|chef de cuisine|serveu\w+|restaurat\w+|hotel\w*|hotellerie|receptionniste|tourisme|touristique|barman|sommelier|traiteur|boulanger|patissier|gerant de restaurant)\b/, "Hôtellerie, Restauration & Tourisme"],
  [/\b(marketing|communication|community manager|social media|brand|content|redact\w+|journalist\w+|graphiste|growth|seo|relations? presse|digital)\b/, "Marketing & Communication"],
  [/\b(infirmi\w+|medecin\w*|pharmacien\w*|aide soignant\w*|kinesitherapeute|dentiste|chirurgien\w*|psycholog\w+|sante|social|educateur\w*|orthophoniste|osteopathe|sage femme|ehpad|soignant\w*|veterinair\w+)\b/, "Santé & Social"],
  [/\b(professeur\w*|enseignant\w*|formateu\w+|formatrice\w*|trainer|teacher|instituteur|institutrice|maitre de conferences|pedagogique|formation)\b/, "Enseignement & Formation"],
  [/\b(rh|drh|ressources humaines|recrut\w+|talent|human resources|hr|paie|gpec|people)\b/, "Ressources humaines"],
  [/\b(comptab\w+|comptable|financ\w+|daf|cfo|controleu\w+ de gestion|tresori\w+|auditeu\w+|banqui\w+|credit|assurance\w*|gestionnaire de paie)\b/, "Finance & Comptabilité"],
  [/\b(avocat\w*|juriste\w*|legal|notaire\w*|huissier|conformite|compliance|dpo|juridique)\b/, "Juridique & Conformité"],
  [/\b(commerc\w+|vente\w*|vendeu\w+|vendeuse|sales|business develop\w+|account manager|charge d affaires|key account|representant\w*|attache commercial|negociat\w+|prospect\w+)\b/, "Commercial & Ventes"],
  [/\b(immobili\w+|syndic|promoteur|agent immobilier)\b/, "Immobilier"],
  [/\b(logisti\w+|achat\w*|acheteu\w+|supply chain|approvisionn\w+|transport\w*|magasinier|chauffeur\w*|livreu\w+|cariste|expedition)\b/, "Logistique, Achats & Transport"],
  [/\b(qualite|qhse|hse|hygiene|securite|environnement|prevention)\b/, "Qualité, Hygiène & Sécurité"],
  [/\b(production|operateu\w+|usine|fabrication|maintenance|chef d atelier|mecanicien\w*|industriel\w*|technicien\w*|atelier)\b/, "Production & Industrie"],
  [/\b(ingenieu\w+|engineer|r d|recherche|chercheu\w+|researcher|scientist|bureau d etudes?|ingenierie)\b/, "Ingénierie & R&D"],
  [/\b(chef de projet|project manager|product owner|product manager|program manager|pmo|chef de produit|chargee? de projet|responsable projet)\b/, "Projet & Produit"],
  [/\b(consultant\w*|conseil\w*|conseiller\w*|advisor|expert\w*|coach)\b/, "Conseil & Expertise"],
  [/\b(assistant\w*|secretaire\w*|office manager|administratif\w*|accueil|gestionnaire|support|back office)\b/, "Administratif & Support"],
  [/\b(ceo|chief executive officer|coo|pdg|dg|president\w*|directeu\w+ general\w*|directrice generale|gerant\w*|fondateu\w+|fondatrice|founder|co ?founder|cofondateu\w+|dirigeant\w*|managing director|owner|proprietaire|associe\w*|directeu\w+|directrice|manager)\b/, "Direction & Gouvernance"],
];

/** Famille déduite des mots-clés de l'intitulé, ou null si aucune règle ne s'applique. */
export function familyFromRules(title: string): JobFamily | null {
  const key = titleKey(title);
  if (!key) return null;
  for (const [re, family] of RULES) if (re.test(key)) return family;
  return null;
}
