const FIRECRAWL_API = "https://api.firecrawl.dev";

const SOCIAL_DOMAINS: Record<string, string> = {
  "linkedin.com/company": "linkedin",
  "facebook.com": "facebook",
  "instagram.com": "instagram",
  "youtube.com": "youtube",
  "tiktok.com": "tiktok",
  "twitter.com": "twitter",
  "x.com": "x",
};

export interface WebsiteScrapeResult {
  text: string;                               // formatted source context for Gemini / research
  address: string | null;                     // for Places API
  phone: string | null;
  email: string | null;
  businessDescription: string | null;
  socialLinks: Record<string, string> | null; // deterministic from page links
  sourcePages: string[];
}

type FirecrawlPage = {
  url: string;
  markdown: string;
  links: string[];
  extract?: {
    legal_name?: string;
    address?: string;
    phone?: string;
    email?: string;
    business_description?: string;
    offer?: string;
    team?: string;
  };
};

const PRIORITY_PAGE_PATTERNS = [
  "kontakt",
  "contact",
  "o-nas",
  "onas",
  "about",
  "firma",
  "company",
  "zespol",
  "team",
  "kariera",
  "career",
  "praca",
  "oferta",
  "services",
  "uslugi",
];

// F1: scrape company website first, then a few high-signal internal pages.
// This is the authoritative layer for facts that can be read directly from the source.
export async function scrapeCompanyWebsite(domain: string): Promise<WebsiteScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return emptyWebsiteResult();

  const url = domain.startsWith("http") ? domain : `https://${domain}`;

  try {
    const home = await scrapeSourcePage(apiKey, url);
    if (!home) return emptyWebsiteResult();

    const priorityLinks = selectPriorityInternalLinks(url, home.links);
    const extraPages = (
      await Promise.all(priorityLinks.map((link) => scrapeSourcePage(apiKey, link)))
    ).filter(Boolean) as FirecrawlPage[];

    const pages = [home, ...extraPages];
    const allLinks = pages.flatMap((page) => page.links);

    const socialLinks: Record<string, string> = {};
    for (const link of allLinks) {
      for (const [domainKey, label] of Object.entries(SOCIAL_DOMAINS)) {
        if (link.includes(domainKey) && !socialLinks[label]) {
          const cleanUrl = link.split("?")[0].replace(/\/$/, "");
          if (cleanUrl.split("/").length >= 5) {
            socialLinks[label] = cleanUrl;
          }
        }
      }
    }

    const extracts = pages.map((page) => page.extract).filter(Boolean);
    const legalName = firstValue(extracts.map((extract) => extract?.legal_name));
    const address = firstValue(extracts.map((extract) => extract?.address));
    const phone = firstValue(extracts.map((extract) => extract?.phone));
    const email = firstValue(extracts.map((extract) => extract?.email));
    const businessDescription = firstValue(
      extracts.map((extract) => extract?.business_description)
    );
    const offer = firstValue(extracts.map((extract) => extract?.offer));
    const team = firstValue(extracts.map((extract) => extract?.team));

    const parts: string[] = [`=== ZRODLO: STRONA FIRMOWA (${url}) ===`];
    if (legalName) parts.push(`Nazwa prawna ze strony: ${legalName}`);
    if (businessDescription) parts.push(`Opis ze strony: ${businessDescription}`);
    if (offer) parts.push(`Oferta ze strony: ${offer}`);
    if (team) parts.push(`Zespol / osoby ze strony: ${team}`);
    if (address) parts.push(`Adres ze strony: ${address}`);
    if (phone) parts.push(`Telefon ze strony: ${phone}`);
    if (email) parts.push(`Email ze strony: ${email}`);
    if (Object.keys(socialLinks).length > 0) {
      parts.push(
        `Social media (ze strony): ${Object.entries(socialLinks)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")}`
      );
    }
    parts.push(`Przeskanowane podstrony: ${pages.map((page) => page.url).join(", ")}`);

    for (const page of pages) {
      if (!page.markdown.trim()) continue;
      parts.push(`\n--- Treść źródłowa: ${page.url} ---\n${truncate(page.markdown, 4000)}`);
    }

    return {
      text: parts.join("\n"),
      address,
      phone,
      email,
      businessDescription,
      socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : null,
      sourcePages: pages.map((page) => page.url),
    };
  } catch {
    return emptyWebsiteResult();
  }
}

async function scrapeSourcePage(apiKey: string, url: string): Promise<FirecrawlPage | null> {
  const res = await fetch(`${FIRECRAWL_API}/v1/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "links", "extract"],
      extract: {
        prompt:
          "Wyciągnij wyłącznie fakty widoczne na tej stronie: nazwę prawną, adres, telefon, email, opis działalności, ofertę/usługi i wymienione osoby lub zespół. Nie dopowiadaj brakujących danych.",
        schema: {
          type: "object",
          properties: {
            legal_name: { type: "string" },
            address: { type: "string" },
            phone: { type: "string" },
            email: { type: "string" },
            business_description: { type: "string" },
            offer: { type: "string" },
            team: { type: "string" },
          },
        },
      },
      timeout: 30000,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const pageData = data?.data;
  if (!pageData) return null;

  return {
    url,
    markdown: pageData.markdown ?? "",
    links: pageData.links ?? [],
    extract: pageData.extract,
  };
}

function selectPriorityInternalLinks(rootUrl: string, links: string[]): string[] {
  const root = new URL(rootUrl);
  const seen = new Set<string>();
  const scored: Array<{ url: string; score: number }> = [];

  for (const rawLink of links) {
    try {
      const link = new URL(rawLink, rootUrl);
      if (link.hostname.replace(/^www\./, "") !== root.hostname.replace(/^www\./, "")) continue;
      if (!["http:", "https:"].includes(link.protocol)) continue;
      if (/\.(pdf|jpg|jpeg|png|webp|zip|docx?)$/i.test(link.pathname)) continue;

      const clean = `${link.origin}${link.pathname}`.replace(/\/$/, "");
      if (seen.has(clean) || clean === rootUrl.replace(/\/$/, "")) continue;
      seen.add(clean);

      const haystack = decodeURIComponent(link.pathname.toLowerCase());
      const score = PRIORITY_PAGE_PATTERNS.reduce(
        (sum, pattern) => sum + (haystack.includes(pattern) ? 1 : 0),
        0
      );
      if (score > 0) scored.push({ url: clean, score });
    } catch {
      // Ignore malformed links from the source page.
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.url.length - b.url.length)
    .slice(0, 5)
    .map((item) => item.url);
}

function firstValue(values: Array<string | null | undefined>): string | null {
  const value = values.find((item) => typeof item === "string" && item.trim().length > 0);
  return value?.trim() ?? null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n[...ucieto dalsza tresc strony...]`;
}

function emptyWebsiteResult(): WebsiteScrapeResult {
  return {
    text: "",
    address: null,
    phone: null,
    email: null,
    businessDescription: null,
    socialLinks: null,
    sourcePages: [],
  };
}
