export const FOURSQUARE_MANUAL_TOKEN_MESSAGE =
  "Foursquare access token is invalid or expired. Generate a new Places Portal access token and update tools/ingestion/.env.local.";

export type FoursquareFailureClassification =
  | "authentication_failure"
  | "authorization_entitlement_failure"
  | "table_not_found"
  | "catalog_attach_failure"
  | "iceberg_extension_incompatibility"
  | "duckdb_node_api_issue"
  | "network_issue"
  | "schema_table_naming_issue"
  | "unknown_failure";

export type FoursquareFailurePhase = "duckdb_setup" | "catalog_attach" | "table_query";

export class FoursquareAuthenticationError extends Error {
  readonly classification = "authentication_failure" as const;

  constructor(message = FOURSQUARE_MANUAL_TOKEN_MESSAGE, options?: ErrorOptions) {
    super(message, options);
    this.name = "FoursquareAuthenticationError";
  }
}

export class FoursquareCatalogAccessError extends Error {
  constructor(
    readonly classification: FoursquareFailureClassification,
    readonly phase: FoursquareFailurePhase,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "FoursquareCatalogAccessError";
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function classifyFoursquareFailure(
  cause: unknown,
  phase: FoursquareFailurePhase,
): FoursquareFailureClassification {
  if (cause instanceof FoursquareAuthenticationError) {
    return cause.classification;
  }
  if (cause instanceof FoursquareCatalogAccessError) {
    return cause.classification;
  }

  const message = errorMessage(cause);
  if (/(?:\b401\b|unauthenticated|invalid.+token|token.+(?:expired|invalid))/iu.test(message)) {
    return "authentication_failure";
  }
  if (/(?:\b403\b|forbidden|access denied|permission denied|not entitled|entitlement)/iu.test(message)) {
    return "authorization_entitlement_failure";
  }
  if (/(?:could not resolve hostname|name or service not known|\bdns\b|nxdomain|network is unreachable|connection (?:refused|reset|timed out)|http timeout|tls|certificate)/iu.test(message)) {
    return "network_issue";
  }
  if (/(?:iceberg).*(?:extension|incompatib|version|not loaded|not installed)|(?:extension).*(?:iceberg).*(?:failed|error|not found)/iu.test(message)) {
    return "iceberg_extension_incompatibility";
  }
  if (/(?:table with name .* does not exist|table .* not found|table not found)/iu.test(message)) {
    return "table_not_found";
  }
  if (/(?:schema|catalog).*(?:does not exist|not found)|three-part|qualified name/iu.test(message)) {
    return "schema_table_naming_issue";
  }
  if (/(?:@duckdb\/node-api|node-bindings|native module|invalid napi|node api)/iu.test(message)) {
    return "duckdb_node_api_issue";
  }
  if (phase === "catalog_attach") {
    return "catalog_attach_failure";
  }

  return "unknown_failure";
}

export function sanitizeFoursquareError(
  cause: unknown,
  token: string,
  phase: FoursquareFailurePhase,
): Error {
  const classification = classifyFoursquareFailure(cause, phase);
  if (classification === "authentication_failure") {
    return new FoursquareAuthenticationError(FOURSQUARE_MANUAL_TOKEN_MESSAGE, {
      cause: cause instanceof Error ? cause : undefined,
    });
  }

  const rawMessage = errorMessage(cause);
  const sanitizedMessage = token.length > 0
    ? rawMessage.split(token).join("[REDACTED]")
    : rawMessage;
  return new FoursquareCatalogAccessError(
    classification,
    phase,
    `Foursquare Open Source Places request failed: ${sanitizedMessage}`,
    { cause: cause instanceof Error ? cause : undefined },
  );
}
