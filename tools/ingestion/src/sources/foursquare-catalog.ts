import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import { foursquareCategoryRules } from "../../../../data/category-mappings/foursquare.js";
import type { RegionConfig } from "../types/index.js";
import {
  sanitizeFoursquareError,
  type FoursquareFailurePhase,
} from "./foursquare-errors.js";
import type {
  FoursquareCatalogReader,
  FoursquarePlaceRow,
} from "./foursquare.js";

export const FOURSQUARE_ICEBERG_ENDPOINT = "https://catalog.h3-hub.foursquare.com/iceberg";
export const FOURSQUARE_ICEBERG_WAREHOUSE = "places";
export const FOURSQUARE_ICEBERG_CATALOG_ALIAS = "places";
export const FOURSQUARE_PLACES_SCHEMA = "datasets";
export const FOURSQUARE_PLACES_TABLE = "places_os";

export interface FoursquareColumnMetadata {
  name: string;
  dataType: string;
}

export interface FoursquareCatalogProbeResult {
  duckdbVersion: string;
  catalogAttached: true;
  table: "places.datasets.places_os";
  querySucceeded: true;
  columns: readonly FoursquareColumnMetadata[];
  rowReturned: boolean;
}

export interface FoursquareAdministrativeSummary {
  region: string | null;
  admin_region: string | null;
  place_count: number | string;
  min_latitude: number | null;
  max_latitude: number | null;
  min_longitude: number | null;
  max_longitude: number | null;
  closed_count: number | string;
}

export interface FoursquareCategoryRow {
  category_id: string;
  category_level: number;
  category_name: string;
  category_label: string;
  level1_category_id: string | null;
  level1_category_name: string | null;
  level2_category_id: string | null;
  level2_category_name: string | null;
  level3_category_id: string | null;
  level3_category_name: string | null;
  level4_category_id: string | null;
  level4_category_name: string | null;
  level5_category_id: string | null;
  level5_category_name: string | null;
  level6_category_id: string | null;
  level6_category_name: string | null;
}

function categoryRulesSql(): string {
  return foursquareCategoryRules.map((rule) => {
    if (!/^[0-9a-f]{24}$/u.test(rule.categoryId)) {
      throw new Error(`Invalid Foursquare category rule ID: ${rule.categoryId}`);
    }
    if (
      rule.exploreWiseCategoryCode !== null
      && !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(rule.exploreWiseCategoryCode)
    ) {
      throw new Error(`Invalid ExploreWise category code: ${rule.exploreWiseCategoryCode}`);
    }
    const exploreWiseCategory = rule.exploreWiseCategoryCode === null
      ? "null"
      : `'${rule.exploreWiseCategoryCode}'`;
    return `('${rule.categoryId}', '${rule.decision}', ${exploreWiseCategory}, ${rule.precedence}, ${rule.matchDescendants})`;
  }).join(",\n");
}

function assertSafeIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/u.test(identifier)) {
    throw new Error(`Unsafe catalog identifier: ${identifier}`);
  }
  return identifier;
}

async function createTrustedCaBundle(): Promise<{ directory: string; path: string }> {
  const directory = await mkdtemp(join(tmpdir(), "explorewise-fsq-ca-"));
  const path = join(directory, "node-root-certificates.pem");
  await writeFile(path, `${rootCertificates.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  return { directory, path };
}

async function attachCatalog(
  connection: DuckDBConnection,
  token: string,
  caBundlePath: string,
): Promise<void> {
  await connection.run("INSTALL httpfs; LOAD httpfs; INSTALL iceberg; LOAD iceberg;");
  await connection.run("SET ca_cert_file = $caBundlePath", { caBundlePath });
  await connection.run("SET enable_server_cert_verification = true");
  await connection.run(
    "CREATE SECRET iceberg_secret (TYPE ICEBERG, TOKEN $token)",
    { token },
  );
  await connection.run(`
    ATTACH '${FOURSQUARE_ICEBERG_WAREHOUSE}' AS ${FOURSQUARE_ICEBERG_CATALOG_ALIAS} (
      TYPE ICEBERG,
      SECRET iceberg_secret,
      ENDPOINT '${FOURSQUARE_ICEBERG_ENDPOINT}'
    )
  `);
}

export class FoursquareIcebergCatalog implements FoursquareCatalogReader {
  constructor(
    private readonly token: string,
    private readonly tableName = FOURSQUARE_PLACES_TABLE,
    private readonly schemaName = FOURSQUARE_PLACES_SCHEMA,
  ) {}

  async probeDocumentedTable(): Promise<FoursquareCatalogProbeResult> {
    return this.withConnection(async (connection) => {
      const versionReader = await connection.runAndReadAll(
        "select version() as duckdb_version",
      );
      const versionRow = versionReader.getRowObjectsJson()[0];
      const reader = await connection.runAndReadAll(
        "select * from places.datasets.places_os limit 1",
      );
      const columns = reader.columnNames().map((name, index) => ({
        name,
        dataType: reader.columnType(index).toString(),
      }));

      return {
        duckdbVersion: typeof versionRow?.duckdb_version === "string"
          ? versionRow.duckdb_version
          : "unknown",
        catalogAttached: true,
        table: "places.datasets.places_os",
        querySucceeded: true,
        columns,
        rowReturned: reader.currentRowCount > 0,
      };
    });
  }

  async listTables(): Promise<readonly Record<string, unknown>[]> {
    return this.withConnection(async (connection) => {
      const reader = await connection.runAndReadAll("SHOW ALL TABLES");
      return reader.getRowObjectsJson();
    });
  }

  async readCategoryTaxonomy(): Promise<readonly FoursquareCategoryRow[]> {
    return this.withConnection(async (connection) => {
      const reader = await connection.runAndReadAll(`
        select *
        from places.datasets.categories_os
        order by category_id
      `);
      return reader.getRowObjectsJson() as unknown as FoursquareCategoryRow[];
    });
  }

  async inspectCountryAdministrativeValues(
    countryCode: string,
  ): Promise<readonly FoursquareAdministrativeSummary[]> {
    return this.withConnection(async (connection) => {
      const reader = await connection.runAndReadAll(`
        select
          region,
          admin_region,
          count(*) as place_count,
          min(latitude) as min_latitude,
          max(latitude) as max_latitude,
          min(longitude) as min_longitude,
          max(longitude) as max_longitude,
          count(*) filter (where date_closed is not null) as closed_count
        from places.datasets.places_os
        where country = $country
        group by region, admin_region
        order by count(*) desc, region nulls last, admin_region nulls last
      `, { country: countryCode });
      return reader.getRowObjectsJson() as unknown as FoursquareAdministrativeSummary[];
    });
  }

  async readPlaces(region: RegionConfig, limit: number): Promise<readonly FoursquarePlaceRow[]> {
    const catalog = assertSafeIdentifier(FOURSQUARE_ICEBERG_CATALOG_ALIAS);
    const schema = assertSafeIdentifier(this.schemaName);
    const table = assertSafeIdentifier(this.tableName);
    const rulesSql = categoryRulesSql();

    return this.withConnection(async (connection) => {
      const reader = await connection.runAndReadAll(`
        with category_rules (
          rule_category_id,
          decision,
          explorewise_category_code,
          precedence,
          match_descendants
        ) as (
          values
            ${rulesSql}
        ),
        taxonomy_rule_matches as (
          select
            c.category_id,
            c.category_label,
            r.decision,
            r.explorewise_category_code,
            r.precedence,
            r.rule_category_id,
            row_number() over (
              partition by c.category_id
              order by r.precedence, r.rule_category_id
            ) as rule_rank
          from ${catalog}.${schema}.categories_os as c
          join category_rules as r
            on r.rule_category_id = c.category_id
            or (
              r.match_descendants
              and r.rule_category_id in (
                c.level1_category_id,
                c.level2_category_id,
                c.level3_category_id,
                c.level4_category_id,
                c.level5_category_id,
                c.level6_category_id
              )
            )
        ),
        taxonomy_decisions as (
          select
            category_id,
            category_label,
            decision,
            explorewise_category_code,
            precedence,
            rule_category_id
          from taxonomy_rule_matches
          where rule_rank = 1
        ),
        metro_places as (
          select *
          from ${catalog}.${schema}.${table}
          where country = $country
            and lower(region) = lower($region)
            and latitude between $minLatitude and $maxLatitude
            and longitude between $minLongitude and $maxLongitude
        ),
        included_category_matches as (
          select
            p.fsq_place_id,
            source_category.category_id as selected_category_id,
            source_category.ordinality as source_category_ordinality,
            d.category_label as selected_category_label,
            d.explorewise_category_code,
            d.precedence,
            d.rule_category_id,
            row_number() over (
              partition by p.fsq_place_id
              order by d.precedence, source_category.ordinality, source_category.category_id
            ) as category_rank
          from metro_places as p
          cross join unnest(p.fsq_category_ids) with ordinality
            as source_category(category_id, ordinality)
          join taxonomy_decisions as d
            on d.category_id = source_category.category_id
           and d.decision = 'include'
        ),
        primary_category_matches as (
          select *
          from included_category_matches
          where category_rank = 1
        ),
        diverse_candidates as (
          select
            primary_category_matches.*,
            row_number() over (
              partition by explorewise_category_code
              order by fsq_place_id
            ) as diversity_rank
          from primary_category_matches
        ),
        chosen_ids as (
          select *
          from diverse_candidates
          order by diversity_rank, precedence, fsq_place_id
          limit $limit
        ),
        chosen_places as (
          select p.*, chosen_ids.* exclude (fsq_place_id)
          from metro_places as p
          join chosen_ids using (fsq_place_id)
        ),
        chosen_category_classifications as (
          select
            p.fsq_place_id,
            to_json(list(struct_pack(
              categoryId := source_category.category_id,
              categoryLabel := c.category_label,
              known := c.category_id is not null,
              decision := coalesce(d.decision, 'review'),
              exploreWiseCategoryCode := d.explorewise_category_code,
              precedence := d.precedence,
              matchedRuleCategoryId := d.rule_category_id
            ) order by source_category.ordinality)) as classifications
          from chosen_places as p
          cross join unnest(p.fsq_category_ids) with ordinality
            as source_category(category_id, ordinality)
          left join ${catalog}.${schema}.categories_os as c
            on c.category_id = source_category.category_id
          left join taxonomy_decisions as d
            on d.category_id = source_category.category_id
          group by p.fsq_place_id
        )
        select
          p.fsq_place_id,
          p.name,
          p.latitude,
          p.longitude,
          p.address,
          p.locality,
          p.region,
          p.postcode,
          p.admin_region,
          p.post_town,
          p.po_box,
          p.country,
          p.date_created,
          p.date_refreshed,
          p.date_closed,
          p.tel,
          p.website,
          p.email,
          p.facebook_id,
          p.instagram,
          p.twitter,
          p.fsq_category_ids,
          p.fsq_category_labels,
          p.placemaker_url,
          p.unresolved_flags,
          p.geom,
          p.bbox,
          p.selected_category_id as __selected_category_id,
          p.selected_category_label as __selected_category_label,
          p.explorewise_category_code as __explorewise_category_code,
          p.rule_category_id as __mapping_rule_id,
          p.diversity_rank as __diversity_rank,
          classifications.classifications as __category_classifications
        from chosen_places as p
        join chosen_category_classifications as classifications using (fsq_place_id)
        order by p.diversity_rank, p.precedence, p.fsq_place_id
      `, {
        country: region.countryCode,
        region: region.displayName,
        minLatitude: region.geographicBounds?.minLatitude ?? -90,
        maxLatitude: region.geographicBounds?.maxLatitude ?? 90,
        minLongitude: region.geographicBounds?.minLongitude ?? -180,
        maxLongitude: region.geographicBounds?.maxLongitude ?? 180,
        limit,
      });
      return reader.getRowObjectsJson() as FoursquarePlaceRow[];
    });
  }

  private optimizedRelevantPlacesSql(limitClause: string): string {
    const catalog = assertSafeIdentifier(FOURSQUARE_ICEBERG_CATALOG_ALIAS);
    const schema = assertSafeIdentifier(this.schemaName);
    const table = assertSafeIdentifier(this.tableName);
    const rulesSql = categoryRulesSql();

    return `
        with category_rules (rule_category_id, decision, explorewise_category_code, precedence, match_descendants) as (
          values ${rulesSql}
        ), taxonomy_rule_matches as (
          select c.category_id, c.category_label, r.decision, r.explorewise_category_code, r.precedence, r.rule_category_id,
            row_number() over (partition by c.category_id order by r.precedence, r.rule_category_id) as rule_rank
          from ${catalog}.${schema}.categories_os as c
          join category_rules as r on r.rule_category_id = c.category_id
            or (r.match_descendants and r.rule_category_id in (
              c.level1_category_id, c.level2_category_id, c.level3_category_id,
              c.level4_category_id, c.level5_category_id, c.level6_category_id
            ))
        ), taxonomy_decisions as (
          select category_id, category_label, decision, explorewise_category_code, precedence, rule_category_id
          from taxonomy_rule_matches where rule_rank = 1
        ), metro_places as (
          select
            fsq_place_id, name, latitude, longitude, address, locality, region, postcode, admin_region,
            post_town, po_box, country, date_created, date_refreshed, date_closed, tel, website, email,
            facebook_id, instagram, twitter, fsq_category_ids, fsq_category_labels, placemaker_url,
            unresolved_flags, geom, bbox
          from ${catalog}.${schema}.${table}
          where country = $country and region = $region
            and latitude between $minLatitude and $maxLatitude
            and longitude between $minLongitude and $maxLongitude
            and date_closed is null
        )
        , category_classifications as (
          select
            p.fsq_place_id,
            to_json(list(struct_pack(
              categoryId := source_category.category_id,
              categoryLabel := c.category_label,
              known := c.category_id is not null,
              decision := coalesce(d.decision, 'review'),
              exploreWiseCategoryCode := d.explorewise_category_code,
              precedence := d.precedence,
              matchedRuleCategoryId := d.rule_category_id
            ) order by source_category.ordinality)) as classifications
          from metro_places as p
          cross join unnest(p.fsq_category_ids) with ordinality as source_category(category_id, ordinality)
          left join ${catalog}.${schema}.categories_os as c
            on c.category_id = source_category.category_id
          left join taxonomy_decisions as d
            on d.category_id = source_category.category_id
          group by p.fsq_place_id
        )
        select
          p.*,
          null as __selected_category_id,
          null as __selected_category_label,
          null as __explorewise_category_code,
          null as __mapping_rule_id,
          classifications.classifications as __category_classifications
        from metro_places as p
        left join category_classifications as classifications using (fsq_place_id)
        ${limitClause}`;
  }

  private optimizedRelevantPlacesParameters(region: RegionConfig, limit?: number): Record<string, string | number> {
    return {
      country: region.countryCode,
      region: region.displayName,
      minLatitude: region.geographicBounds?.minLatitude ?? -90,
      maxLatitude: region.geographicBounds?.maxLatitude ?? 90,
      minLongitude: region.geographicBounds?.minLongitude ?? -180,
      maxLongitude: region.geographicBounds?.maxLongitude ?? 180,
      ...(limit === undefined ? {} : { limit }),
    };
  }

  async explainOptimizedRelevantBatch(region: RegionConfig, limit: number): Promise<readonly Record<string, unknown>[]> {
    return this.withConnection(async (connection) => {
      const reader = await connection.runAndReadAll(
        `explain ${this.optimizedRelevantPlacesSql("limit $limit")}`,
        this.optimizedRelevantPlacesParameters(region, limit),
      );
      return reader.getRowObjectsJson();
    });
  }

  async readOptimizedRelevantBatch(region: RegionConfig, limit: number): Promise<readonly FoursquarePlaceRow[]> {
    return this.withConnection(async (connection) => {
      const reader = await connection.runAndReadAll(
        this.optimizedRelevantPlacesSql("limit $limit"),
        this.optimizedRelevantPlacesParameters(region, limit),
      );
      return reader.getRowObjectsJson() as FoursquarePlaceRow[];
    });
  }

  async *streamOptimizedRelevantPlaces(
    region: RegionConfig,
    maxRecords: number | undefined,
    batchSize: number,
  ): AsyncGenerator<readonly FoursquarePlaceRow[]> {
    const instance = await DuckDBInstance.create(":memory:");
    const connection = await instance.connect();
    const caBundle = await createTrustedCaBundle();
    let phase: FoursquareFailurePhase = "duckdb_setup";
    try {
      phase = "catalog_attach";
      await attachCatalog(connection, this.token, caBundle.path);
      phase = "table_query";
      const result = await connection.stream(
        this.optimizedRelevantPlacesSql(maxRecords === undefined ? "" : "limit $limit"),
        this.optimizedRelevantPlacesParameters(region, maxRecords),
      );
      let batch: FoursquarePlaceRow[] = [];
      for await (const rows of result.yieldRowObjectJson()) {
        for (const row of rows) {
          batch.push(row as FoursquarePlaceRow);
          if (batch.length === batchSize) {
            yield batch;
            batch = [];
          }
        }
      }
      if (batch.length > 0) yield batch;
    } catch (cause) {
      throw sanitizeFoursquareError(cause, this.token, phase);
    } finally {
      connection.closeSync();
      instance.closeSync();
      await rm(caBundle.directory, { recursive: true, force: true });
    }
  }
  private async withConnection<T>(operation: (connection: DuckDBConnection) => Promise<T>): Promise<T> {
    const instance = await DuckDBInstance.create(":memory:");
    const connection = await instance.connect();
    const caBundle = await createTrustedCaBundle();
    let phase: FoursquareFailurePhase = "duckdb_setup";
    try {
      phase = "catalog_attach";
      await attachCatalog(connection, this.token, caBundle.path);
      phase = "table_query";
      return await operation(connection);
    } catch (cause) {
      throw sanitizeFoursquareError(cause, this.token, phase);
    } finally {
      connection.closeSync();
      instance.closeSync();
      await rm(caBundle.directory, { recursive: true, force: true });
    }
  }
}
