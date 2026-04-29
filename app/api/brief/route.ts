import { NextRequest, NextResponse } from "next/server";
import {
  askPerplexityTableWithDebug,
  buildDigitalPresencePrompt,
  buildRegistryPrompt,
} from "@/lib/perplexity";
import { parseMarkdownTable, pickValue } from "@/lib/markdownTable";
import { fetchGooglePlaceReportWithDebug } from "@/lib/places";
import { fetchWebsiteDigitalPresence, mergeDigitalPresenceRows } from "@/lib/website";
import { fetchGoWorkReportWithDebug } from "@/lib/gowork";
import {
  buildWebsiteFactsPerplexityPrompt,
  extractWebsiteFactsWithDebug,
  validateWebsiteFactsWithGemini,
} from "@/lib/websiteFacts";
import type { CompanyRegistryRow, DigitalPresenceRow, PerplexityFactRow } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { nip?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  const nip = String(body.nip ?? "").replace(/\D/g, "");
  if (nip.length !== 10) {
    return NextResponse.json({ error: "NIP musi mieć 10 cyfr" }, { status: 400 });
  }

  try {
    const registryPrompt = buildRegistryPrompt(nip);
    const registryResult = await askPerplexityTableWithDebug(registryPrompt);
    const registryMarkdown = registryResult.content;
    const registryRows = parseRegistryRows(registryMarkdown);
    const firstRegistryRow = registryRows[0];

    if (!firstRegistryRow?.name) {
      throw new Error("Nie udało się odczytać nazwy firmy z pierwszej tabeli Perplexity");
    }

    const officialWebsite = extractOfficialWebsite(registryResult.response, firstRegistryRow.name);
    const websiteFactsPerplexityPrompt = buildWebsiteFactsPerplexityPrompt(firstRegistryRow, {
      nip,
      officialWebsite,
    });
    const websiteFactsPerplexityResult = await askPerplexityTableWithDebug(websiteFactsPerplexityPrompt);
    const websiteFactsPerplexityMarkdown = websiteFactsPerplexityResult.content;
    const perplexityFactsRows = parsePerplexityFactRows(websiteFactsPerplexityMarkdown);
    const websiteFromPerplexityFacts = extractWebsiteFromFactRows(perplexityFactsRows, firstRegistryRow.name);

    const digitalPresencePrompt = buildDigitalPresencePrompt(firstRegistryRow.name, {
      officialWebsite: officialWebsite ?? websiteFromPerplexityFacts,
      nip,
      krs: firstRegistryRow.krs,
    });
    const digitalPresenceResult = await askPerplexityTableWithDebug(digitalPresencePrompt);
    const digitalPresenceMarkdown = digitalPresenceResult.content;
    const perplexityDigitalRows = parseDigitalPresenceRows(digitalPresenceMarkdown);
    const resolvedWebsite =
      officialWebsite ?? websiteFromPerplexityFacts ?? extractWebsiteFromDigitalRows(perplexityDigitalRows);
    const websiteFactsResult = await extractWebsiteFactsWithDebug(resolvedWebsite);
    const websitePresenceResult = await fetchWebsiteDigitalPresence(resolvedWebsite);
    const digitalPresenceRows = mergeDigitalPresenceRows(
      perplexityDigitalRows,
      websitePresenceResult.rows
    );

    const websiteFactsValidationResult = await validateWebsiteFactsWithGemini(websiteFactsResult, {
      registryMarkdown,
      websiteFactsMarkdown: websiteFactsPerplexityMarkdown,
      digitalPresenceMarkdown,
    });
    const websiteFacts = {
      url: websiteFactsResult.url,
      textLength: websiteFactsResult.textLength,
      facts: websiteFactsResult.facts,
      summary: websiteFactsResult.summary,
      validation: websiteFactsValidationResult.validation,
    };

    const goWorkResult = await fetchGoWorkReportWithDebug(firstRegistryRow, {
      nip,
      krs: firstRegistryRow.krs,
    });
    const goWork = {
      profileUrl: goWorkResult.profileUrl,
      searchRawMarkdown: goWorkResult.searchRawMarkdown,
      pages: goWorkResult.pages,
    };

    const placesQuery = [firstRegistryRow.name, firstRegistryRow.address]
      .filter(Boolean)
      .join(" ");
    const googlePlaceResult = await fetchGooglePlaceReportWithDebug(placesQuery);

    return NextResponse.json({
      input: { nip },
      generatedAt: new Date().toISOString(),
      registry: {
        rawMarkdown: registryMarkdown,
        rows: registryRows,
      },
      digitalPresence: {
        rawMarkdown: digitalPresenceMarkdown,
        rows: digitalPresenceRows,
      },
      perplexityFacts: {
        rawMarkdown: websiteFactsPerplexityMarkdown,
        rows: perplexityFactsRows,
      },
      websiteFacts,
      goWork,
      googlePlace: googlePlaceResult.report,
      debug: {
        registryPrompt,
        registryResponse: registryMarkdown,
        registryRawResponse: registryResult.response,
        websiteFactsPerplexityPrompt,
        websiteFactsPerplexityResponse: websiteFactsPerplexityMarkdown,
        websiteFactsPerplexityRawResponse: websiteFactsPerplexityResult.response,
        websiteFactsRawResponse: websiteFactsResult.debug,
        websiteFactsValidationRawResponse: websiteFactsValidationResult.debug,
        goWorkRawResponse: goWorkResult.debug,
        digitalPresencePrompt,
        digitalPresenceResponse: digitalPresenceMarkdown,
        digitalPresenceRawResponse: digitalPresenceResult.response,
        websitePresenceRawResponse: websitePresenceResult.debug,
        placesQuery,
        placesRawResponse: googlePlaceResult.response,
        officialWebsite,
        websiteFromPerplexityFacts,
        resolvedWebsite,
        steps: [
          {
            name: "Perplexity: dane rejestrowe",
            request: registryResult.request,
            response: registryResult.response,
          },
          {
            name: "Perplexity: dane firmowe i kontaktowe",
            request: websiteFactsPerplexityResult.request,
            response: websiteFactsPerplexityResult.response,
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
            name: "Gemini: walidacja danych ze strony",
            request: websiteFactsValidationResult.debug,
            response: websiteFacts.validation,
          },
          {
            name: "Perplexity + Firecrawl + Gemini: GoWork",
            request: goWorkResult.debug.searchRequest,
            response: goWorkResult.debug,
          },
          {
            name: "Website fallback: linki ze strony firmowej",
            request: { officialWebsite, resolvedWebsite },
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
    krs: pickValue(row, ["KRS", "Numer KRS"]),
    address: pickValue(row, ["Adres", "Siedziba", "Adres siedziby"]),
    legalForm: pickValue(row, ["Forma prawna"]),
    shareCapital: pickValue(row, ["Kapitał zakładowy", "Kapital zakladowy"]),
    registrationDate: pickValue(row, ["Data rejestracji", "Rejestracja"]),
    mainActivity: pickValue(row, ["Główna działalność", "Glowna dzialalnosc", "PKD"]),
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
