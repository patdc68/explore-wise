export const IDENTITY_STATUSES = ["CONFIRMED_CHAIN", "UNRESOLVED", "REJECTED"] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

export type ChainIdentityRule = Readonly<{
  canonicalName: string;
  expectedHosts: readonly string[];
}>;

/** Historical file name; these rules identify brands of any location count. */
export const PILOT_BRAND_IDENTITY_RULES: readonly ChainIdentityRule[] = [
  { canonicalName: "Jollibee", expectedHosts: ["jollibee.com.ph", "www.jollibee.com.ph"] },
  { canonicalName: "McDonald's", expectedHosts: ["mcdonalds.com.ph", "www.mcdonalds.com.ph"] },
  { canonicalName: "KFC", expectedHosts: ["kfc.com.ph", "www.kfc.com.ph", "stores.kfc.com.ph"] },
  { canonicalName: "Starbucks", expectedHosts: ["starbucks.ph", "www.starbucks.ph"] },
  { canonicalName: "Chowking", expectedHosts: ["chowking.ph", "www.chowking.ph", "chowkingdelivery.com", "www.chowkingdelivery.com", "order.chowking.ph"] },
  { canonicalName: "Mang Inasal", expectedHosts: ["manginasal.ph", "www.manginasal.ph", "order.manginasal.ph", "stores.jfc.com.ph"] },
  { canonicalName: "Pickup Coffee", expectedHosts: ["pickup-coffee.com", "www.pickup-coffee.com"] },
  { canonicalName: "ZUS Coffee", expectedHosts: ["zuscoffee.ph", "www.zuscoffee.ph"] },
  { canonicalName: "Macao Imperial Tea", expectedHosts: ["macaoimperialtea.com", "www.macaoimperialtea.com"] },
  { canonicalName: "Chatime", expectedHosts: ["chatime.com.ph", "www.chatime.com.ph"] },
  { canonicalName: "Serenitea", expectedHosts: ["serenitea.info", "www.serenitea.info", "serenitea.ph", "www.serenitea.ph"] },
  { canonicalName: "CoCo Fresh Tea & Juice", expectedHosts: ["cocobubbletea.com", "www.cocobubbletea.com"] },
  { canonicalName: "Army Navy", expectedHosts: ["armynavy.com.ph", "www.armynavy.com.ph"] },
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
  if (!host) return { status: "UNRESOLVED", host: null, reason: "Name alone has no stable chain identity evidence." };
  if (input.rule.expectedHosts.includes(host)) {
    return { status: "CONFIRMED_CHAIN", host, reason: "Retained source record links this branch to the expected official merchant domain." };
  }
  return { status: "REJECTED", host, reason: "Retained source website conflicts with the expected official merchant domain." };
}
