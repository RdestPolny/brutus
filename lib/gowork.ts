import {
  scrapeReadableContentWithDebug,
  searchFirecrawlWithDebug,
  type FirecrawlScrapeDebug,
  type FirecrawlSearchResult,
} from "./firecrawl";
import { askGeminiJsonWithDebug } from "./gemini";
import { htmlToEssentialText, markdownToEssentialText } from "./htmlText";
import type { CompanyRegistryRow, GoWorkFinancialRow, GoWorkReport, GoWorkReview, GoWorkRow } from "./types";

const MAX_GOWORK_PAGES = 5;
const GOWORK_HOST = "gowork.pl";
const GOWORK_PAGE_SUFFIXES = ["dane-kontaktowe-firmy", "praca-i-zarobki"];
const GOWORK_SCRAPE_OPTIONS = {
  formats: ["markdown", "links"] as const,
  onlyMainContent: true,
  maxAge: 6 * 60 * 60 * 1000,
  waitFor: 1500,
  timeout: 60000,
  location: {
    country: "PL",
    languages: ["pl-PL", "pl"],
  },
  proxy: "auto" as const,
};

export async function fetchGoWorkReportWithDebug(
  company: CompanyRegistryRow,
  _context?: { nip?: string; krs?: string }
): Promise<GoWorkReport & { debug: GoWorkDebug }> {
  const searchTerm = company.nip || company.name;
  const searchQuery = buildGoWorkSearchQuery(searchTerm);
  const searchResult = await searchFirecrawlWithDebug(searchQuery, { limit: 10, country: "PL" });
  const profileUrl = extractGoWorkProfileUrl(searchResult.results, searchTerm);
  const searchPageUrls = extractGoWorkSearchPageUrls(searchResult.results, profileUrl);

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

  const profileScrape = await scrapeReadableContentWithDebug(profileUrl, GOWORK_SCRAPE_OPTIONS);
  const pageUrls = discoverGoWorkPageUrls(profileUrl, profileScrape, searchPageUrls);
  const additionalUrls = pageUrls.filter((url) => url !== profileUrl).slice(0, MAX_GOWORK_PAGES - 1);
  const additionalScrapes = await Promise.all(
    additionalUrls.map(async (url) => ({
      url,
      scrape: await scrapeReadableContentWithDebug(url, GOWORK_SCRAPE_OPTIONS),
    }))
  );

  const scrapedPages = [
    { url: profileUrl, scrape: profileScrape },
    ...additionalScrapes,
  ].filter(({ scrape }) => isSuccessfulGoWorkScrape(scrape));
  const uniqueScrapedPages = uniqueGoWorkScrapedPages(scrapedPages);

  const extractedPages = await Promise.all(
    uniqueScrapedPages.map(async ({ url, scrape }) => {
      const text = prepareGoWorkText(scrape);
      const extraction = await askGeminiJsonWithDebug<GoWorkPageExtraction>(
        buildGoWorkExtractionPrompt(url, text),
        {
          systemInstruction:
            "Jesteś analitykiem danych z profilu pracodawcy GoWork. Zwracasz wyłącznie fakty widoczne w przekazanym tekście, bez domysłów.",
        }
      );

      const deterministic = extractDeterministicGoWorkData(text);
      const rows = mergeGoWorkRows([
        ...deterministic.rows,
        ...(extraction.content?.rows ?? []).map(normalizeGoWorkRow),
      ]);
      const financials = mergeGoWorkFinancials([
        ...deterministic.financials,
        ...(extraction.content?.financials ?? []).map(normalizeGoWorkFinancialRow),
      ]);

      return {
        page: {
          title: String(extraction.content?.pageTitle ?? titleFromGoWorkUrl(url)),
          url,
          rows,
          reviews: (extraction.content?.reviews ?? []).map(normalizeGoWorkReview),
          financials,
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

function buildGoWorkSearchQuery(searchTerm: string): string {
  return `${deriveShortBrandName(searchTerm)} gowork`;
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
  ],
  "reviews": [
    {
      "author": "autor opinii lub wpisu",
      "date": "data wpisu",
      "type": "Pracownik | Były pracownik | Kandydat | Klient | Inne | nie znaleziono",
      "sentiment": "positive | negative | neutral | unknown",
      "text": "pełna treść opinii lub pytania bez elementów UI",
      "reactionCount": "liczba reakcji/falek jeśli widoczna",
      "companyReply": "odpowiedź firmy powiązana z opinią, jeśli widoczna"
    }
  ],
  "financials": [
    {
      "year": "rok",
      "revenue": "przychód netto",
      "grossProfit": "zysk / strata brutto"
    }
  ]
}

Instrukcje:
- Wyciągnij wszystkie istotne informacje widoczne w tekście: nazwę profilu, ocenę, liczbę opinii, kategorie ocen, wyróżniki, pytania i odpowiedzi, dane kontaktowe, adresy, telefony, maile, linki, oferty pracy, widełki zarobków, benefity, typy umów, daty i inne fakty.
- Dane firmowe z panelu bocznego, np. nazwa, adres, NIP, KRS, REGON, branża, opis profilu, zwróć w rows.
- Opinie pracowników/kandydatów/klientów zwróć w reviews. Zachowaj możliwie pełną treść opinii, autora, datę, typ wpisu i odpowiedź firmy, jeśli jest bezpośrednio pod opinią.
- Sekcję "Przychody i zysk" zwróć w financials, osobny rekord dla każdego roku. Zachowaj wartości tak jak w tekście, np. "2,4 mln", "-51,7 tys".
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
      return { url: normalizeGoWorkProfileBaseUrl(url), score };
    })
    .filter((candidate): candidate is { url: string; score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.url ?? null;
}

function extractGoWorkSearchPageUrls(results: FirecrawlSearchResult[], profileUrl: string | null): string[] {
  const profileId = profileUrl ? extractGoWorkProfileId(profileUrl) : null;
  return results
    .map((result) => normalizeGoWorkUrlFromText(result.url))
    .filter((url): url is string => Boolean(url))
    .filter((url) => !profileId || extractGoWorkProfileId(url) === profileId)
    .filter(isUsefulGoWorkProfilePage);
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

function normalizeGoWorkProfileBaseUrl(value: string): string {
  const url = new URL(normalizeGoWorkUrl(value));
  const parts = url.pathname.split("/").filter(Boolean);
  const lastPart = parts[parts.length - 1] ?? "";

  if (GOWORK_PAGE_SUFFIXES.includes(lastPart)) {
    parts.pop();
    url.pathname = `/${parts.join("/")}`;
  }

  return normalizeGoWorkUrl(url.toString());
}

function goWorkMatchTokens(companyName: string): string[] {
  return deriveShortBrandName(companyName)
    .toLowerCase()
    .split(/[^a-z0-9ąćęłńóśźż.]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function discoverGoWorkPageUrls(
  profileUrl: string,
  scrape: { links: string[]; markdown: string; html: string },
  seedUrls: string[]
): string[] {
  const urls = new Set<string>([normalizeGoWorkUrl(profileUrl)]);
  const profileId = extractGoWorkProfileId(profileUrl);
  const hrefRegex = /href=["']([^"']+)["']/gi;
  const canonicalRegex = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i;
  const canonical = scrape.html.match(canonicalRegex)?.[1];

  const candidates = [
    canonical,
    ...seedUrls,
    ...scrape.links,
    ...extractMarkdownUrls(scrape.markdown),
    ...extractRegexMatches(scrape.html, hrefRegex),
  ];

  for (const rawHref of candidates) {
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

  const canonicalProfile = Array.from(urls).map(normalizeGoWorkProfileBaseUrl).find((url) => {
    const pathname = new URL(url).pathname;
    return /,\d+/.test(pathname) && !pathname.includes("opinie_czytaj");
  });
  if (canonicalProfile) {
    for (const suffix of GOWORK_PAGE_SUFFIXES) {
      urls.add(`${canonicalProfile.replace(/\/$/, "")}/${suffix}`);
    }
  }

  return Array.from(urls).filter((url) => !isDuplicatedGoWorkSuffixUrl(url)).slice(0, MAX_GOWORK_PAGES);
}

function extractMarkdownUrls(markdown: string): string[] {
  return [
    ...extractRegexMatches(markdown, /\]\(([^)]+)\)/g),
    ...extractRegexMatches(markdown, /((?:https?:\/\/)?(?:www\.)?gowork\.pl\/[^\s|)\]]+)/gi),
  ];
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

function isDuplicatedGoWorkSuffixUrl(value: string): boolean {
  const parts = new URL(value).pathname.split("/").filter(Boolean);
  return GOWORK_PAGE_SUFFIXES.some((suffix) => parts.filter((part) => part === suffix).length > 1);
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

function isSuccessfulGoWorkScrape(scrape: FirecrawlScrapeDebug): boolean {
  const statusCode = Number(scrape.metadata.statusCode ?? 200);
  const text = `${scrape.markdown} ${scrape.html}`.toLowerCase();
  return statusCode < 400 && !text.includes("strona, ktorej szukasz nie istnieje");
}

function uniqueGoWorkScrapedPages(
  pages: Array<{ url: string; scrape: FirecrawlScrapeDebug }>
): Array<{ url: string; scrape: FirecrawlScrapeDebug }> {
  const seen = new Set<string>();
  return pages.filter(({ url, scrape }) => {
    const effectiveUrl = String(scrape.metadata.url ?? scrape.metadata.sourceURL ?? url);
    const key = normalizeGoWorkEquivalentPageUrl(effectiveUrl);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeGoWorkEquivalentPageUrl(value: string): string {
  try {
    const url = new URL(normalizeGoWorkUrl(value));
    const profileId = extractGoWorkProfileId(url.toString());
    if (profileId && url.pathname.includes("opinie_czytaj")) return `opinie:${profileId}`;
    return url.toString();
  } catch {
    return value;
  }
}

function prepareGoWorkText(scrape: FirecrawlScrapeDebug): string {
  if (!scrape.markdown) return htmlToEssentialText(scrape.html);
  return markdownToEssentialText(extractRelevantGoWorkMarkdown(scrape.markdown));
}

function extractRelevantGoWorkMarkdown(markdown: string): string {
  const relevantHeadings = [
    "Dane kontaktowe",
    "Dane firmowe",
    "Władze firmy i powiązania",
    "Przychody i zysk",
    "Profil działalności",
    "Opinie",
    "Pytania",
    "Rozmowa kwalifikacyjna",
    "Praca i zarobki",
    "Zarobki",
    "Oferty pracy",
    "Benefity",
  ];
  const stopHeadings = [
    "Mapa",
    "Sprawdź najnowsze oferty pracy z GoWork.pl",
    "Firmy i biura",
    "Aktualne oferty pracy",
    "Opinie o firmach",
    "Zostaw merytoryczną opinię",
  ];
  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let keeping = false;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    const headingLevel = headingMatch?.[1].length ?? 0;
    const heading = headingMatch?.[2]?.trim() ?? "";
    if (heading && headingLevel <= 3) {
      if (current.length > 0 && keeping) chunks.push(current.join("\n"));
      current = [];
      keeping = relevantHeadings.some((name) => heading.toLowerCase().includes(name.toLowerCase()));
      if (stopHeadings.some((name) => heading.toLowerCase().includes(name.toLowerCase()))) keeping = false;
    }
    if (keeping) current.push(line);
  }

  if (current.length > 0 && keeping) chunks.push(current.join("\n"));
  return chunks.length > 0 ? chunks.join("\n\n") : markdown;
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

function mergeGoWorkRows(rows: GoWorkRow[]): GoWorkRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.label && !row.value) return false;
    const key = `${row.category}|${row.label}|${row.value}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeGoWorkReview(review: Partial<GoWorkReview>): GoWorkReview {
  return {
    author: String(review.author ?? ""),
    date: String(review.date ?? ""),
    type: String(review.type ?? ""),
    sentiment: normalizeSentiment(review.sentiment),
    text: String(review.text ?? ""),
    reactionCount: String(review.reactionCount ?? ""),
    companyReply: String(review.companyReply ?? ""),
  };
}

function normalizeGoWorkFinancialRow(row: Partial<GoWorkFinancialRow>): GoWorkFinancialRow {
  return {
    year: String(row.year ?? ""),
    revenue: String(row.revenue ?? ""),
    grossProfit: String(row.grossProfit ?? ""),
  };
}

function mergeGoWorkFinancials(rows: GoWorkFinancialRow[]): GoWorkFinancialRow[] {
  const byYear = new Map<string, GoWorkFinancialRow>();
  for (const row of rows) {
    if (!row.year && !row.revenue && !row.grossProfit) continue;
    const key = row.year || `${row.revenue}|${row.grossProfit}`;
    const current = byYear.get(key);
    byYear.set(key, {
      year: current?.year || row.year,
      revenue: current?.revenue || row.revenue,
      grossProfit: current?.grossProfit || row.grossProfit,
    });
  }
  return Array.from(byYear.values());
}

function extractDeterministicGoWorkData(text: string): { rows: GoWorkRow[]; financials: GoWorkFinancialRow[] } {
  const rows: GoWorkRow[] = [];
  const addRow = (category: string, label: string, value: string, sourceQuote?: string) => {
    const normalizedValue = value.replace(/\s+/g, " ").trim();
    if (!normalizedValue) return;
    rows.push({
      category,
      label,
      value: normalizedValue,
      sourceQuote: (sourceQuote ?? normalizedValue).replace(/\s+/g, " ").slice(0, 180),
    });
  };

  const address = extractAddress(text);
  addRow("contact", "Adres", address);
  addRow("contact", "NIP", extractLabeledValue(text, "NIP"), "NIP");
  addRow("contact", "KRS", extractLabeledValue(text, "KRS"), "KRS");
  addRow("contact", "REGON", extractLabeledValue(text, "REGON"), "REGON");
  addRow("contact", "E-mail", text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "");
  addRow("contact", "Strona www", extractFirstHttpUrl(text, ["gowork.pl", "google.com", "about:invalid"]));
  addRow("profile", "Nazwa pełna", extractMarkdownHeadingValue(text, "Nazwa pełna"));
  addRow("profile", "Adres rejestrowy", extractMarkdownHeadingValue(text, "Adres rejestrowy"));
  addRow("profile", "Kapitał zakładowy", extractMarkdownHeadingValue(text, "Kapitał zakładowy"));
  addRow("profile", "Forma prawna", extractMarkdownHeadingValue(text, "Forma prawna"));
  addRow(
    "profile",
    "Data rozpoczęcia działalności",
    extractMarkdownHeadingValue(text, "Data rozpoczęcia wykonywania działalności gospodarczej")
  );
  addRow("profile", "Data rejestracji", extractMarkdownHeadingValue(text, "Data rejestracji"));
  addRow("profile", "Zarząd", extractBoardMembers(text));

  return {
    rows,
    financials: extractFinancialRows(text),
  };
}

function extractLabeledValue(text: string, label: string): string {
  return (
    text.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([0-9]+)`, "i"))?.[1] ??
    extractMarkdownHeadingValue(text, label)
  );
}

function extractMarkdownHeadingValue(text: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^#{4,6}\\s+${escapedLabel}:?\\s*\\n+([\\s\\S]*?)(?=\\n#{3,6}\\s|\\n\\*\\*|\\n\\n#{4,6}\\s|$)`, "im"));
  return cleanupExtractedValue(match?.[1] ?? "");
}

function extractAddress(text: string): string {
  const contactSection = extractSection(text, "Dane kontaktowe");
  const lines = contactSection
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#") && !line.startsWith("**") && !line.includes("mailto:") && !line.includes("http"));
  return lines.slice(0, 2).join(", ");
}

function extractBoardMembers(text: string): string {
  const boardSection = extractSection(text, "Władze firmy i powiązania");
  return boardSection
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter((line) => line && !line.startsWith("#") && line.toLowerCase() !== "zarząd")
    .join(", ");
}

function extractFinancialRows(text: string): GoWorkFinancialRow[] {
  const section = extractSection(text, "Przychody i zysk");
  const years = Array.from(section.matchAll(/\b(20\d{2})\b/g)).map((match) => match[1]);
  const moneyValues = Array.from(section.matchAll(/-?\d+(?:[,.]\d+)?\s*(?:mln|tys|zł)?/gi))
    .map((match) => match[0].trim())
    .filter((value) => !/^20\d{2}$/.test(value) && /(?:mln|tys|zł)/i.test(value));

  if (years.length === 0 || moneyValues.length < years.length * 2) return [];
  return years.map((year, index) => ({
    year,
    revenue: moneyValues[index * 2] ?? "",
    grossProfit: moneyValues[index * 2 + 1] ?? "",
  }));
}

function extractSection(text: string, heading: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`^#{2,6}\\s+.*${escapedHeading}.*\\n([\\s\\S]*?)(?=\\n#{2,6}\\s|$)`, "im"))?.[1] ?? "";
}

function extractFirstHttpUrl(text: string, excludedHosts: string[]): string {
  for (const match of text.matchAll(/https?:\/\/[^\s)\]]+/gi)) {
    try {
      const url = new URL(match[0]);
      const host = url.hostname.replace(/^www\./, "").toLowerCase();
      if (excludedHosts.some((excluded) => host === excluded || host.endsWith(`.${excluded}`))) continue;
      url.hash = "";
      url.search = "";
      return url.toString().replace(/\/$/, "");
    } catch {
      // Ignore malformed URLs.
    }
  }
  return "";
}

function cleanupExtractedValue(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(", ")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/\*\*/g, "")
    .trim();
}

function normalizeSentiment(value: unknown): GoWorkReview["sentiment"] {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "positive" || normalized === "negative" || normalized === "neutral") return normalized;
  return "unknown";
}

interface GoWorkPageExtraction {
  pageTitle?: string;
  rows?: Array<Partial<GoWorkRow>>;
  reviews?: Array<Partial<GoWorkReview>>;
  financials?: Array<Partial<GoWorkFinancialRow>>;
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
