import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";
import { connectSupabaseLoaderDatabase } from "../database/supabase-loader-client.js";
import { getImportablePilotPrices, readPilotArtifact, validatePilotArtifact, type PilotArtifact, type PilotPrice } from "../pricing/pilot-artifact.js";

function parseArgs(args: readonly string[]): { artifactPath: string; apply: boolean } {
  const index = args.indexOf("--artifact");
  const artifactPath = index >= 0 ? args[index + 1] : undefined;
  if (!artifactPath || args.some((value) => !["--artifact", artifactPath, "--apply"].includes(value))) throw new Error("Usage: npm run import:price-pilot -- --artifact <path> [--apply]");
  return { artifactPath, apply: args.includes("--apply") };
}
function loadEnvironment(): void { try { loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url))); } catch { /* operator environment is also supported */ } if (!process.env.SUPABASE_DB_URL?.trim()) throw new Error("SUPABASE_DB_URL is required only with --apply."); }
async function databaseConflicts(db: Client, prices: readonly PilotPrice[]): Promise<string[]> {
  const conflicts: string[] = [];
  for (const price of prices) {
    const targetColumn = price.target.placeId ? "place_id" : "chain_id";
    let targetValue = price.target.placeId;
    if (!targetValue) {
      const brand = await db.query("select id from public.ew_chains where code=$1", [price.target.brandCode]);
      targetValue = brand.rows[0]?.id as string | undefined;
      if (!targetValue) continue;
    }
    const result = await db.query(`select min_amount_minor,max_amount_minor,pricing_status,pricing_source,price_precision,confidence_level,source_reference_url,source_reference_id from public.ew_place_prices where ${targetColumn}::text=$1 and currency_code=$2 and pricing_unit=$3`, [targetValue, price.currencyCode, price.pricingUnit]);
    const exact = result.rows.every((row) => String(row.min_amount_minor) === String(price.minAmountMinor)
      && String(row.max_amount_minor) === String(price.maxAmountMinor)
      && row.pricing_status === price.pricingStatus && row.pricing_source === price.pricingSource
      && row.price_precision === price.pricePrecision && row.confidence_level === price.confidenceLevel
      && row.source_reference_url === price.sourceUrl && row.source_reference_id === (price.sourceReferenceId ?? null));
    if (result.rowCount && !exact) conflicts.push(`${price.recordId}: existing ${targetColumn} pricing conflicts; manual review required`);
  }
  return conflicts;
}
async function applyArtifact(db: Client, artifact: PilotArtifact, prices: readonly PilotPrice[]): Promise<void> {
  await db.query("begin");
  try {
    const brandIds = new Map<string, string>();
    for (const brand of artifact.brands) {
      const result = await db.query("insert into public.ew_chains(code,name,country_code) values($1,$2,$3) on conflict(code) do update set name=excluded.name,country_code=excluded.country_code returning id", [brand.code, brand.name, brand.countryCode ?? null]);
      const brandId = result.rows[0]?.id as string | undefined;
      if (!brandId) throw new Error(`Unable to resolve brand ${brand.code}.`);
      brandIds.set(brand.code, brandId);
    }
    for (const membership of artifact.brandMemberships) {
      await db.query("insert into public.ew_place_chain_memberships(place_id,chain_id,link_source,source_reference_url,source_reference_metadata,pricing_profile_applicable,verified_at) values($1,$2,$3,$4,$5::jsonb,$6,$7) on conflict(place_id) do update set chain_id=excluded.chain_id,link_source=excluded.link_source,source_reference_url=excluded.source_reference_url,source_reference_metadata=excluded.source_reference_metadata,pricing_profile_applicable=excluded.pricing_profile_applicable,verified_at=excluded.verified_at", [membership.placeId, brandIds.get(membership.brandCode), membership.linkSource, membership.sourceUrl, JSON.stringify({ evidence_notes: membership.evidenceNotes }), membership.pricingProfileApplicable, membership.verifiedAt]);
    }
    for (const price of prices) {
      const brandId = price.target.brandCode ? brandIds.get(price.target.brandCode) : null;
      if (price.target.brandCode && !brandId) throw new Error(`Unable to resolve brand price target ${price.target.brandCode}.`);
      await db.query("insert into public.ew_place_prices(place_id,chain_id,currency_code,min_amount_minor,max_amount_minor,pricing_status,pricing_unit,pricing_source,price_precision,pricing_basis,pricing_channel,confidence_level,derivation_version,last_verified_at,source_reference_url,source_reference_id,source_reference_metadata,valid_from,valid_until) select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19 where not exists (select 1 from public.ew_place_prices existing where existing.place_id is not distinct from $1::uuid and existing.chain_id is not distinct from $2::uuid and existing.currency_code=$3 and existing.pricing_unit=$7 and existing.min_amount_minor=$4 and existing.max_amount_minor=$5 and existing.pricing_basis=$10 and existing.pricing_channel=$11 and existing.source_reference_url=$15 and existing.source_reference_id is not distinct from $16)", [price.target.placeId ?? null, brandId, price.currencyCode, price.minAmountMinor, price.maxAmountMinor, price.pricingStatus, price.pricingUnit, price.pricingSource, price.pricePrecision, price.pricingBasis, price.pricingChannel, price.confidenceLevel, price.derivationVersion ?? null, price.retrievedAt, price.sourceUrl, price.sourceReferenceId ?? null, JSON.stringify({ source_type: price.sourceType, source_title: price.sourceTitle ?? null, applicability_notes: price.applicabilityNotes, evidence_notes: price.evidenceNotes }), price.validFrom ?? null, price.validUntil ?? null]);
    }
    await db.query("commit");
  } catch (error) { await db.query("rollback"); throw error; }
}
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2)); const artifact = await readPilotArtifact(options.artifactPath);
  validatePilotArtifact(artifact, { requireApproved: options.apply });
  const prices = getImportablePilotPrices(artifact);
  if (!options.apply) { console.log(JSON.stringify({ dryRun: true, reviewStatus: artifact.reviewStatus, prices: prices.length, brands: artifact.brands.length, memberships: artifact.brandMemberships.length, message: "No database connection or production mutation was attempted." }, null, 2)); return; }
  loadEnvironment(); const db = await connectSupabaseLoaderDatabase();
  try { const conflicts = await databaseConflicts(db, prices); if (conflicts.length) throw new Error(`Import blocked:\n- ${conflicts.join("\n- ")}`); await applyArtifact(db, artifact, prices); console.log(JSON.stringify({ applied: true, prices: prices.length, brands: artifact.brands.length, memberships: artifact.brandMemberships.length }, null, 2)); } finally { await db.end(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Unknown import failure."); process.exitCode = 1; });
