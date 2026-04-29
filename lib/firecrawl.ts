const FIRECRAWL_SCRAPE_API_URL = "https://api.firecrawl.dev/v2/scrape";
const FIRECRAWL_SEARCH_API_URL = "https://api.firecrawl.dev/v2/search";

export async function scrapeCleanHtmlWithDebug(
  url: string
): Promise<{ html: string; request: unknown; response: unknown }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set");

  const request = {
    url,
    formats: ["html"],
    onlyMainContent: true,
    removeBase64Images: true,
    blockAds: true,
    timeout: 30000,
  };

  const res = await fetch(FIRECRAWL_SCRAPE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(45000),
  });

  const rawText = await res.text();
  const response = parseJsonOrRawText(rawText);

  if (!res.ok) {
    throw new Error(`Firecrawl error ${res.status}: ${JSON.stringify(response)}`);
  }

  const html = String((response as FirecrawlResponse)?.data?.html ?? "");
  return { html, request, response };
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
    html?: string;
  };
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
