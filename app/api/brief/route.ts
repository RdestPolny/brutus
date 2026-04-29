import { NextRequest, NextResponse } from "next/server";
import {
  askPerplexityTableWithDebug,
  buildDigitalPresencePrompt,
} from "@/lib/perplexity";
import { parseMarkdownTable, pickValue } from "@/lib/markdownTable";
import { fetchGooglePlaceReportWithDebug } from "@/lib/places";
import { fetchWebsiteDigitalPresence, mergeDigitalPresenceRows } from "@/lib/website";
import { fetchGoWorkReportWithDebug } from "@/lib/gowork";
import { extractWebsiteFactsWithDebug } from "@/lib/websiteFacts";
import type { CompanyRegistryRow, DigitalPresenceRow, GoWorkReport, PerplexityFactRow } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { companyName?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  const companyName = String(body.companyName ?? "").trim().replace(/\s+/g, " ");
  if (companyName.length < 2) {
    return NextResponse.json({ error: "Podaj nazwę firmy" }, { status: 400 });
  }

  try {
    const goWorkSeedCompany = buildSeedCompany(companyName);
    const goWorkResult = await fetchGoWorkReportWithDebug(goWorkSeedCompany, {});
    const goWork = {
      profileUrl: goWorkResult.profileUrl,
      searchRawMarkdown: goWorkResult.searchRawMarkdown,
      pages: goWorkResult.pages,
    };

    const registryRows = buildRegistryRowsFromGoWork(companyName, goWork);
    const firstRegistryRow = registryRows[0];

    if (!firstRegistryRow?.name) {
      throw new Error("Nie udało się odczytać nazwy firmy z GoWork");
    }

    const digitalPresencePrompt = buildDigitalPresencePrompt(firstRegistryRow.name, {
      officialWebsite: extractWebsiteFromGoWork(goWork),
      nip: firstRegistryRow.nip || undefined,
      krs: firstRegistryRow.krs || undefined,
    });
    const digitalPresenceResult = await askPerplexityTableWithDebug(digitalPresencePrompt);
    const digitalPresenceMarkdown = digitalPresenceResult.content;
    const perplexityDigitalRows = parseDigitalPresenceRows(digitalPresenceMarkdown);
    const resolvedWebsite = extractWebsiteFromGoWork(goWork) ?? extractWebsiteFromDigitalRows(perplexityDigitalRows);
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

    const placesQuery = [firstRegistryRow.name, firstRegistryRow.address]
      .filter(Boolean)
      .join(" ");
    const googlePlaceResult = await fetchGooglePlaceReportWithDebug(placesQuery);

    return NextResponse.json({
      input: { companyName, nip: firstRegistryRow.nip || undefined },
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
      googlePlace: googlePlaceResult.report,
      debug: {
        websiteFactsRawResponse: websiteFactsResult.debug,
        goWorkRawResponse: goWorkResult.debug,
        digitalPresencePrompt,
        digitalPresenceResponse: digitalPresenceMarkdown,
        digitalPresenceRawResponse: digitalPresenceResult.response,
        websitePresenceRawResponse: websitePresenceResult.debug,
        placesQuery,
        placesRawResponse: googlePlaceResult.response,
        officialWebsite: resolvedWebsite,
        resolvedWebsite,
        steps: [
          {
            name: "Firecrawl Search + Firecrawl + Gemini: GoWork",
            request: goWorkResult.debug.searchRequest,
            response: goWorkResult.debug,
          },
          {
            name: "Perplexity: strona i social media",
            request: digitalPresenceResult.request,
            response: digitalPresenceResult.response,
          },
          {
            name: "Firecrawl + Gemini: fakty z oficjalnej strony",
            request: websiteFactsResult.debug.scrapeRequest ?? { resolvedWebsite },
            response: websiteFactsResult.debug,
          },
          {
            name: "Website fallback: linki ze strony firmowej",
            request: { resolvedWebsite },
            response: websitePresenceResult.debug,
          },
          {
            name: "Google Places: searchText",
            request: googlePlaceResult.request,
            response: googlePlaceResult.response,
          },
        ],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[brief] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

function buildSeedCompany(companyName: string): CompanyRegistryRow {
  return {
    name: companyName,
    nip: "",
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

function buildRegistryRowsFromGoWork(companyName: string, goWork: GoWorkReport): CompanyRegistryRow[] {
  const rows = goWork.pages.flatMap((page) => page.rows);
  const name = findGoWorkValue(rows, ["nazwa", "firma", "profil"]) || companyName;
  const nip = findNumericGoWorkValue(rows, ["nip"], /\b\d{10}\b/);
  const krs = findNumericGoWorkValue(rows, ["krs"], /\b\d{10}\b/);
  const regon = findNumericGoWorkValue(rows, ["regon"], /\b\d{9,14}\b/);

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
      revenue: findGoWorkValue(rows, ["przychód", "przychody", "revenue", "obrót", "obroty"]),
      opinions: findGoWorkValue(rows, ["opinie", "ocena", "rating", "liczba opinii"]),
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
  for (const row of goWork.pages.flatMap((page) => page.rows)) {
    const searchable = `${row.label} ${row.value} ${row.sourceQuote}`.toLowerCase();
    if (!searchable.includes("www") && !searchable.includes("strona") && !searchable.includes("http")) {
      continue;
    }
    const website = extractWebsiteFromText(`${row.value} ${row.sourceQuote}`, "");
    if (website) return website;
  }

  return null;
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
    if (isDirectoryOrSocialDomain(host)) return null;
    return `${url.protocol}//${host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return null;
  }
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
