export interface FoursquareStageOptions {
  sourceId: string;
  mode: { kind: "limited"; limit: number } | { kind: "all" };
  runId?: string;
  probeOnly: boolean;
  help: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function uuid(value: string, name: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error(`${name} must be a UUID.`);
  return value;
}

function valueAfter(args: readonly string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

export function foursquareStageHelp(): string {
  return [
    "Usage: npm run stage:foursquare -- --source-id <uuid> (--limit <1-5000> | --all) [--run-id <uuid>] [--probe]",
    "",
    "  --source-id <uuid>  Registered Foursquare source UUID (required).",
    "  --limit <1-5000>    Prepare a bounded number of relevant records.",
    "  --all                Stream every relevant Metro Manila record in 500-row batches.",
    "  --run-id <uuid>     Reuse a specific ingestion run UUID.",
    "  --probe              Inspect one 500-row batch and the query plan; write no artifacts.",
    "  --help               Show this help.",
  ].join("\n");
}

export function parseFoursquareStageOptions(args: readonly string[]): FoursquareStageOptions {
  let sourceId: string | undefined;
  let limit: number | undefined;
  let all = false;
  let runId: string | undefined;
  let probeOnly = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === "--source-id") {
      sourceId = uuid(valueAfter(args, index, option), option);
      index += 1;
    } else if (option === "--limit") {
      const rawLimit = valueAfter(args, index, option);
      limit = Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000) {
        throw new Error("--limit must be an integer from 1 to 5000.");
      }
      index += 1;
    } else if (option === "--all") {
      all = true;
    } else if (option === "--run-id") {
      runId = uuid(valueAfter(args, index, option), option);
      index += 1;
    } else if (option === "--probe") {
      probeOnly = true;
    } else if (option === "--help" || option === "-h") {
      help = true;
    } else {
      throw new Error(`Unknown argument: ${option}`);
    }
  }

  if (help) return { sourceId: sourceId ?? "", mode: { kind: "limited", limit: 1 }, probeOnly, help };
  if (!sourceId) throw new Error("--source-id requires a value.");
  if (all === (limit !== undefined)) throw new Error("Specify exactly one of --limit or --all.");
  return {
    sourceId,
    mode: all ? { kind: "all" } : { kind: "limited", limit: limit as number },
    ...(runId === undefined ? {} : { runId }),
    probeOnly,
    help: false,
  };
}
