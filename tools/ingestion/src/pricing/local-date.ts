export type LocalDayBoundary = "start" | "end";

type DateParts = Readonly<{ year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number }>;

function parseCalendarDate(value: string): Readonly<{ year: number; month: number; day: number }> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new RangeError("calendar date must be YYYY-MM-DD");
  const [year, month, day] = match.slice(1).map(Number);
  if ([year, month, day].some((part) => part === undefined || !Number.isInteger(part))) throw new RangeError("calendar date is invalid");
  const utc = new Date(Date.UTC(year!, month! - 1, day!));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month! - 1 || utc.getUTCDate() !== day) throw new RangeError("calendar date is invalid");
  return { year: year!, month: month!, day: day! };
}

function timeZoneOffsetMilliseconds(instantMs: number, timeZone: string): number {
  // Intl exposes seconds, not milliseconds. Resolve the offset at the whole
  // second so an end-of-day .999 boundary cannot drift into the next day.
  const wholeSecondInstant = Math.floor(instantMs / 1_000) * 1_000;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const values = Object.fromEntries(formatter.formatToParts(new Date(wholeSecondInstant)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])) as Record<string, number>;
  return Date.UTC(values.year!, values.month! - 1, values.day!, values.hour!, values.minute!, values.second!) - wholeSecondInstant;
}

/** Converts an operator-supplied calendar day in an IANA timezone to a UTC instant. */
export function localCalendarDayBoundaryToUtc(calendarDate: string, timeZone: string, boundary: LocalDayBoundary): string {
  const { year, month, day } = parseCalendarDate(calendarDate);
  if (!Intl.DateTimeFormat(undefined, { timeZone }).resolvedOptions().timeZone) throw new RangeError("timeZone is invalid");
  const local: DateParts = boundary === "start"
    ? { year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 }
    : { year, month, day, hour: 23, minute: 59, second: 59, millisecond: 999 };
  const wallClockMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond);
  let instantMs = wallClockMs;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const candidate = wallClockMs - timeZoneOffsetMilliseconds(instantMs, timeZone);
    if (candidate === instantMs) return new Date(candidate).toISOString();
    instantMs = candidate;
  }
  return new Date(instantMs).toISOString();
}
