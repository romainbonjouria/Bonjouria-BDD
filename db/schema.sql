-- Schéma de la base de données (idempotent : peut être relancé sans risque)

-- Groupes = sociétés clientes ; un admin gère les utilisateurs de son groupe
CREATE TABLE IF NOT EXISTS groups (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rôles : super_admin (tout), admin (invite et suit les utilisateurs de son groupe), user
CREATE TABLE IF NOT EXISTS app_users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  group_id      INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS people (
  id          BIGSERIAL PRIMARY KEY,
  first_name  TEXT,
  last_name   TEXT,
  email       TEXT UNIQUE,          -- stocké en minuscules, sert de clé de dédoublonnage
  phone       TEXT,
  company     TEXT,
  job_title   TEXT,
  sector      TEXT,
  city        TEXT,
  postal_code TEXT,
  country     TEXT,
  linkedin    TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cache de la détection automatique du secteur (une ligne par société)
CREATE TABLE IF NOT EXISTS company_sectors (
  company_key TEXT PRIMARY KEY,   -- nom de société normalisé
  sector      TEXT,               -- NULL = introuvable
  source      TEXT NOT NULL,      -- registre | ia
  naf         TEXT,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recherche insensible aux accents ("Evry" trouve "Évry")
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Les tables ne sont accessibles que via le serveur de l'application :
-- on active RLS sans politique pour bloquer l'API publique de Supabase.
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE people    ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_sectors ENABLE ROW LEVEL SECURITY;

-- Droits par utilisateur : masquer les emails dans l'annuaire et les exports
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS hide_emails BOOLEAN NOT NULL DEFAULT FALSE;

-- Historique des exports CSV (une ligne par téléchargement)
CREATE TABLE IF NOT EXISTS export_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count   INTEGER NOT NULL,
  filters     TEXT
);
CREATE INDEX IF NOT EXISTS export_log_user_idx ON export_log (user_id, exported_at DESC);
ALTER TABLE export_log ENABLE ROW LEVEL SECURITY;

-- Migration des bases existantes : colonne de groupe et nouveaux rôles
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('super_admin', 'admin', 'user'));
UPDATE app_users SET role = 'super_admin' WHERE role = 'admin' AND group_id IS NULL;

-- Invitations par email (lien à usage unique, valable 7 jours)
CREATE TABLE IF NOT EXISTS invitations (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Familles de métiers : regroupement des intitulés de poste libres
ALTER TABLE people ADD COLUMN IF NOT EXISTS job_family TEXT;
CREATE INDEX IF NOT EXISTS people_job_family_idx ON people (job_family);
CREATE TABLE IF NOT EXISTS job_families (
  title_key     TEXT PRIMARY KEY,   -- intitulé normalisé (minuscules, sans accents)
  family        TEXT NOT NULL,
  source        TEXT NOT NULL,      -- regle | ia
  classified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE job_families ENABLE ROW LEVEL SECURITY;

-- Historique des connexions (tableau de bord) et quotas par groupe
CREATE TABLE IF NOT EXISTS login_log (
  id        BIGSERIAL PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_log_user_idx ON login_log (user_id, logged_at DESC);
ALTER TABLE login_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS max_users INTEGER;            -- NULL = illimité
ALTER TABLE groups ADD COLUMN IF NOT EXISTS max_exports_month INTEGER;    -- personnes exportables par mois, NULL = illimité

-- Espaces de données : base commune (owner_group_id NULL) ou espace privé d'un groupe.
-- shared_access = le groupe voit aussi la base commune ; sinon uniquement ses propres fiches.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS shared_access BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE people ADD COLUMN IF NOT EXISTS owner_group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS people_email_shared_uniq ON people (email) WHERE owner_group_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS people_email_private_uniq ON people (owner_group_id, email) WHERE owner_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS people_owner_idx ON people (owner_group_id);
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_email_key;
