import { NextRequest, NextResponse } from "next/server";
import {
  askPerplexityTableWithDebug,
  buildDigitalPresencePrompt,
} from "@/lib/perplexity";
import { parseMarkdownTable, pickValue } from "@/lib/markdownTable";
import { fetchBestGooglePlaceReportWithDebug } from "@/lib/places";
import { fetchWebsiteDigitalPresence, mergeDigitalPresenceRows } from "@/lib/website";
import { fetchGoWorkReportWithDebug } from "@/lib/gowork";
import { extractWebsiteFactsWithDebug } from "@/lib/websiteFacts";
import { fetchKrsReportWithDebug, mergeRegistryRowsWithKrs } from "@/lib/krs";
import type { ApiDebugStep, CompanyRegistryRow, DigitalPresenceRow, GoWorkReport, KrsReport, PerplexityFactRow } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { nip?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  const nip = normalizeNip(body.nip);
  if (!nip) {
    return NextResponse.json({ error: "Podaj poprawny NIP (10 cyfr)" }, { status: 400 });
  }

  try {
    const goWorkSeedCompany = buildSeedCompany(nip);
    const goWorkResult = await fetchGoWorkReportWithDebug(goWorkSeedCompany, { nip });
    const goWork = {
      profileUrl: goWorkResult.profileUrl,
      searchRawMarkdown: goWorkResult.searchRawMarkdown,
      pages: goWorkResult.pages,
    };

    const goWorkRegistryRows = buildRegistryRowsFromGoWork(nip, goWork);
    const krsSeedRow = goWorkRegistryRows[0];

    const krsResult = await fetchKrsReportWithDebug(krsSeedRow?.krs ?? "");
    const registryRows = mergeRegistryRowsWithKrs(goWorkRegistryRows, krsResult.report);
    const firstRegistryRow = registryRows[0];
    const goWorkWebsite = extractWebsiteFromGoWork(goWork);
    const krsWebsite = extractWebsiteFromKrs(krsResult.report);
    const officialWebsite = goWorkWebsite ?? krsWebsite;

    const digitalPresencePrompt = buildDigitalPresencePrompt(nip, {
      officialWebsite,
      krs: firstRegistryRow.krs || undefined,
    });
    const digitalPresenceResult = await askPerplexityTableWithDebug(digitalPresencePrompt);
    const digitalPresenceMarkdown = digitalPresenceResult.content;
    const perplexityDigitalRows = parseDigitalPresenceRows(digitalPresenceMarkdown);
    const resolvedWebsite = officialWebsite;
    const websiteFactsResult = await extractWebsiteFactsWithDebug(resolvedWebsite);
    const websitePresenceResult = await fetchWebsiteDigitalPresence(resolvedWebsite);
    const digitalPresenceRows = mergeDigitalPresenceRows(
      perplexityDigitalRows,
      websitePresenceResult.rows
    );

    const websiteFacts = {
      url: websiteFactsResult.url,
      textLength: websiteFactsResult.textLength,
      facts: websiteFactsResult.facts,
      summary: websiteFactsResult.summary,
      validation: null,
    };

    const placesQueries = buildPlacesQueries({
      nip,
      companyName: firstRegistryRow.name,
      registryRows,
      goWorkRegistryRows,
      krsReport: krsResult.report,
    });
    const googlePlaceResult = await fetchBestGooglePlaceReportWithDebug(placesQueries);

    return NextResponse.json({
      input: { nip, companyName: firstRegistryRow.name || undefined },
      generatedAt: new Date().toISOString(),
      registry: {
        rawMarkdown: goWork.searchRawMarkdown,
        rows: registryRows,
      },
      digitalPresence: {
        rawMarkdown: digitalPresenceMarkdown,
        rows: digitalPresenceRows,
      },
      perplexityFacts: {
        rawMarkdown: "",
        rows: [],
      },
      websiteFacts,
      goWork,
      krs: krsResult.report,
      googlePlace: googlePlaceResult.report,
      debug: {
        websiteFactsRawResponse: websiteFactsResult.debug,
        goWorkRawResponse: goWorkResult.debug,
        krsRawResponse: krsResult.response,
        digitalPresencePrompt,
        digitalPresenceResponse: digitalPresenceMarkdown,
        digitalPresenceRawResponse: digitalPresenceResult.response,
        websitePresenceRawResponse: websitePresenceResult.debug,
        placesQuery: googlePlaceResult.selectedQuery ?? placesQueries[0] ?? "",
        placesQueries,
        placesRawResponse: googlePlaceResult.response,
        officialWebsite: resolvedWebsite,
        resolvedWebsite,
        goWorkWebsite,
        krsWebsite,
        steps: buildDebugSteps({
          goWorkDebug: goWorkResult.debug,
          krsRequest: krsResult.request,
          krsResponse: krsResult.response,
          digitalPresenceRequest: digitalPresenceResult.request,
          digitalPresenceResponse: digitalPresenceResult.response,
          digitalPresenceMarkdown,
          websiteFactsDebug: websiteFactsResult.debug,
          websitePresenceDebug: websitePresenceResult.debug,
          googlePlacesRequest: googlePlaceResult.request,
          googlePlacesResponse: googlePlaceResult.response,
          resolvedWebsite,
        }),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[brief] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildDebugSteps({
  goWorkDebug,
  krsRequest,
  krsResponse,
  digitalPresenceRequest,
  digitalPresenceResponse,
  digitalPresenceMarkdown,
  websiteFactsDebug,
  websitePresenceDebug,
  googlePlacesRequest,
  googlePlacesResponse,
  resolvedWebsite,
}: {
  goWorkDebug: {
    searchRequest?: unknown;
    searchResponse?: unknown;
    linkSelectionRequest?: unknown;
    linkSelectionResponse?: unknown;
    linkSelectionRawText?: string;
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
  };
  krsRequest: unknown;
  krsResponse: unknown;
  digitalPresenceRequest: unknown;
  digitalPresenceResponse: unknown;
  digitalPresenceMarkdown: string;
  websiteFactsDebug: {
    skipped?: string;
    scrapeRequest?: unknown;
    scrapeResponse?: unknown;
    cleanedTextPreview?: string;
    extractionRequest?: unknown;
    extractionResponse?: unknown;
    extractionRawText?: string;
  };
  websitePresenceDebug: unknown;
  googlePlacesRequest: unknown;
  googlePlacesResponse: unknown;
  resolvedWebsite: string | null;
}): ApiDebugStep[] {
  const steps: ApiDebugStep[] = [];

  steps.push({
    name: "Firecrawl Search: profil GoWork",
    request: goWorkDebug.searchRequest ?? { skipped: goWorkDebug.skipped },
    response: goWorkDebug.searchResponse ?? { skipped: goWorkDebug.skipped },
  });

  if (goWorkDebug.linkSelectionRequest || goWorkDebug.linkSelectionResponse || goWorkDebug.linkSelectionRawText) {
    steps.push({
      name: "Gemini: wybór linków GoWork po NIP",
      request: goWorkDebug.linkSelectionRequest ?? { skipped: goWorkDebug.skipped },
      response: {
        rawText: goWorkDebug.linkSelectionRawText ?? "",
        apiResponse: goWorkDebug.linkSelectionResponse ?? null,
        discoveredPageUrls: goWorkDebug.discoveredPageUrls ?? [],
      },
    });
  }

  for (const page of goWorkDebug.pages ?? []) {
    steps.push({
      name: `Firecrawl Scrape: GoWork - ${page.url}`,
      request: page.scrapeRequest,
      response: page.scrapeResponse,
    });
    steps.push({
      name: `Gemini: ekstrakcja GoWork - ${page.url}`,
      request: page.extractionRequest,
      response: {
        rawText: page.extractionRawText,
        apiResponse: page.extractionResponse,
        cleanedInputPreview: page.cleanedTextPreview,
      },
    });
  }

  steps.push({
    name: "KRS OpenAPI: odpis aktualny i pełny",
    request: krsRequest,
    response: krsResponse,
  });

  steps.push({
    name: "Perplexity: social media",
    request: digitalPresenceRequest,
    response: {
      markdown: digitalPresenceMarkdown,
      apiResponse: digitalPresenceResponse,
    },
  });

  if (websiteFactsDebug.scrapeRequest || websiteFactsDebug.scrapeResponse) {
    steps.push({
      name: "Firecrawl Scrape: oficjalna strona",
      request: websiteFactsDebug.scrapeRequest ?? { resolvedWebsite },
      response: websiteFactsDebug.scrapeResponse ?? { skipped: websiteFactsDebug.skipped },
    });
  }

  if (websiteFactsDebug.extractionRequest || websiteFactsDebug.extractionResponse || websiteFactsDebug.extractionRawText) {
    steps.push({
      name: "Gemini: fakty z oficjalnej strony",
      request: websiteFactsDebug.extractionRequest ?? { resolvedWebsite },
      response: {
        rawText: websiteFactsDebug.extractionRawText ?? "",
        apiResponse: websiteFactsDebug.extractionResponse ?? null,
        cleanedInputPreview: websiteFactsDebug.cleanedTextPreview ?? "",
      },
    });
  }

  steps.push({
    name: "Website fallback: linki ze strony firmowej",
    request: { resolvedWebsite },
    response: websitePresenceDebug,
  });

  steps.push({
    name: "Google Places: searchText",
    request: googlePlacesRequest,
    response: googlePlacesResponse,
  });

  return steps;
}

function buildPlacesQueries({
  nip,
  companyName,
  registryRows,
  goWorkRegistryRows,
  krsReport,
}: {
  nip: string;
  companyName: string;
  registryRows: CompanyRegistryRow[];
  goWorkRegistryRows: CompanyRegistryRow[];
  krsReport: KrsReport;
}): string[] {
  const name = companyName || registryRows[0]?.name || goWorkRegistryRows[0]?.name || nip;
  const addressCandidates = [
    ...registryRows.map((row) => row.address),
    ...goWorkRegistryRows.map((row) => row.address),
    krsReport.facts.find((fact) => fact.label === "Adres")?.value,
    krsReport.facts.find((fact) => fact.label === "Siedziba")?.value,
  ];
  const queries = addressCandidates
    .map((address) => [name, address].filter(Boolean).join(" "))
    .filter(Boolean);

  if (queries.length === 0) queries.push(name);
  return uniqueStrings(queries);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = value.replace(/\s+/g, " ").trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function normalizeNip(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{10}$/.test(digits) ? digits : null;
}

function extractOfficialWebsite(response: unknown, companyName: string): string | null {
  const raw = response as {
    citations?: string[];
    search_results?: Array<{ url?: string; title?: string; snippet?: string }>;
  };
  const inferredDomain = inferDomainFromCompanyName(companyName);
  if (inferredDomain) return inferredDomain;

  const candidates = [
    ...(raw.search_results ?? []).map((result) => ({
      url: result.url,
      text: `${result.title ?? ""} ${result.snippet ?? ""}`,
    })),
    ...(raw.citations ?? []).map((url) => ({ url, text: "" })),
  ].filter((candidate): candidate is { url: string; text: string } => Boolean(candidate.url));

  const directoryDomains = [
    "krs-online.com.pl",
    "oferteo.pl",
    "analizafirm.pl",
    "aleo.com",
    "rejestrkrs.pl",
    "rejestr.io",
    "krs-pobierz.pl",
    "bizraport.pl",
    "monitorfirm.pb.pl",
    "imsig.pl",
    "pstm.org.pl",
    "rocketjobs.pl",
    "panoramafirm.pl",
    "pkt.pl",
    "regon.info",
    "owg.pl",
    "dnb.com",
    "kompass.com",
  ];
  const brandTokens = brandTokensFromCompanyName(companyName);
  let best: { url: string; score: number } | null = null;

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.url);
      const host = url.hostname.replace(/^www\./, "");
      if (directoryDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
        continue;
      }
      if (host.includes("facebook.com") || host.includes("linkedin.com")) continue;
      const hostWithoutTld = host.split(".").slice(0, -1).join(".");
      const searchable = `${host} ${url.pathname} ${candidate.text}`.toLowerCase();
      const score = brandTokens.reduce((sum, token) => {
        const tokenRoot = token.split(".")[0];
        const hostMatch = hostWithoutTld.includes(tokenRoot) ? 5 : 0;
        const contentMatch = searchable.includes(tokenRoot) ? 1 : 0;
        return sum + hostMatch + contentMatch;
      }, host.endsWith(".pl") ? 1 : 0);
      const normalizedUrl = `${url.protocol}//${host}`;
      if (!best || score > best.score) best = { url: normalizedUrl, score };
    } catch {
      // Ignore malformed URLs from API metadata.
    }
  }

  return best && best.score >= 5 ? best.url : null;
}

function buildSeedCompany(nip: string): CompanyRegistryRow {
  return {
    name: "",
    nip,
    regon: "",
    krs: "",
    address: "",
    legalForm: "",
    shareCapital: "",
    registrationDate: "",
    mainActivity: "",
    revenue: "",
    opinions: "",
  };
}

function buildRegistryRowsFromGoWork(inputNip: string, goWork: GoWorkReport): CompanyRegistryRow[] {
  const rows = goWork.pages.flatMap((page) => page.rows);
  const reviews = goWork.pages.flatMap((page) => page.reviews);
  const financials = goWork.pages.flatMap((page) => page.financials);
  const name = findGoWorkValue(rows, ["nazwa", "firma", "profil"]);
  const nip = findNumericGoWorkValue(rows, ["nip"], /\b\d{10}\b/) || inputNip;
  const krs = findNumericGoWorkValue(rows, ["krs"], /\b\d{10}\b/);
  const regon = findNumericGoWorkValue(rows, ["regon"], /\b\d{9,14}\b/);
  const latestFinancials = financials.find((row) => row.revenue || row.grossProfit);

  return [
    {
      name,
      nip,
      regon,
      krs,
      address: findGoWorkValue(rows, ["adres", "siedziba", "lokalizacja"]),
      legalForm: findGoWorkValue(rows, ["forma prawna", "typ firmy"]),
      shareCapital: findGoWorkValue(rows, ["kapitał", "kapital"]),
      registrationDate: findGoWorkValue(rows, ["data rejestracji", "rozpoczęcie działalności", "rok założenia"]),
      mainActivity: findGoWorkValue(rows, ["działalność", "opis", "branża", "specjalizacja"]),
      revenue: latestFinancials
        ? [latestFinancials.year, latestFinancials.revenue, latestFinancials.grossProfit].filter(Boolean).join(": ")
        : findGoWorkValue(rows, ["przychód", "przychody", "revenue", "obrót", "obroty"]),
      opinions: reviews.length > 0
        ? `${reviews.length} pobranych wpisów`
        : findGoWorkValue(rows, ["opinie", "ocena", "rating", "liczba opinii"]),
    },
  ];
}

function findGoWorkValue(rows: GoWorkReport["pages"][number]["rows"], patterns: string[]): string {
  const match = rows.find((row) => {
    const searchable = `${row.category} ${row.label} ${row.value}`.toLowerCase();
    return patterns.some((pattern) => searchable.includes(pattern));
  });

  return match?.value ?? "";
}

function findNumericGoWorkValue(
  rows: GoWorkReport["pages"][number]["rows"],
  labelPatterns: string[],
  valuePattern: RegExp
): string {
  const match = rows.find((row) => {
    const label = `${row.category} ${row.label}`.toLowerCase();
    return labelPatterns.some((pattern) => label.includes(pattern));
  });
  const rawValue = `${match?.value ?? ""} ${match?.sourceQuote ?? ""}`;
  return rawValue.match(valuePattern)?.[0] ?? match?.value ?? "";
}

function extractWebsiteFromGoWork(goWork: GoWorkReport): string | null {
  const pages = [...goWork.pages].sort((a, b) => {
    const aContact = isGoWorkContactPage(a) ? 0 : 1;
    const bContact = isGoWorkContactPage(b) ? 0 : 1;
    return aContact - bContact;
  });

  for (const page of pages) {
    for (const row of page.rows) {
      const searchable = `${row.label} ${row.value} ${row.sourceQuote}`.toLowerCase();
      if (!searchable.includes("www") && !searchable.includes("strona") && !searchable.includes("http")) {
        continue;
      }
      const website = extractWebsiteFromText(`${row.value} ${row.sourceQuote}`, "");
      if (website) return website;
    }
  }

  return null;
}

function isGoWorkContactPage(page: GoWorkReport["pages"][number]): boolean {
  const searchable = `${page.title} ${page.url}`.toLowerCase();
  return searchable.includes("dane kontaktowe") || searchable.includes("dane-kontaktowe-firmy");
}

function extractWebsiteFromKrs(krs: KrsReport): string | null {
  const website = krs.facts.find((fact) => fact.label === "WWW według KRS")?.value;
  if (!website) return null;
  try {
    const url = new URL(website);
    return `${url.protocol}//${url.hostname.replace(/^www\./, "")}`;
  } catch {
    return null;
  }
}

function inferDomainFromCompanyName(companyName: string): string | null {
  const match = companyName.match(/[a-z0-9-]+\.(?:pl|com|eu|net|org)/i);
  return match ? `https://${match[0].toLowerCase()}` : null;
}

function brandTokensFromCompanyName(companyName: string): string[] {
  return companyName
    .toLowerCase()
    .replace(/spółka z ograniczoną odpowiedzialnością|sp\.?\s*z\s*o\.?o\.?/g, "")
    .split(/[^a-z0-9ąćęłńóśźż.]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

function extractWebsiteFromDigitalRows(rows: DigitalPresenceRow[]): string | null {
  for (const row of rows) {
    const platform = row.platform.toLowerCase();
    if (!platform.includes("strona") && !platform.includes("www") && !platform.includes("website")) {
      continue;
    }

    const urlMatch = row.address.match(/https?:\/\/[^\s)\]]+/);
    if (!urlMatch) continue;
    try {
      const url = new URL(urlMatch[0]);
      return `${url.protocol}//${url.hostname.replace(/^www\./, "")}`;
    } catch {
      // Ignore malformed URLs from model output.
    }
  }

  return null;
}

function extractWebsiteFromFactRows(rows: PerplexityFactRow[], companyName: string): string | null {
  const websiteRows = rows.filter((row) => {
    const searchable = `${row.category} ${row.value}`.toLowerCase();
    return searchable.includes("strona") || searchable.includes("www") || searchable.includes("website");
  });

  for (const row of [...websiteRows, ...rows]) {
    const website = extractWebsiteFromText(`${row.value} ${row.source}`, companyName);
    if (website) return website;
  }

  return null;
}

function extractWebsiteFromText(text: string, companyName: string): string | null {
  const candidates: Array<{ url: string; score: number }> = [];
  const urlRegex = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s|,;]*)?/gi;
  const brandTokens = brandTokensFromCompanyName(companyName);
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text))) {
    if (match.index > 0 && text[match.index - 1] === "@") continue;

    const normalized = normalizeWebsiteCandidate(match[0]);
    if (!normalized) continue;

    try {
      const url = new URL(normalized);
      const host = url.hostname.replace(/^www\./, "");
      const hostWithoutTld = host.split(".").slice(0, -1).join(".");
      const score = brandTokens.reduce((sum, token) => {
        const tokenRoot = token.split(".")[0];
        return sum + (hostWithoutTld.includes(tokenRoot) ? 5 : 0);
      }, host.endsWith(".pl") ? 2 : 0);
      candidates.push({ url: `${url.protocol}//${host}`, score });
    } catch {
      // Ignore malformed URLs from model output.
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url ?? null;
}

function normalizeWebsiteCandidate(rawValue: string): string | null {
  const cleaned = rawValue
    .trim()
    .replace(/[.)\]]+$/g, "")
    .replace(/^http:\/\//i, "https://");
  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  try {
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./, "");
    if (!host.includes(".")) return null;
    if (!isValidWebsiteHost(host)) return null;
    if (isDirectoryOrSocialDomain(host)) return null;
    return `${url.protocol}//${host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return null;
  }
}

function isValidWebsiteHost(host: string): boolean {
  const labels = host.toLowerCase().split(".");
  const tld = labels[labels.length - 1] ?? "";
  if (labels.length < 2 || !/^[a-z]{2,24}$/.test(tld)) return false;

  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function isDirectoryOrSocialDomain(host: string): boolean {
  const excludedDomains = [
    "krs-online.com.pl",
    "oferteo.pl",
    "analizafirm.pl",
    "aleo.com",
    "rejestrkrs.pl",
    "rejestr.io",
    "krs-pobierz.pl",
    "bizraport.pl",
    "monitorfirm.pb.pl",
    "imsig.pl",
    "panoramafirm.pl",
    "pkt.pl",
    "regon.info",
    "owg.pl",
    "dnb.com",
    "kompass.com",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "x.com",
    "twitter.com",
  ];

  return excludedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function parseRegistryRows(markdown: string): CompanyRegistryRow[] {
  const tableRows = parseMarkdownTable(markdown);
  const keyValueRow = registryKeyValueRow(tableRows);
  const rowsToMap = keyValueRow ? [keyValueRow] : tableRows;

  return rowsToMap.map((row) => ({
    name: pickValue(row, ["Nazwa", "Nazwa firmy", "Firma"]),
    nip: pickValue(row, ["NIP"]),
    regon: pickValue(row, ["REGON"]),
    krs: pickValue(row, ["KRS", "Numer KRS"]),
    address: pickValue(row, ["Adres", "Siedziba", "Adres siedziby"]),
    legalForm: pickValue(row, ["Forma prawna"]),
    shareCapital: pickValue(row, ["Kapitał zakładowy", "Kapital zakladowy"]),
    registrationDate: pickValue(row, ["Data rejestracji", "Rejestracja"]),
    mainActivity: pickValue(row, ["Główna działalność", "Glowna dzialalnosc", "PKD"]),
    revenue: pickValue(row, ["Przychody", "Przychód", "Revenue"]),
    opinions: pickValue(row, ["Opinie", "Ocena", "Liczba opinii"]),
  }));
}

function registryKeyValueRow(rows: Record<string, string>[]): Record<string, string> | null {
  const result: Record<string, string> = {};

  for (const row of rows) {
    const field = pickValue(row, ["Pole", "Informacja", "Dane", "Atrybut"]);
    const value = pickValue(row, ["Wartość", "Wartosc", "Value"]);
    if (!field || !value) continue;

    const normalized = field.toLowerCase();
    if (normalized.includes("nazwa")) result.nazwa = value;
    if (normalized.includes("krs")) result.krs = value;
    if (normalized.includes("adres") || normalized.includes("siedzib")) result.adres = value;
    if (normalized.includes("forma")) result.forma_prawna = value;
    if (normalized.includes("kapita")) result.kapital_zakladowy = value;
    if (normalized.includes("rejestr")) result.data_rejestracji = value;
    if (normalized.includes("dzialal") || normalized.includes("pkd")) result.glowna_dzialalnosc = value;
  }

  return Object.keys(result).length > 0 ? result : null;
}

function parseDigitalPresenceRows(markdown: string): DigitalPresenceRow[] {
  return parseMarkdownTable(markdown).map((row) => ({
    platform: pickValue(row, ["Platforma"]),
    address: pickValue(row, ["Adres", "URL", "Link"]),
    details: pickValue(row, [
      "Liczba followersów / Dodatkowe informacje",
      "Liczba followersow / Dodatkowe informacje",
      "Dodatkowe informacje",
      "Followers",
    ]),
  }));
}

function parsePerplexityFactRows(markdown: string): PerplexityFactRow[] {
  return parseMarkdownTable(markdown).map((row) => ({
    category: pickValue(row, ["Kategoria"]),
    value: pickValue(row, ["Wartość", "Wartosc", "Value"]),
    source: pickValue(row, ["Źródło / Uwagi", "Zrodlo / Uwagi", "Źródło", "Zrodlo", "Uwagi"]),
  }));
}
