-- Schéma de la base de données (idempotent : peut être relancé sans risque)

CREATE TABLE IF NOT EXISTS app_users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
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
