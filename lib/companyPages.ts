import { scrapeReadableContentWithDebug } from "./firecrawl";
import { askGeminiJsonWithDebug } from "./gemini";
import { markdownToEssentialText } from "./htmlText";
import type { CompanyPagesReport, CompanyPageScrape } from "./types";

const CAREER_PATTERNS = ["kariera", "praca", "career", "careers", "jobs", "dolacz", "join-us", "rekrutacja"];
const NEWS_PATTERNS = ["aktualnosci", "aktualności", "news", "nowosci", "press", "prasa", "media"];
const BLOG_PATTERNS = ["blog", "artykuly", "artykuły"];
const ABOUT_PATTERNS = ["o-firmie", "o-nas", "about", "about-us"];
const CASE_PATTERNS = ["case-study", "case-studies", "realizacje", "portfolio", "wdrozenia"];

const SCRAPE_TIMEOUT = 30000;
const MAX_PAGES_TO_SCRAPE = 5;

export async function fetchCompanyPagesWithDebug(
  officialWebsite: string | null
): Promise<{ report: CompanyPagesReport; debug: CompanyPagesDebug }> {
  if (!officialWebsite) {
    return {
      report: emptyReport(),
      debug: { skipped: "No official website" },
    };
  }

  const candidatePaths = await discoverCandidatePaths(officialWebsite);
  const targets = pickHighValuePages(officialWebsite, candidatePaths);

  if (targets.length === 0) {
    return {
      report: { ...emptyReport(), discovered: candidatePaths },
      debug: { discoveredPaths: candidatePaths, skipped: "No high-value pages discovered" },
    };
  }

  const scrapes = await Promise.all(
    targets.slice(0, MAX_PAGES_TO_SCRAPE).map(async (target) => {
      try {
        const scrape = await scrapeReadableContentWithDebug(target.url, {
          formats: ["markdown"],
          onlyMainContent: true,
          timeout: SCRAPE_TIMEOUT,
        });
        return { target, scrape, error: null as string | null };
      } catch (err) {
        return {
          target,
          scrape: null,
          error: err instanceof Error ? err.message : "Firecrawl error",
        };
      }
    })
  );

  const usefulScrapes = scrapes.filter(
    (item): item is { target: PageTarget; scrape: NonNullable<typeof item.scrape>; error: null } =>
      Boolean(item.scrape && item.scrape.markdown)
  );

  if (usefulScrapes.length === 0) {
    return {
      report: { ...emptyReport(), discovered: candidatePaths },
      debug: {
        discoveredPaths: candidatePaths,
        scrapes: scrapes.map((item) => ({ url: item.target.url, error: item.error })),
        skipped: "No useful scrapes",
      },
    };
  }

  const aggregatedText = usefulScrapes
    .map(({ target, scrape }) => {
      const text = markdownToEssentialText(scrape.markdown).slice(0, 8000);
      return `### ${target.kind.toUpperCase()} :: ${target.url}\n${text}`;
    })
    .join("\n\n");

  const extraction = await askGeminiJsonWithDebug<GeminiCompanyPagesExtraction>(
    buildExtractionPrompt(aggregatedText),
    {
      systemInstruction:
        "Wyciągasz wyłącznie fakty widoczne w przekazanych fragmentach stron firmowych. Nie wymyślasz, nie uzupełniasz danych z pamięci.",
    }
  );

  const pages: CompanyPageScrape[] = (extraction.content?.pages ?? []).map((page) => ({
    kind: normalizePageKind(page.kind),
    url: String(page.url ?? ""),
    title: String(page.title ?? ""),
    highlights: Array.isArray(page.highlights)
      ? page.highlights.map((value) => String(value)).filter(Boolean).slice(0, 8)
      : [],
  }));

  return {
    report: {
      discovered: candidatePaths,
      pages,
      openJobs: Array.isArray(extraction.content?.openJobs)
        ? extraction.content!.openJobs.map((value) => String(value)).filter(Boolean).slice(0, 12)
        : [],
      recentEvents: Array.isArray(extraction.content?.recentEvents)
        ? extraction.content!.recentEvents.map((value) => String(value)).filter(Boolean).slice(0, 12)
        : [],
    },
    debug: {
      discoveredPaths: candidatePaths,
      scrapes: usefulScrapes.map(({ target, scrape }) => ({
        url: target.url,
        kind: target.kind,
        request: scrape.request,
        response: scrape.response,
        textPreview: scrape.markdown.slice(0, 1500),
      })),
      extractionRequest: extraction.request,
      extractionResponse: extraction.response,
      extractionRawText: extraction.rawText,
    },
  };
}

async function discoverCandidatePaths(officialWebsite: string): Promise<string[]> {
  const sitemapPaths = await fetchSitemapPaths(officialWebsite);
  if (sitemapPaths.length > 0) return sitemapPaths;
  return defaultCandidatePaths(officialWebsite);
}

async function fetchSitemapPaths(officialWebsite: string): Promise<string[]> {
  const sitemapUrl = new URL("/sitemap.xml", officialWebsite).toString();
  try {
    const res = await fetch(sitemapUrl, {
      headers: { "User-Agent": "Prezesol/1.0" },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    return Array.from(text.matchAll(/<loc>([^<]+)<\/loc>/gi))
      .map((match) => match[1].trim())
      .filter((url) => isSameOrigin(url, officialWebsite))
      .slice(0, 200);
  } catch {
    return [];
  }
}

function defaultCandidatePaths(officialWebsite: string): string[] {
  const candidates = [
    "/kariera",
    "/praca",
    "/careers",
    "/aktualnosci",
    "/aktualności",
    "/news",
    "/blog",
    "/realizacje",
    "/case-study",
    "/o-firmie",
    "/o-nas",
  ];
  return candidates
    .map((path) => {
      try {
        return new URL(path, officialWebsite).toString();
      } catch {
        return null;
      }
    })
    .filter((url): url is string => Boolean(url));
}

function pickHighValuePages(officialWebsite: string, candidates: string[]): PageTarget[] {
  const seen = new Set<string>();
  const result: PageTarget[] = [];
  const buckets = new Map<CompanyPageScrape["kind"], number>([
    ["careers", 0],
    ["news", 0],
    ["blog", 0],
    ["case_studies", 0],
    ["about", 0],
  ]);

  for (const url of candidates) {
    const normalized = normalizeUrl(url);
    if (!normalized || seen.has(normalized)) continue;
    if (!isSameOrigin(normalized, officialWebsite)) continue;

    const kind = classifyPath(normalized);
    if (!kind) continue;
    const count = buckets.get(kind) ?? 0;
    if (count >= 2) continue;
    seen.add(normalized);
    buckets.set(kind, count + 1);
    result.push({ url: normalized, kind });
  }

  return result;
}

function classifyPath(url: string): CompanyPageScrape["kind"] | null {
  const path = new URL(url).pathname.toLowerCase();
  if (CAREER_PATTERNS.some((pattern) => path.includes(pattern))) return "careers";
  if (NEWS_PATTERNS.some((pattern) => path.includes(pattern))) return "news";
  if (CASE_PATTERNS.some((pattern) => path.includes(pattern))) return "case_studies";
  if (BLOG_PATTERNS.some((pattern) => path.includes(pattern))) return "blog";
  if (ABOUT_PATTERNS.some((pattern) => path.includes(pattern))) return "about";
  return null;
}

function isSameOrigin(url: string, officialWebsite: string): boolean {
  try {
    const a = new URL(url);
    const b = new URL(officialWebsite);
    return a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function normalizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function buildExtractionPrompt(aggregatedText: string): string {
  return `Poniżej fragmenty podstron firmowych (Kariera, Aktualności, Blog, Case studies, O firmie). Wyciągnij konkretne dane.

Zwróć WYŁĄCZNIE poprawny JSON:
{
  "pages": [
    {
      "kind": "careers | news | blog | about | case_studies | other",
      "url": "URL podstrony",
      "title": "krótka nazwa lub tytuł",
      "highlights": ["3-6 najważniejszych konkretów z tej podstrony"]
    }
  ],
  "openJobs": [
    "Stanowisko - Lokalizacja - Forma zatrudnienia (etat/B2B/zlecenie) - inne istotne (jeśli widoczne)"
  ],
  "recentEvents": [
    "Data lub okres - krótki opis bieżącego wydarzenia firmy (max 25 słów)"
  ]
}

Zasady:
- openJobs: TYLKO konkretne stanowiska aktualnie poszukiwane. NIE dodawaj ogólników "rekrutujemy".
- recentEvents: tylko świeże wydarzenia (ostatnie 12 mc) z newsów/blogów: launch produktu, otwarcie oddziału, dofinansowania, targi, nagrody, ambasador, kampania, eventy własne, nowy partner.
- highlights: konkrety, np. "Klient: X branża: Y, wynik: Z%" zamiast "Pomagamy klientom".
- Nie dodawaj danych spoza tekstu poniżej.

TEKST:
${aggregatedText}`;
}

function normalizePageKind(value: unknown): CompanyPageScrape["kind"] {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "careers" || normalized === "news" || normalized === "blog" ||
      normalized === "about" || normalized === "case_studies") {
    return normalized;
  }
  return "other";
}

function emptyReport(): CompanyPagesReport {
  return {
    discovered: [],
    pages: [],
    openJobs: [],
    recentEvents: [],
  };
}

interface PageTarget {
  url: string;
  kind: CompanyPageScrape["kind"];
}

interface GeminiCompanyPagesExtraction {
  pages?: Array<{
    kind?: string;
    url?: string;
    title?: string;
    highlights?: unknown[];
  }>;
  openJobs?: unknown[];
  recentEvents?: unknown[];
}

interface CompanyPagesDebug {
  skipped?: string;
  discoveredPaths?: string[];
  scrapes?: Array<{
    url: string;
    kind?: CompanyPageScrape["kind"];
    request?: unknown;
    response?: unknown;
    textPreview?: string;
    error?: string | null;
  }>;
  extractionRequest?: unknown;
  extractionResponse?: unknown;
  extractionRawText?: string;
}
