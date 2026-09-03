export const IDENTITY_STATUSES = ["CONFIRMED_CHAIN", "LIKELY_BUT_UNCONFIRMED", "REJECTED"] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

export type ChainIdentityRule = Readonly<{
  canonicalName: string;
  expectedHosts: readonly string[];
}>;

export const PILOT_CHAIN_IDENTITY_RULES: readonly ChainIdentityRule[] = [
  { canonicalName: "Jollibee", expectedHosts: ["jollibee.com.ph", "www.jollibee.com.ph"] },
  { canonicalName: "McDonald's", expectedHosts: ["mcdonalds.com.ph", "www.mcdonalds.com.ph"] },
  { canonicalName: "KFC", expectedHosts: ["kfc.com.ph", "www.kfc.com.ph", "stores.kfc.com.ph"] },
  { canonicalName: "Starbucks", expectedHosts: ["starbucks.ph", "www.starbucks.ph"] },
  { canonicalName: "SM Cinema", expectedHosts: ["smcinema.com", "www.smcinema.com"] },
];

function hostname(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    // Foursquare's retained website field can carry a transparent redirect to
    // a merchant URL. Parse only its explicit target; never infer from text.
    if (url.hostname.toLowerCase() === "redirect.foursquare.com") return hostname(url.searchParams.get("u"));
    return url.hostname.toLowerCase();
  } catch { return null; }
}

/**
 * A matching name is deliberately not an identity signal. Confirmation needs a
 * retained branch record which names the expected merchant-controlled domain.
 */
export function classifyChainIdentity(input: Readonly<{
  rule: ChainIdentityRule;
  sourceWebsiteUrl: string | null;
}>): Readonly<{ status: IdentityStatus; host: string | null; reason: string }> {
  const host = hostname(input.sourceWebsiteUrl);
  if (!host) return { status: "LIKELY_BUT_UNCONFIRMED", host: null, reason: "Name alone has no stable chain identity evidence." };
  if (input.rule.expectedHosts.includes(host)) {
    return { status: "CONFIRMED_CHAIN", host, reason: "Retained source record links this branch to the expected official merchant domain." };
  }
  return { status: "REJECTED", host, reason: "Retained source website conflicts with the expected official merchant domain." };
}
