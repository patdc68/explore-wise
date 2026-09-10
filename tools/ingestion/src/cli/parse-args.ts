export interface CliOptions {
  source: string;
  region: string;
  dryRun: boolean;
  limit?: number;
}

function requireValue(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

export function parseCliArgs(args: readonly string[]): CliOptions {
  let source: string | undefined;
  let region: string | undefined;
  let limit: number | undefined;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === "--dry-run") {
      dryRun = true;
    } else if (option === "--source") {
      source = requireValue(args, index, option);
      index += 1;
    } else if (option === "--region") {
      region = requireValue(args, index, option);
      index += 1;
    } else if (option === "--limit") {
      const rawLimit = requireValue(args, index, option);
      limit = Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit <= 0) {
        throw new Error("--limit must be a positive integer.");
      }
      index += 1;
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
  }

  if (!source) {
    throw new Error("--source is required.");
  }
  if (!region) {
    throw new Error("--region is required.");
  }

  return {
    source,
    region,
    dryRun,
    ...(limit === undefined ? {} : { limit }),
  };
}

