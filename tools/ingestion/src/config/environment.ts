import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { FoursquareAuthenticationError } from "../sources/foursquare-errors.js";

const INGESTION_LOCAL_ENV_PATH = fileURLToPath(
  new URL("../../.env.local", import.meta.url),
);

export function loadLocalEnvironment(): void {
  try {
    loadEnvFile(INGESTION_LOCAL_ENV_PATH);
  } catch (cause) {
    // Operator-provided environment is an equivalent private credential source
    // for compiled/bundled execution where import.meta.url differs from src/.
    if (process.env.FOURSQUARE_ACCESS_TOKEN?.trim()) return;
    throw new FoursquareAuthenticationError(
      "Foursquare access token is missing. Add FOURSQUARE_ACCESS_TOKEN to tools/ingestion/.env.local.",
      { cause: cause instanceof Error ? cause : undefined },
    );
  }
}

export function requireFoursquareAccessToken(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const token = environment.FOURSQUARE_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new FoursquareAuthenticationError(
      "Foursquare access token is missing. Add FOURSQUARE_ACCESS_TOKEN to tools/ingestion/.env.local.",
    );
  }

  return token;
}
