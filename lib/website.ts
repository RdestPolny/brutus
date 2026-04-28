import type { DigitalPresenceRow } from "./types";

const SOCIAL_PLATFORMS: Array<{ platform: string; pattern: RegExp }> = [
  { platform: "Facebook", pattern: /facebook\.com/i },
  { platform: "Instagram", pattern: /instagram\.com/i },
  { platform: "LinkedIn", pattern: /linkedin\.com\/company/i },
  { platform: "YouTube", pattern: /youtube\.com|youtu\.be/i },
  { platform: "TikTok", pattern: /tiktok\.com/i },
  { platform: "Twitter/X", pattern: /x\.com|twitter\.com/i },
];

export async function fetchWebsiteDigitalPresence(
  officialWebsite: string | null
): Promise<{ rows: DigitalPresenceRow[]; debug: unknown }> {
  if (!officialWebsite) return { rows: [], debug: { skipped: "No official website" } };

  const rows: DigitalPresenceRow[] = [
    {
      platform: "Strona internetowa",
      address: officialWebsite,
      details: "Oficjalna strona ustalona na podstawie pierwszego zapytania",
    },
  ];
  const debugPages: Array<{ url: string; status?: number; links?: string[]; error?: string }> = [];

  const pages = [officialWebsite, new URL("/kontakt", officialWebsite).toString()];

  for (const pageUrl of pages) {
    try {
      const res = await fetch(pageUrl, {
        headers: { "User-Agent": "Prezesol/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      const links = extractLinks(html, pageUrl);
      debugPages.push({ url: pageUrl, status: res.status, links });

      for (const link of links) {
        const platform = SOCIAL_PLATFORMS.find((item) => item.pattern.test(link));
        if (!platform) continue;
        if (rows.some((row) => normalizePlatform(row.platform) === normalizePlatform(platform.platform))) {
          continue;
        }

        rows.push({
          platform: platform.platform,
          address: cleanUrl(link),
          details: "Link znaleziony bezpośrednio na stronie firmowej",
        });
      }
    } catch (err) {
      debugPages.push({
        url: pageUrl,
        error: err instanceof Error ? err.message : "Unknown website fetch error",
      });
    }
  }

  return { rows, debug: { pages: debugPages } };
}

export function mergeDigitalPresenceRows(
  perplexityRows: DigitalPresenceRow[],
  websiteRows: DigitalPresenceRow[]
): DigitalPresenceRow[] {
  const merged = new Map<string, DigitalPresenceRow>();

  for (const row of [...perplexityRows, ...websiteRows]) {
    if (!isUsefulDigitalRow(row)) continue;

    const key = normalizePlatform(row.platform);
    const existing = merged.get(key);
    if (!existing || isNotFound(existing.address) || (!isNotFound(row.address) && row.details.length > existing.details.length)) {
      merged.set(key, row);
    }
  }

  return Array.from(merged.values()).sort((a, b) => platformOrder(a.platform) - platformOrder(b.platform));
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefRegex.exec(html))) {
    const href = match[1];
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    try {
      links.add(new URL(href, baseUrl).toString());
    } catch {
      // Ignore malformed href values.
    }
  }

  return Array.from(links);
}

function cleanUrl(url: string): string {
  return url.split("?")[0].replace(/\/$/, "");
}

function isUsefulDigitalRow(row: DigitalPresenceRow): boolean {
  const platform = normalizePlatform(row.platform);
  const address = row.address.toLowerCase();
  if (!platform) return false;
  if (platform.includes("rejestr") || platform.includes("krs")) return false;
  if (address.includes("rejestrkrs.pl") || address.includes("rejestr.io")) return false;
  return true;
}

function isNotFound(value: string): boolean {
  return !value || value.toLowerCase().includes("nie znaleziono") || value.toLowerCase() === "brak";
}

function normalizePlatform(platform: string): string {
  const value = platform.toLowerCase();
  if (value.includes("facebook")) return "facebook";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("linkedin")) return "linkedin";
  if (value.includes("youtube")) return "youtube";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("twitter") || value === "x") return "twitter_x";
  if (value.includes("email") || value.includes("e-mail")) return "email";
  if (value.includes("strona") || value.includes("www") || value.includes("wordpress")) return "website";
  return value.replace(/[^a-z0-9]+/g, "_");
}

function platformOrder(platform: string): number {
  const order = ["website", "email", "facebook", "instagram", "linkedin", "youtube", "tiktok", "twitter_x"];
  const index = order.indexOf(normalizePlatform(platform));
  return index === -1 ? order.length : index;
}
