import { mkdir, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { connectSupabaseLoaderDatabase } from "../database/supabase-loader-client.js";
import { PILOT_CHAIN_IDENTITY_RULES, classifyChainIdentity, type ChainIdentityRule } from "../pricing/chain-pilot.js";

type BranchRow = Readonly<{
  place_id: string; source_place_id: string; place_name: string; address: string | null; source: string;
  website_url: string | null; fsq_place_id: string | null; placemaker_url: string | null;
}>;

type PricingConclusion = Readonly<{
  applicability: "NATIONALLY_CONSISTENT" | "REGIONALLY_CONSISTENT" | "BRANCH_SPECIFIC" | "CHANNEL_SPECIFIC" | "TEMPORARY/PROMOTIONAL" | "INSUFFICIENT_EVIDENCE";
  evidence: readonly string[];
  profileApplicable: false;
}>;

const PRICING: Readonly<Record<string, PricingConclusion>> = {
  "Jollibee": {
    applicability: "INSUFFICIENT_EVIDENCE", profileApplicable: false,
    evidence: [
      "Official Jollibee Help Center directs users to its website/app product directory, but this pilot did not obtain a branch-neutral, versioned Philippine price list.",
      "The official Kids Party menu help article says online menu availability may vary depending on store location; availability and price applicability must not be inferred.",
      "No reproducible official comparison established dine-in/pickup/delivery price parity across Metro Manila branches.",
    ],
  },
  "McDonald's": {
    applicability: "CHANNEL_SPECIFIC", profileApplicable: false,
    evidence: [
      "McDonald's Philippines directs its Menu link to McDelivery, an official delivery channel rather than a verified dine-in price list.",
      "No reproducible official comparison established delivery versus counter/pickup price parity or a branch-neutral menu scope.",
      "Promotions and app offers are excluded from a permanent reusable profile.",
    ],
  },
  "KFC": {
    applicability: "BRANCH_SPECIFIC", profileApplicable: false,
    evidence: [
      "KFC's official stores.kfc.com.ph pages are branch-scoped and expose store-specific menus/ordering options.",
      "The current official general menu contains different values for otherwise comparable items across rendered variants; the prior Novaliches evidence is stale and cannot establish present branch parity.",
      "A newer official source exists for identity, but no current branch-by-branch, same-channel price comparison was captured for a reusable profile.",
    ],
  },
  "Starbucks": {
    applicability: "INSUFFICIENT_EVIDENCE", profileApplicable: false,
    evidence: [
      "No retrievable, versioned official Philippine price list with a stated all-store scope was captured in this pilot.",
      "Reserve/premium-store assortment, food availability, add-ons, whole cakes, beans, merchandise, and bulk products require explicit exclusion or separate scope.",
      "No reproducible official comparison established standard-store versus Reserve or channel price parity.",
    ],
  },
  "SM Cinema": {
    applicability: "BRANCH_SPECIFIC", profileApplicable: false,
    evidence: [
      "SM Cinema's official ticketing requires the branch, movie/showing, ticket type, and format; it also distinguishes online fees.",
      "Official examples show 2D regular and IMAX prices that differ by branch/session/format, so a generic chain admission price would be misleading.",
      "Future prices need session/film/format/channel modelling, not a chain profile.",
    ],
  },
};

function ruleByName(name: string): ChainIdentityRule {
  const rule = PILOT_CHAIN_IDENTITY_RULES.find((item) => item.canonicalName === name);
  if (!rule) throw new Error(`No chain rule for ${name}.`);
  return rule;
}
function pricingByName(name: string): PricingConclusion {
  const pricing = PRICING[name];
  if (!pricing) throw new Error(`No pricing conclusion for ${name}.`);
  return pricing;
}

async function main(): Promise<void> {
  try { loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url))); } catch { /* operator environment is also supported */ }
  const db = await connectSupabaseLoaderDatabase();
  try {
    const result = await db.query<BranchRow>(`
      select p.id as place_id, p.source_place_id, p.name as place_name, p.address, p.source,
        coalesce(nullif(p.website_url, ''), nullif(st.source_payload->>'website', '')) as website_url,
        st.source_payload->>'fsq_place_id' as fsq_place_id, st.source_payload->>'placemaker_url' as placemaker_url
      from public.ew_places p
      left join public.ew_data_sources ds on ds.code=p.source
      left join lateral (
        select source_payload from public.ew_place_import_staging s
        where s.source_id=ds.id and s.source_place_id=p.source_place_id
        order by s.created_at desc limit 1
      ) st on true
      where p.status='active' and p.name in ('Jollibee', 'McDonald''s', 'KFC', 'Starbucks', 'SM Cinema')
      order by p.name, p.address nulls last, p.id
    `);
    const branches = result.rows.map((row) => {
      const rule = ruleByName(row.place_name);
      const identity = classifyChainIdentity({ rule, sourceWebsiteUrl: row.website_url });
      return {
        place_id: row.place_id, source_place_id: row.source_place_id, place_name: row.place_name, address: row.address,
        proposed_chain: rule.canonicalName, source: row.source, source_website_url: row.website_url,
        retained_foursquare_place_id: row.fsq_place_id, placemaker_url: row.placemaker_url,
        identity_status: identity.status,
        identity_evidence: { source: "Foursquare Open Source Places retained payload", source_place_id: row.source_place_id, official_domain: identity.host, detail: identity.reason },
        pricing_profile_applicable: false,
        applicability_evidence: pricingByName(rule.canonicalName).evidence,
      };
    });
    const chains = PILOT_CHAIN_IDENTITY_RULES.map((rule) => {
      const matches = branches.filter((branch) => branch.proposed_chain === rule.canonicalName);
      const confirmed = matches.filter((branch) => branch.identity_status === "CONFIRMED_CHAIN");
      const unresolved = matches.filter((branch) => branch.identity_status === "LIKELY_BUT_UNCONFIRMED");
      const rejected = matches.filter((branch) => branch.identity_status === "REJECTED");
      return {
        proposed_chain_name: rule.canonicalName,
        external_identity: { stable_source_brand_or_chain_id: null, expected_official_domains: rule.expectedHosts },
        identity_evidence: "No Foursquare brand/chain field was retained. A branch is confirmed only when its retained source record contains the expected official merchant domain.",
        pricing_applicability: pricingByName(rule.canonicalName),
        candidate_count: matches.length, confirmed_count: confirmed.length, unresolved_count: unresolved.length, rejected_count: rejected.length,
      };
    });
    const artifact = {
      schemaVersion: "explorewise.chain-pricing-applicability-pilot.v1",
      reviewStatus: "pending_human_review",
      generatedAt: new Date().toISOString(),
      productionSnapshot: { activePlaces: 25991, placePrices: 1, chains: 0, memberships: 0, casaManilaUnmodified: true },
      sourceFieldCoverage: {
        source: "Foursquare Open Source Places", retained_payload_fields: ["fsq_place_id", "placemaker_url", "website", "facebook_id", "instagram", "twitter", "fsq_category_ids", "fsq_category_labels"],
        unavailable_stable_brand_fields: ["brand_id", "chain_id", "parent_brand_id", "official_branch_id"],
      },
      chains,
      branches,
      proposed_memberships: branches.filter((branch) => branch.identity_status === "CONFIRMED_CHAIN"),
      unresolved_memberships: branches.filter((branch) => branch.identity_status === "LIKELY_BUT_UNCONFIRMED"),
      rejected_memberships: branches.filter((branch) => branch.identity_status === "REJECTED"),
      proposed_price_profiles: [],
      unresolved_price_profiles: chains.map((chain) => ({ chain: chain.proposed_chain_name, ...chain.pricing_applicability })),
      deterministic_spend_range_algorithm: {
        status: "DESIGN_ONLY_NO_SAFE_INPUT_PROFILE",
        method: "For a versioned official menu and a declared scope, select a fixed, reviewed whitelist of normal solo meals (or normal café beverages); exclude bundles, catering, merchandise, add-ons, delivery fees, premium outliers, and temporary promos. Sort included exact amounts. Set min/max to fixed lower/upper quantile positions using floor(0.20*(n-1)) and ceil(0.80*(n-1)), rounded only to the source currency minor unit. Preserve selected source item IDs and menu version. Any branch/channel mismatch, expired source, or fewer than five qualifying items produces no profile.",
      },
    };
    const artifactDirectory = fileURLToPath(new URL("../../.artifacts/price-pilot/", import.meta.url));
    const artifactPath = fileURLToPath(new URL("../../.artifacts/price-pilot/phase1-chain-pricing-applicability-pilot.json", import.meta.url));
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ artifactPath, candidates: branches.length, confirmedMemberships: artifact.proposed_memberships.length, proposedPriceProfiles: 0 }, null, 2));
  } finally { await db.end(); }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Unknown error."); process.exitCode = 1; });
