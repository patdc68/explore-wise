import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
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

  async readPlaces(region: RegionConfig, limit: number): Promise<readonly FoursquarePlaceRow[]> {
    const catalog = assertSafeIdentifier(FOURSQUARE_ICEBERG_CATALOG_ALIAS);
    const schema = assertSafeIdentifier(this.schemaName);
    const table = assertSafeIdentifier(this.tableName);

    return this.withConnection(async (connection) => {
      const reader = await connection.runAndReadAll(`
        select
          fsq_place_id,
          name,
          latitude,
          longitude,
          address,
          locality,
          region,
          postcode,
          admin_region,
          post_town,
          po_box,
          country,
          date_created,
          date_refreshed,
          date_closed,
          tel,
          website,
          email,
          facebook_id,
          instagram,
          twitter,
          fsq_category_ids,
          fsq_category_labels,
          placemaker_url,
          unresolved_flags,
          bbox
        from ${catalog}.${schema}.${table}
        where country = $country
          and lower(region) = lower($region)
        order by fsq_place_id
        limit $limit
      `, {
        country: region.countryCode,
        region: region.displayName,
        limit,
      });
      return reader.getRowObjectsJson() as FoursquarePlaceRow[];
    });
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
