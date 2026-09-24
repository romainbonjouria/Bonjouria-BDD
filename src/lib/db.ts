import "server-only";
import postgres from "postgres";

declare global {
  var __sql: ReturnType<typeof postgres> | undefined;
}

// Pooler Supabase (Supavisor) en mode "transaction" :
// - prepare:false : pas de requêtes préparées nommées ;
// - max_pipeline:0 : une seule requête à la fois par connexion, sinon des requêtes
//   parallèles (Promise.all) peuvent rester bloquées indéfiniment.
//   (option supportée par postgres.js mais absente de ses types)
const options = {
  prepare: false,
  max_pipeline: 0,
  max: Number(process.env.DATABASE_POOL_MAX) || 5,
  idle_timeout: 20,
} as postgres.Options<{}>;

export const sql = globalThis.__sql ?? postgres(process.env.DATABASE_URL!, options);

if (process.env.NODE_ENV !== "production") globalThis.__sql = sql;
