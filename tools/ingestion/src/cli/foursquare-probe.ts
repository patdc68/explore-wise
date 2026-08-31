import { loadLocalEnvironment, requireFoursquareAccessToken } from "../config/environment.js";
import { FoursquareIcebergCatalog } from "../sources/foursquare-catalog.js";
import { FoursquareCatalogAccessError } from "../sources/foursquare-errors.js";

async function main(): Promise<void> {
  loadLocalEnvironment();
  const token = requireFoursquareAccessToken();
  const catalog = new FoursquareIcebergCatalog(token);
  const result = await catalog.probeDocumentedTable();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((cause: unknown) => {
  if (cause instanceof FoursquareCatalogAccessError) {
    console.error(JSON.stringify({
      querySucceeded: false,
      classification: cause.classification,
      phase: cause.phase,
      message: cause.message,
    }, null, 2));
    process.exitCode = 1;
    return;
  }
  const message = cause instanceof Error ? cause.message : "Unknown Foursquare catalog error.";
  console.error(message);
  process.exitCode = 1;
});
