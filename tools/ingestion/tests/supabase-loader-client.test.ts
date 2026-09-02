import assert from "node:assert/strict";
import test from "node:test";
import { supabaseLoaderClientConfig } from "../src/database/supabase-loader-client.js";

const validEnvironment = {
  SUPABASE_DB_URL: "postgresql://postgres:password@db.wkgvnpamnhesmmbyikml.supabase.co:5432/postgres?sslmode=require",
};

test("loader Postgres client requires the Explore-Wise direct host and verified SSL", () => {
  const config = supabaseLoaderClientConfig(validEnvironment);
  assert.deepEqual((config as { ssl?: unknown }).ssl, { rejectUnauthorized: true });
  assert.match(config.connectionString ?? "", /^postgresql:\/\/postgres:password@db\.wkgvnpamnhesmmbyikml\.supabase\.co:5432\/postgres$/);
});

test("loader Postgres client rejects absent, non-Postgres, and other-project URLs without revealing credentials", () => {
  assert.throws(() => supabaseLoaderClientConfig({}), /SUPABASE_DB_URL is required/);
  assert.throws(() => supabaseLoaderClientConfig({ SUPABASE_DB_URL: "https://example.com" }), /PostgreSQL URL/);
  assert.throws(
    () => supabaseLoaderClientConfig({ SUPABASE_DB_URL: "postgresql://postgres:test-password@db.other-project.supabase.co/postgres" }),
    /expected db\.wkgvnpamnhesmmbyikml\.supabase\.co/,
  );
});
