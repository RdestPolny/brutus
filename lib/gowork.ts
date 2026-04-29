import { scrapeCleanHtmlWithDebug, searchFirecrawlWithDebug, type FirecrawlSearchResult } from "./firecrawl";
import { askGeminiJsonWithDebug } from "./gemini";
import { htmlToEssentialText } from "./htmlText";
import type { CompanyRegistryRow, GoWorkReport, GoWorkRow } from "./types";

const MAX_GOWORK_PAGES = 5;
const GOWORK_HOST = "gowork.pl";

export async function fetchGoWorkReportWithDebug(
  company: CompanyRegistryRow,
  _context?: { nip?: string; krs?: string }
): Promise<GoWorkReport & { debug: GoWorkDebug }> {
  const searchQuery = buildGoWorkSearchQuery(company.name);
  const searchResult = await searchFirecrawlWithDebug(searchQuery, { limit: 10, country: "PL" });
  const profileUrl = extractGoWorkProfileUrl(searchResult.results, company.name);

  if (!profileUrl) {
    return {
      profileUrl: null,
      searchRawMarkdown: searchResult.results
        .map((result) => `| ${result.title ?? ""} | ${result.url} | ${result.description ?? ""} |`)
        .join("\n"),
      pages: [],
      debug: {
        searchRequest: searchResult.request,
        searchResponse: searchResult.response,
        skipped: "No GoWork profile URL found",
      },
    };
  }

  const profileScrape = await scrapeCleanHtmlWithDebug(profileUrl);
  const pageUrls = discoverGoWorkPageUrls(profileUrl, profileScrape.html);
  const additionalUrls = pageUrls.filter((url) => url !== profileUrl).slice(0, MAX_GOWORK_PAGES - 1);
  const additionalScrapes = await Promise.all(
    additionalUrls.map(async (url) => ({
      url,
      scrape: await scrapeCleanHtmlWithDebug(url),
    }))
  );

  const scrapedPages = [
    { url: profileUrl, scrape: profileScrape },
    ...additionalScrapes,
  ];

  const extractedPages = await Promise.all(
    scrapedPages.map(async ({ url, scrape }) => {
      const text = htmlToEssentialText(scrape.html);
      const extraction = await askGeminiJsonWithDebug<GoWorkPageExtraction>(
        buildGoWorkExtractionPrompt(url, text),
        {
          systemInstruction:
            "Jesteś analitykiem danych z profilu pracodawcy GoWork. Zwracasz wyłącznie fakty widoczne w przekazanym tekście, bez domysłów.",
        }
      );

      const rows = (extraction.content?.rows ?? []).map(normalizeGoWorkRow);

      return {
        page: {
          title: String(extraction.content?.pageTitle ?? titleFromGoWorkUrl(url)),
          url,
          rows,
        },
        debug: {
          url,
          scrapeRequest: scrape.request,
          scrapeResponse: scrape.response,
          cleanedTextPreview: text.slice(0, 3000),
          extractionRequest: extraction.request,
          extractionResponse: extraction.response,
          extractionRawText: extraction.rawText,
        },
      };
    })
  );

  return {
    profileUrl,
    searchRawMarkdown: searchResult.results
      .map((result) => `| ${result.title ?? ""} | ${result.url} | ${result.description ?? ""} |`)
      .join("\n"),
    pages: extractedPages.map((item) => item.page),
    debug: {
      searchRequest: searchResult.request,
      searchResponse: searchResult.response,
      discoveredPageUrls: pageUrls,
      pages: extractedPages.map((item) => item.debug),
    },
  };
}

function buildGoWorkSearchQuery(companyName: string): string {
  return `${deriveShortBrandName(companyName)} gowork`;
}

function deriveShortBrandName(companyName: string): string {
  const cleaned = companyName
    .replace(/spółka z ograniczoną odpowiedzialnością/gi, "")
    .replace(/sp\.?\s*z\s*o\.?o\.?/gi, "")
    .replace(/\b(s\.?a\.?|spółka akcyjna)\b/gi, "")
    .replace(/\.(pl|com|eu|net|org)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const firstToken = cleaned.split(/\s+/).find((token) => token.length >= 3);
  return firstToken ?? cleaned ?? companyName;
}

function buildGoWorkExtractionPrompt(url: string, text: string): string {
  return `Przeanalizuj tekst pobrany z podstrony profilu GoWork: ${url}

Zwróć WYŁĄCZNIE poprawny JSON w formacie:
{
  "pageTitle": "krótka nazwa podstrony",
  "rows": [
    {
      "category": "profile | ratings | opinions | contact | salary | jobs | recruitment | benefits | questions | metadata | other",
      "label": "krótka etykieta po polsku",
      "value": "konkretna wartość lub informacja",
      "sourceQuote": "krótki fragment tekstu potwierdzający wartość"
    }
  ]
}

Instrukcje:
- Wyciągnij wszystkie istotne informacje widoczne w tekście: nazwę profilu, ocenę, liczbę opinii, kategorie ocen, wyróżniki, pytania i odpowiedzi, dane kontaktowe, adresy, telefony, maile, linki, oferty pracy, widełki zarobków, benefity, typy umów, daty i inne fakty.
- Dane tabelaryczne ze strony rozbij na osobne wiersze JSON.
- Nie przepisuj regulaminów, menu, stopki, komunikatów cookies ani powtarzalnej nawigacji, chyba że zawierają dane o firmie.
- Nie streszczaj wielu różnych wartości w jednym wierszu, jeśli da się je rozdzielić.
- Nie zgaduj i nie dodawaj danych spoza tekstu.
- sourceQuote ma mieć maksymalnie 180 znaków.

TEKST:
${text}`;
}

function extractGoWorkProfileUrl(results: FirecrawlSearchResult[], companyName: string): string | null {
  const brandTokens = goWorkMatchTokens(companyName);
  const candidates = results
    .map((result) => {
      const url = normalizeGoWorkUrlFromText(result.url);
      if (!url) return null;
      const searchable = `${result.title ?? ""} ${result.description ?? ""} ${result.url}`.toLowerCase();
      const score =
        brandTokens.reduce((sum, token) => sum + (searchable.includes(token) ? 5 : 0), 0) +
        (new URL(url).pathname.includes("opinie_czytaj") ? 3 : 0) +
        (/,\d+/.test(new URL(url).pathname) ? 2 : 0);
      return { url, score };
    })
    .filter((candidate): candidate is { url: string; score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.url ?? null;
}

function normalizeGoWorkUrlFromText(value: string): string | null {
  const match = value.match(/(?:https?:\/\/)?(?:www\.)?gowork\.pl\/[^\s|)\]]+/i);
  if (!match) return null;

  try {
    const rawUrl = match[0].replace(/[.,;]+$/g, "");
    const url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    if (!isGoWorkHost(url.hostname)) return null;
    return normalizeGoWorkUrl(url.toString());
  } catch {
    return null;
  }
}

function goWorkMatchTokens(companyName: string): string[] {
  return deriveShortBrandName(companyName)
    .toLowerCase()
    .split(/[^a-z0-9ąćęłńóśźż.]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function discoverGoWorkPageUrls(profileUrl: string, html: string): string[] {
  const urls = new Set<string>([normalizeGoWorkUrl(profileUrl)]);
  const profileId = extractGoWorkProfileId(profileUrl);
  const hrefRegex = /href=["']([^"']+)["']/gi;
  const canonicalRegex = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i;
  const canonical = html.match(canonicalRegex)?.[1];

  for (const rawHref of [canonical, ...extractRegexMatches(html, hrefRegex)]) {
    if (!rawHref) continue;
    try {
      const url = new URL(rawHref, profileUrl);
      if (!isGoWorkHost(url.hostname)) continue;
      const normalized = normalizeGoWorkUrl(url.toString());
      if (!profileId || extractGoWorkProfileId(normalized) !== profileId) continue;
      if (isUsefulGoWorkProfilePage(normalized)) urls.add(normalized);
    } catch {
      // Ignore malformed href values.
    }
  }

  const canonicalProfile = Array.from(urls).find((url) => {
    const pathname = new URL(url).pathname;
    return /,\d+/.test(pathname) && !pathname.includes("opinie_czytaj");
  });
  if (canonicalProfile) {
    for (const suffix of ["dane-kontaktowe-firmy", "praca-i-zarobki"]) {
      urls.add(`${canonicalProfile.replace(/\/$/, "")}/${suffix}`);
    }
  }

  return Array.from(urls).slice(0, MAX_GOWORK_PAGES);
}

function extractRegexMatches(value: string, regex: RegExp): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value))) {
    matches.push(match[1]);
  }
  return matches;
}

function isUsefulGoWorkProfilePage(url: string): boolean {
  const pathname = new URL(url).pathname;
  return (
    pathname.includes("opinie_czytaj") ||
    pathname.includes("dane-kontaktowe-firmy") ||
    pathname.includes("praca-i-zarobki") ||
    pathname.includes("praca") ||
    pathname.includes("zarobki") ||
    /,\d+/.test(pathname)
  );
}

function extractGoWorkProfileId(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    return pathname.match(/(?:opinie_czytaj,|,)(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function normalizeGoWorkUrl(value: string): string {
  const url = new URL(value);
  url.protocol = "https:";
  url.hostname = "www.gowork.pl";
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function isGoWorkHost(host: string): boolean {
  const normalized = host.replace(/^www\./, "");
  return normalized === GOWORK_HOST;
}

function titleFromGoWorkUrl(url: string): string {
  const pathname = new URL(url).pathname;
  if (pathname.includes("dane-kontaktowe-firmy")) return "Dane kontaktowe firmy";
  if (pathname.includes("praca-i-zarobki")) return "Praca i zarobki";
  if (pathname.includes("opinie_czytaj")) return "Opinie";
  return "Profil GoWork";
}

function normalizeGoWorkRow(row: Partial<GoWorkRow>): GoWorkRow {
  return {
    category: String(row.category ?? "other"),
    label: String(row.label ?? ""),
    value: String(row.value ?? ""),
    sourceQuote: String(row.sourceQuote ?? ""),
  };
}

interface GoWorkPageExtraction {
  pageTitle?: string;
  rows?: Array<Partial<GoWorkRow>>;
}

interface GoWorkDebug {
  searchRequest: unknown;
  searchResponse: unknown;
  skipped?: string;
  discoveredPageUrls?: string[];
  pages?: Array<{
    url: string;
    scrapeRequest: unknown;
    scrapeResponse: unknown;
    cleanedTextPreview: string;
    extractionRequest: unknown;
    extractionResponse: unknown;
    extractionRawText: string;
  }>;
}
