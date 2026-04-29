const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v2/scrape";

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

  const res = await fetch(FIRECRAWL_API_URL, {
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
