import { metroManilaRegion } from "../../../../data/regions/metro-manila.js";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadLocalEnvironment, requireFoursquareAccessToken } from "../config/environment.js";
import { FoursquareIcebergCatalog } from "../sources/foursquare-catalog.js";
import { FoursquareCatalogAccessError } from "../sources/foursquare-errors.js";

async function main(): Promise<void> {
  loadLocalEnvironment();
  const token = requireFoursquareAccessToken();
  const catalog = new FoursquareIcebergCatalog(token);
  if (process.argv.includes("--tables")) {
    console.log(JSON.stringify({ tables: await catalog.listTables() }, null, 2));
    return;
  }
  if (process.argv.includes("--categories")) {
    const categories = await catalog.readCategoryTaxonomy();
    const artifactDirectory = fileURLToPath(new URL("../../.artifacts/", import.meta.url));
    const artifactPath = fileURLToPath(new URL("../../.artifacts/foursquare-categories-os.json", import.meta.url));
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(artifactPath, JSON.stringify(categories, null, 2), { encoding: "utf8", mode: 0o600 });
    console.log(JSON.stringify({ artifactPath, categoryCount: categories.length }, null, 2));
    return;
  }
  const summaries = await catalog.inspectCountryAdministrativeValues(
    metroManilaRegion.countryCode,
  );
  const metroNamePattern = /(?:metro\s+manila|national\s+capital|\bncr\b|kalakhang\s+maynila)/iu;
  const metroNamed = summaries.filter((summary) => (
    metroNamePattern.test(summary.region ?? "") || metroNamePattern.test(summary.admin_region ?? "")
  ));

  console.log(JSON.stringify({
    country: metroManilaRegion.countryCode,
    administrativeCombinations: summaries.length,
    highestVolumeCombinations: summaries.slice(0, 25),
    metroNamedCombinations: metroNamed,
  }, null, 2));
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
  const message = cause instanceof Error ? cause.message : "Unknown Foursquare inspection error.";
  console.error(message);
  process.exitCode = 1;
});
