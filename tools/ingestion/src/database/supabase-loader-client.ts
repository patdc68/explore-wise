import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client, type ClientConfig } from "pg";

const PROJECT_REF = "wkgvnpamnhesmmbyikml";
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;
const SESSION_POOLER_HOST = /^aws-\d+-[a-z]{2}(?:-[a-z]+)+-\d+\.pooler\.supabase\.com$/u;
const SUPABASE_CA_CERTIFICATE_PATH = fileURLToPath(new URL("../../.secrets/supabase-ca.crt", import.meta.url));

function localSupabaseCaCertificate(): string {
  try {
    return readFileSync(SUPABASE_CA_CERTIFICATE_PATH, "utf8");
  } catch (cause) {
    throw new Error("The Supabase CA certificate is required at tools/ingestion/.secrets/supabase-ca.crt.", { cause });
  }
}

function validatedCaCertificate(value: string): string {
  const certificate = value.trim();
  if (!certificate.startsWith("-----BEGIN CERTIFICATE-----") || !certificate.endsWith("-----END CERTIFICATE-----")) {
    throw new Error("The local Supabase CA certificate is not a valid PEM certificate.");
  }
  return `${certificate}\n`;
}

export function supabaseLoaderClientConfig(
  environment: NodeJS.ProcessEnv = process.env,
  caCertificate: string = localSupabaseCaCertificate(),
): ClientConfig {
  const value = environment.SUPABASE_DB_URL?.trim();
  if (!value) throw new Error("SUPABASE_DB_URL is required in the operator environment; it is never read from or written to artifacts.");

  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("SUPABASE_DB_URL must be a PostgreSQL URL.");
  if (!url.username || !url.password || !url.pathname || url.pathname === "/") throw new Error("SUPABASE_DB_URL must include database credentials and database name.");
  const port = url.port || "5432";
  if (url.hostname === DIRECT_HOST) {
    if (port !== "5432") throw new Error("The direct Supabase database connection must use port 5432.");
  } else if (SESSION_POOLER_HOST.test(url.hostname)) {
    if (port !== "5432") throw new Error("The Supabase Session Pooler connection must use port 5432.");
    if (decodeURIComponent(url.username) !== `postgres.${PROJECT_REF}`) throw new Error(`The Supabase Session Pooler username must be postgres.${PROJECT_REF}.`);
  } else {
    throw new Error(`Refusing database host ${url.hostname}; expected ${DIRECT_HOST} or an official Supabase Session Pooler host.`);
  }

  // node-postgres parses sslmode from a connection string, which can override an
  // explicit SSL object. The loader always uses certificate validation instead.
  url.searchParams.delete("sslmode");
  return {
    connectionString: url.toString(),
    ssl: {
      ca: validatedCaCertificate(caCertificate),
      rejectUnauthorized: true,
    },
  };
}

export async function connectSupabaseLoaderDatabase(environment: NodeJS.ProcessEnv = process.env): Promise<Client> {
  const client = new Client(supabaseLoaderClientConfig(environment));
  try {
    await client.connect();
    return client;
  } catch (cause) {
    await client.end().catch(() => undefined);
    throw cause;
  }
}
