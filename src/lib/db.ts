import "server-only";
import postgres from "postgres";

declare global {
  var __sql: ReturnType<typeof postgres> | undefined;
}

// prepare:false est requis avec le pooler Supabase en mode "transaction".
export const sql =
  globalThis.__sql ??
  postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX) || 5,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") globalThis.__sql = sql;
