import type { RawSourcePlace, RegionConfig } from "../types/index.js";

export interface SourceReadOptions {
  region: RegionConfig;
  limit?: number;
}

export interface PlaceSourceAdapter {
  readonly sourceCode: string;
  read(options: SourceReadOptions): Promise<readonly RawSourcePlace[]>;
}

