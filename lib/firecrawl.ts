const FIRECRAWL_SCRAPE_API_URL = "https://api.firecrawl.dev/v2/scrape";
const FIRECRAWL_SEARCH_API_URL = "https://api.firecrawl.dev/v2/search";

export async function scrapeReadableContentWithDebug(
  url: string,
  options?: FirecrawlScrapeOptions
): Promise<{ markdown: string; html: string; text: string; links: string[]; request: unknown; response: unknown }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set");
  const requestTimeout = options?.timeout ?? 60000;

  const request = {
    url,
    formats: options?.formats ?? ["markdown", "links"],
    onlyMainContent: true,
    removeBase64Images: true,
    blockAds: true,
    timeout: requestTimeout,
    ...options,
  };

  const res = await fetch(FIRECRAWL_SCRAPE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(requestTimeout + 15000),
  });

  const rawText = await res.text();
  const response = parseJsonOrRawText(rawText);

  if (!res.ok) {
    throw new Error(`Firecrawl error ${res.status}: ${JSON.stringify(response)}`);
  }

  const data = (response as FirecrawlResponse)?.data;
  const markdown = String(data?.markdown ?? "");
  const html = String(data?.html ?? "");
  const text = markdown || html;
  const links = normalizeFirecrawlLinks(data?.links);
  return { markdown, html, text, links, request, response };
}

export async function scrapeCleanHtmlWithDebug(
  url: string
): Promise<{ html: string; request: unknown; response: unknown }> {
  const scrape = await scrapeReadableContentWithDebug(url, { formats: ["html"] });
  return { html: scrape.html, request: scrape.request, response: scrape.response };
}

export async function searchFirecrawlWithDebug(
  query: string,
  options?: { limit?: number; country?: string }
): Promise<{ results: FirecrawlSearchResult[]; request: unknown; response: unknown }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set");

  const request = {
    query,
    limit: options?.limit ?? 10,
    sources: ["web"],
    country: options?.country ?? "PL",
    ignoreInvalidURLs: true,
    timeout: 60000,
  };

  const res = await fetch(FIRECRAWL_SEARCH_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(70000),
  });

  const rawText = await res.text();
  const response = parseJsonOrRawText(rawText);

  if (!res.ok) {
    throw new Error(`Firecrawl search error ${res.status}: ${JSON.stringify(response)}`);
  }

  return {
    results: ((response as FirecrawlSearchResponse)?.data?.web ?? []).filter(
      (result): result is FirecrawlSearchResult => Boolean(result?.url)
    ),
    request,
    response,
  };
}

function parseJsonOrRawText(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    return { rawText };
  }
}

interface FirecrawlResponse {
  data?: {
    markdown?: string;
    html?: string;
    links?: FirecrawlLink[];
  };
}

type FirecrawlFormat =
  | "markdown"
  | "summary"
  | "html"
  | "rawHtml"
  | "links"
  | "images"
  | "branding"
  | "audio"
  | { type: "json"; prompt?: string; schema?: Record<string, unknown> };

interface FirecrawlScrapeOptions {
  formats?: readonly FirecrawlFormat[];
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  maxAge?: number;
  waitFor?: number;
  mobile?: boolean;
  timeout?: number;
  location?: {
    country?: string;
    languages?: string[];
  };
  proxy?: "basic" | "stealth" | "auto";
  storeInCache?: boolean;
}

type FirecrawlLink = string | { url?: string };

function normalizeFirecrawlLinks(links: FirecrawlLink[] | undefined): string[] {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => (typeof link === "string" ? link : link?.url))
    .filter((link): link is string => Boolean(link));
}

export interface FirecrawlSearchResult {
  title?: string;
  description?: string;
  url: string;
}

interface FirecrawlSearchResponse {
  data?: {
    web?: FirecrawlSearchResult[];
  };
}
