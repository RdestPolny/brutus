import { NextRequest, NextResponse } from "next/server";
import {
  askPerplexityTableWithDebug,
  buildDigitalPresencePrompt,
  buildRegistryPrompt,
} from "@/lib/perplexity";
import { parseMarkdownTable, pickValue } from "@/lib/markdownTable";
import { fetchGooglePlaceReportWithDebug } from "@/lib/places";
import { fetchWebsiteDigitalPresence, mergeDigitalPresenceRows } from "@/lib/website";
import type { CompanyRegistryRow, DigitalPresenceRow } from "@/lib/types";

export const maxDuration = 90;

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
    const digitalPresencePrompt = buildDigitalPresencePrompt(firstRegistryRow.name, {
      officialWebsite,
      nip,
      krs: firstRegistryRow.krs,
    });
    const digitalPresenceResult = await askPerplexityTableWithDebug(digitalPresencePrompt);
    const digitalPresenceMarkdown = digitalPresenceResult.content;
    const websitePresenceResult = await fetchWebsiteDigitalPresence(officialWebsite);
    const digitalPresenceRows = mergeDigitalPresenceRows(
      parseDigitalPresenceRows(digitalPresenceMarkdown),
      websitePresenceResult.rows
    );

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
      googlePlace: googlePlaceResult.report,
      debug: {
        registryPrompt,
        registryResponse: registryMarkdown,
        registryRawResponse: registryResult.response,
        digitalPresencePrompt,
        digitalPresenceResponse: digitalPresenceMarkdown,
        digitalPresenceRawResponse: digitalPresenceResult.response,
        websitePresenceRawResponse: websitePresenceResult.debug,
        placesQuery,
        placesRawResponse: googlePlaceResult.response,
        officialWebsite,
        steps: [
          {
            name: "Perplexity: dane rejestrowe",
            request: registryResult.request,
            response: registryResult.response,
          },
          {
            name: "Perplexity: strona i social media",
            request: digitalPresenceResult.request,
            response: digitalPresenceResult.response,
          },
          {
            name: "Website fallback: linki ze strony firmowej",
            request: { officialWebsite },
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
    "panoramafirm.pl",
    "pkt.pl",
    "regon.info",
    "owg.pl",
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
      const searchable = `${host} ${candidate.text}`.toLowerCase();
      const score = brandTokens.reduce(
        (sum, token) => sum + (searchable.includes(token) ? 2 : 0),
        host.endsWith(".pl") ? 1 : 0
      );
      const normalizedUrl = `${url.protocol}//${host}`;
      if (!best || score > best.score) best = { url: normalizedUrl, score };
    } catch {
      // Ignore malformed URLs from API metadata.
    }
  }

  return best?.url ?? null;
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
