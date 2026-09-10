import type {
  IngestionSummary,
  NormalizedStagingPlace,
  PlaceSnapshot,
  ProductionPlaceWrite,
} from "../types/index.js";

export interface IngestionRepository {
  findExistingPlaces(records: readonly ProductionPlaceWrite[]): Promise<Map<string, PlaceSnapshot>>;
  startRun(summary: IngestionSummary): Promise<void>;
  stageRecords(records: readonly NormalizedStagingPlace[]): Promise<void>;
  writePlaces(records: readonly ProductionPlaceWrite[]): Promise<void>;
  completeRun(summary: IngestionSummary): Promise<void>;
}

