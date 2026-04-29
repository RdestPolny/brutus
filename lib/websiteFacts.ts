import { scrapeCleanHtmlWithDebug } from "./firecrawl";
import { askGeminiJsonWithDebug } from "./gemini";
import { htmlToEssentialText } from "./htmlText";
import type { CompanyRegistryRow, WebsiteFactsReport, WebsiteFactsValidation } from "./types";

export async function extractWebsiteFactsWithDebug(
  officialWebsite: string | null
): Promise<WebsiteFactsReport & { debug: WebsiteFactsDebug }> {
  if (!officialWebsite) {
    return {
      url: null,
      textLength: 0,
      facts: [],
      summary: "",
      validation: null,
      debug: { skipped: "No official website" },
    };
  }

  const scrape = await scrapeCleanHtmlWithDebug(officialWebsite);
  const text = htmlToEssentialText(scrape.html);
  const extractionPrompt = buildWebsiteFactsExtractionPrompt(officialWebsite, text);
  const extraction = await askGeminiJsonWithDebug<GeminiFactsExtraction>(extractionPrompt, {
    systemInstruction:
      "Jesteś analitykiem danych firmowych. Wyciągasz wyłącznie fakty widoczne w przekazanym tekście strony. Nie zgadujesz i nie uzupełniasz danych z pamięci.",
  });

  const facts = (extraction.content?.facts ?? []).map((fact) => ({
    category: String(fact.category ?? ""),
    label: String(fact.label ?? ""),
    value: String(fact.value ?? ""),
    sourceQuote: String(fact.sourceQuote ?? ""),
    confidence: normalizeConfidence(fact.confidence),
  }));

  return {
    url: officialWebsite,
    textLength: text.length,
    facts,
    summary: String(extraction.content?.summary ?? ""),
    validation: null,
    debug: {
      scrapeRequest: scrape.request,
      scrapeResponse: scrape.response,
      cleanedTextPreview: text.slice(0, 4000),
      extractionRequest: extraction.request,
      extractionResponse: extraction.response,
      extractionRawText: extraction.rawText,
    },
  };
}

export async function validateWebsiteFactsWithGemini(
  websiteFacts: WebsiteFactsReport,
  evidence: WebsiteFactsValidationEvidence
): Promise<{ validation: WebsiteFactsValidation | null; debug: unknown }> {
  if (!websiteFacts.url || websiteFacts.facts.length === 0) {
    return { validation: null, debug: { skipped: "No website facts to validate" } };
  }

  const validationPrompt = buildWebsiteFactsValidationPrompt(websiteFacts, evidence);
  const validation = await askGeminiJsonWithDebug<WebsiteFactsValidation>(validationPrompt, {
    systemInstruction:
      "Porównujesz źródła o firmie. Oceniaj zgodność faktów ostrożnie, wskazuj konflikty i nie twórz nowych danych.",
  });

  return {
    validation: validation.content,
    debug: {
      request: validation.request,
      response: validation.response,
      rawText: validation.rawText,
    },
  };
}

export function buildWebsiteFactsPerplexityPrompt(
  company: CompanyRegistryRow,
  context: { nip: string; officialWebsite: string | null }
): string {
  const websiteLine = context.officialWebsite
    ? `Oficjalna strona ustalona w pierwszym kroku: ${context.officialWebsite}.`
    : "Oficjalna strona nie została jeszcze jednoznacznie ustalona.";

  return `${company.name} - zweryfikuj publicznie dostępne dane firmowe i kontaktowe.
NIP: ${context.nip}${company.krs ? `, KRS: ${company.krs}` : ""}.
${websiteLine}

Przygotuj tabelę Markdown z kolumnami dokładnie:
Kategoria | Wartość | Źródło / Uwagi

Szukaj przede wszystkim danych, które można potem porównać z oficjalną stroną:
- pełna nazwa firmy,
- adres rejestrowy lub adresy oddziałów/biur,
- NIP, REGON, KRS,
- forma prawna,
- osoby wymienione publicznie przy firmie i ich role,
- e-mail, telefon,
- opis działalności lub specjalizacji.

Zasady:
- Nie zgaduj. Jeśli nie ma wiarygodnej wartości, wpisz "nie znaleziono".
- Preferuj oficjalną stronę, rejestry publiczne i wiarygodne katalogi.
- Zwróć tylko tabelę, bez dodatkowego komentarza.`;
}

function buildWebsiteFactsExtractionPrompt(url: string, text: string): string {
  return `Przeanalizuj tekst pobrany z oficjalnej strony firmy: ${url}

Zwróć WYŁĄCZNIE poprawny JSON w formacie:
{
  "summary": "jednozdaniowe streszczenie najważniejszych danych ze strony",
  "facts": [
    {
      "category": "company_name | address | nip | regon | krs | legal_form | person | role | email | phone | social_media | opening_hours | business_description | other",
      "label": "krótka etykieta po polsku",
      "value": "konkretna wartość znaleziona w tekście",
      "sourceQuote": "krótki cytat lub fragment tekstu potwierdzający wartość",
      "confidence": "high | medium | low"
    }
  ]
}

Instrukcje:
- Wyciągnij wszystkie istotne informacje identyfikujące firmę: nazwy, adresy, NIP, REGON, KRS, formę prawną, ludzi i role, e-maile, telefony, social media, godziny, opis działalności.
- Rozbij różne fakty na osobne obiekty. Nie łącz wielu adresów, osób lub numerów w jednym rekordzie.
- Używaj tylko danych z tekstu poniżej. Nie dopowiadaj informacji z pamięci ani z internetu.
- Jeśli tekst zawiera elementy menu, stopki lub polityk prywatności, ignoruj je, chyba że zawierają dane firmowe.
- sourceQuote ma być krótki, maksymalnie 160 znaków.

TEKST STRONY:
${text}`;
}

function buildWebsiteFactsValidationPrompt(
  websiteFacts: WebsiteFactsReport,
  evidence: WebsiteFactsValidationEvidence
): string {
  return `Porównaj fakty wyciągnięte z oficjalnej strony z danymi z trzech zapytań Perplexity.

Zwróć WYŁĄCZNIE poprawny JSON w formacie:
{
  "summary": "krótki werdykt po polsku",
  "validatedFacts": [
    {
      "category": "kategoria faktu",
      "value": "wartość",
      "status": "confirmed | conflict | website_only | perplexity_only | unclear",
      "note": "krótkie uzasadnienie"
    }
  ],
  "conflicts": [
    {
      "field": "czego dotyczy konflikt",
      "websiteValue": "wartość ze strony",
      "perplexityValue": "wartość z Perplexity",
      "note": "krótki opis"
    }
  ],
  "missingOnWebsite": ["istotne wartości znalezione w Perplexity, których nie ma na stronie"],
  "missingInPerplexity": ["istotne wartości ze strony, których nie ma w danych Perplexity"]
}

Zasady:
- "confirmed" tylko gdy wartości są zgodne semantycznie, nawet jeśli format jest inny.
- "conflict" tylko gdy dane wyraźnie sobie przeczą.
- "website_only" gdy fakt jest tylko na stronie.
- "perplexity_only" gdy fakt jest tylko w Perplexity.
- "unclear" gdy nie da się rzetelnie ocenić.
- Nie twórz nowych faktów.

FAKTY ZE STRONY:
${JSON.stringify({ url: websiteFacts.url, summary: websiteFacts.summary, facts: websiteFacts.facts }, null, 2)}

PERPLEXITY 1 - DANE REJESTROWE:
${evidence.registryMarkdown}

PERPLEXITY 2 - DANE FIRMOWE/KONTAKTOWE:
${evidence.websiteFactsMarkdown}

PERPLEXITY 3 - STRONA I SOCIAL MEDIA:
${evidence.digitalPresenceMarkdown}`;
}

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") return normalized;
  return "medium";
}

interface GeminiFactsExtraction {
  summary?: string;
  facts?: Array<{
    category?: string;
    label?: string;
    value?: string;
    sourceQuote?: string;
    confidence?: string;
  }>;
}

interface WebsiteFactsValidationEvidence {
  registryMarkdown: string;
  websiteFactsMarkdown: string;
  digitalPresenceMarkdown: string;
}

interface WebsiteFactsDebug {
  skipped?: string;
  scrapeRequest?: unknown;
  scrapeResponse?: unknown;
  cleanedTextPreview?: string;
  extractionRequest?: unknown;
  extractionResponse?: unknown;
  extractionRawText?: string;
}
