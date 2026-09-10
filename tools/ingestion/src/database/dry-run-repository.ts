import type { IngestionRepository } from "./repository.js";
import type {
  IngestionSummary,
  NormalizedStagingPlace,
  PlaceSnapshot,
  ProductionPlaceWrite,
} from "../types/index.js";

export class DryRunRepository implements IngestionRepository {
  async findExistingPlaces(): Promise<Map<string, PlaceSnapshot>> {
    return new Map();
  }

  async startRun(_summary: IngestionSummary): Promise<void> {
    throw new Error("Dry-run repository cannot start an ingestion run.");
  }

  async stageRecords(_records: readonly NormalizedStagingPlace[]): Promise<void> {
    throw new Error("Dry-run repository cannot stage records.");
  }

  async writePlaces(_records: readonly ProductionPlaceWrite[]): Promise<void> {
    throw new Error("Dry-run repository cannot write production places.");
  }

  async completeRun(_summary: IngestionSummary): Promise<void> {
    throw new Error("Dry-run repository cannot complete an ingestion run.");
  }
}

