# BonjourIA — Annuaire

Application web de recherche de contacts professionnels.

- **Utilisateurs** : recherche multicritère (ville, secteur d'activité, société, poste, code postal, pays, recherche libre), export CSV du résultat.
- **Administrateurs** : import CSV (mise à jour si l'email existe déjà), ajout / modification / suppression de fiches, gestion des comptes (création, rôle, activation, mot de passe).

Stack : Next.js 16 · PostgreSQL (Supabase) · hébergement Vercel.

---

## Mise en ligne (gratuite)

### 1. Base de données — Supabase

1. Sur [supabase.com](https://supabase.com), ouvrez votre projet (région Europe conseillée).
2. Bouton **Connect** (en haut) → onglet **Connection string** → section **Transaction pooler** (port `6543`).
   Copiez l'URL et remplacez `[YOUR-PASSWORD]` par le mot de passe de la base.
3. En local, copiez `.env.example` vers `.env` et remplissez :
   - `DATABASE_URL` : l'URL ci-dessus
   - `AUTH_SECRET` : une longue chaîne aléatoire, par ex. générée avec
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` : votre premier compte administrateur
4. Créez les tables et l'admin :
   ```bash
   npm install
   npm run db:init
   ```

### 2. Hébergement — Vercel

1. Sur [vercel.com](https://vercel.com), connectez-vous avec **Continue with GitHub**.
2. **Add New… → Project** → importez le dépôt GitHub.
3. Dans **Environment Variables**, ajoutez `DATABASE_URL` et `AUTH_SECRET` (mêmes valeurs que dans `.env`).
4. **Deploy**. L'URL publique (`https://<projet>.vercel.app`) est fournie à la fin.

Chaque `git push` sur la branche `main` redéploie automatiquement.

> ⚠ Le plan gratuit Supabase met le projet en pause après 7 jours sans activité ; il se réactive depuis le tableau de bord Supabase.

---

## Développement local

```bash
npm install
npm run dev        # http://localhost:3000
```

## Format du CSV d'import

- Séparateur `;` ou `,` (détecté automatiquement), encodage UTF-8 ou Windows-1252 (Excel).
- Les en-têtes courants sont reconnus automatiquement (ex. `Prénom`, `Nom`, `Email`/`E-mail`/`Mail`, `Société`/`Entreprise`,
  `Poste`/`Fonction`, `Secteur d'activité`/`Secteur`, `Ville`, `Code postal`/`CP`, `Pays`, `Téléphone`, `LinkedIn`, `Notes`).
  La correspondance peut être ajustée colonne par colonne avant l'import.
- **Doublons** : si l'email existe déjà, la fiche est mise à jour ; les cellules vides n'effacent pas les valeurs existantes.

Exemple :

```csv
Prénom;Nom;Email;Société;Poste;Secteur d'activité;Ville;Code postal
Jean;Dupont;jean.dupont@exemple.fr;Acme;Directeur;Industrie;Évry;91000
```

## Sécurité

- Mots de passe hachés (bcrypt), session signée dans un cookie `httpOnly`.
- Pas d'inscription publique : seuls les administrateurs créent des comptes.
- Chaque page / action revérifie en base que le compte est actif et son rôle.
- Row Level Security activé sur les tables : l'API publique Supabase n'y a pas accès.
- Export CSV protégé contre l'injection de formules Excel.
