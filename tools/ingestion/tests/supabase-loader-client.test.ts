import assert from "node:assert/strict";
import test from "node:test";
import { supabaseLoaderClientConfig } from "../src/database/supabase-loader-client.js";

const validEnvironment = {
  SUPABASE_DB_URL: "postgresql://postgres:password@db.wkgvnpamnhesmmbyikml.supabase.co:5432/postgres?sslmode=require",
};
const testCaCertificate = "-----BEGIN CERTIFICATE-----\nTEST CA\n-----END CERTIFICATE-----";

test("loader Postgres client requires the Explore-Wise direct host and verified SSL", () => {
  const config = supabaseLoaderClientConfig(validEnvironment, testCaCertificate);
  assert.deepEqual((config as { ssl?: unknown }).ssl, { ca: `${testCaCertificate}\n`, rejectUnauthorized: true });
  assert.match(config.connectionString ?? "", /^postgresql:\/\/postgres:password@db\.wkgvnpamnhesmmbyikml\.supabase\.co:5432\/postgres$/);
});

test("loader Postgres client accepts only the Explore-Wise Supabase Session Pooler form", () => {
  const config = supabaseLoaderClientConfig({
    SUPABASE_DB_URL: "postgresql://postgres.wkgvnpamnhesmmbyikml:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require",
  }, testCaCertificate);
  assert.deepEqual((config as { ssl?: unknown }).ssl, { ca: `${testCaCertificate}\n`, rejectUnauthorized: true });
  assert.match(config.connectionString ?? "", /^postgresql:\/\/postgres\.wkgvnpamnhesmmbyikml:password@aws-0-ap-southeast-1\.pooler\.supabase\.com:5432\/postgres$/);
});

test("loader Postgres client rejects malformed CA material", () => {
  assert.throws(() => supabaseLoaderClientConfig(validEnvironment, "not a certificate"), /valid PEM certificate/u);
});

test("loader Postgres client rejects absent, non-Postgres, arbitrary hosts, and invalid pooler forms without revealing credentials", () => {
  assert.throws(() => supabaseLoaderClientConfig({}, testCaCertificate), /SUPABASE_DB_URL is required/);
  assert.throws(() => supabaseLoaderClientConfig({ SUPABASE_DB_URL: "https://example.com" }, testCaCertificate), /PostgreSQL URL/);
  assert.throws(
    () => supabaseLoaderClientConfig({ SUPABASE_DB_URL: "postgresql://postgres:test-password@db.other-project.supabase.co/postgres" }, testCaCertificate),
    /expected db\.wkgvnpamnhesmmbyikml\.supabase\.co/,
  );
  assert.throws(
    () => supabaseLoaderClientConfig({ SUPABASE_DB_URL: "postgresql://postgres:password@pooler.supabase.com:5432/postgres" }, testCaCertificate),
    /official Supabase Session Pooler host/,
  );
  assert.throws(
    () => supabaseLoaderClientConfig({ SUPABASE_DB_URL: "postgresql://postgres.other-project:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" }, testCaCertificate),
    /Session Pooler username must be postgres\.wkgvnpamnhesmmbyikml/,
  );
  assert.throws(
    () => supabaseLoaderClientConfig({ SUPABASE_DB_URL: "postgresql://postgres.wkgvnpamnhesmmbyikml:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" }, testCaCertificate),
    /Session Pooler connection must use port 5432/,
  );
});
