import type { LeadInput } from "./types";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const SONAR = "sonar";
const SONAR_PRO = "sonar-pro";

// Research cache — TTL 10 days, currently used for the industry/risk batch.
const industryCache = new Map<string, { data: string; cachedAt: number }>();
const INDUSTRY_CACHE_TTL = 10 * 24 * 60 * 60 * 1000;

export interface ResearchSourceContext {
  website?: string | null;
  krs?: string | null;
  places?: string | null;
}

async function searchSonar(query: string, model: string): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY not set");

  const res = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "Jesteś analitykiem wywiadowczym. Wykonujesz precyzyjne wyszukiwania i zwracasz TYLKO znalezione fakty z konkretnymi URL-ami źródeł. Dane z sekcji ZWERYFIKOWANE ŹRÓDŁA traktuj jako prawdę i nie zastępuj ich domysłami. Nie wymyślaj danych. Jeśli czegoś nie znajdziesz — napisz wprost 'nie znaleziono'.",
        },
        { role: "user", content: query },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Perplexity error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content as string;
}

function sourceBlock(sourceContext?: ResearchSourceContext): string {
  const parts = [
    sourceContext?.website && `STRONA FIRMOWA / FIRECRAWL:\n${sourceContext.website}`,
    sourceContext?.krs && `KRS / eKRS:\n${sourceContext.krs}`,
    sourceContext?.places && `GOOGLE PLACES:\n${sourceContext.places}`,
  ].filter(Boolean);

  if (parts.length === 0) return "ZWERYFIKOWANE ŹRÓDŁA: brak danych źródłowych.";
  return `ZWERYFIKOWANE ŹRÓDŁA - NIE PYTAJ O TO PONOWNIE, UŻYJ JAKO KONTEKSTU:\n${truncate(
    parts.join("\n\n---\n\n"),
    14000
  )}`;
}

function inputLine(input: LeadInput): string {
  const { companyName, domain, nip, krs } = input;
  return [
    `Firma: "${companyName}"`,
    `domena: ${domain}`,
    nip && `NIP: ${nip}`,
    krs && `KRS: ${krs}`,
  ]
    .filter(Boolean)
    .join(", ");
}

function currentResearchWindow(): string {
  return `Dzisiaj jest ${new Date().toISOString().slice(0, 10)}. Dla sygnałów bieżących preferuj ostatnie 12 miesięcy; jeśli źródło jest starsze, oznacz datę.`;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n[...ucieto kontekst zrodlowy...]`;
}

// R1 — firmographic gaps: only facts not reliably available from source systems.
export async function researchFirmographicGaps(
  input: LeadInput,
  sourceContext?: ResearchSourceContext
): Promise<string> {
  const name = input.companyName;

  return searchSonar(
    `${currentResearchWindow()}
${sourceBlock(sourceContext)}

ZADANIE R1: uzupełnij tylko luki firmograficzne dla: ${inputLine(input)}.

NIE SZUKAJ ponownie: adresu, telefonu, emaila, social links, danych KRS ani Google Maps, jeśli są w zweryfikowanych źródłach.

Szukaj wyłącznie:
- zewnętrzne opisy branży/specjalizacji i modelu biznesowego, jeśli strona nie wystarcza
- przybliżona liczba pracowników / skala zespołu z LinkedIn, rejestrów branżowych lub katalogów
- zakres rynku: lokalny, krajowy, międzynarodowy, z dowodem
- rejestracja domeny / wiek domeny, jeśli publicznie dostępne
- klienci, segmenty klientów lub case studies z publicznych źródeł

Zwróć sekcje: znalezione fakty, brak danych, konflikty ze źródłami. Każdy fakt musi mieć URL.`,
    SONAR
  );
}

// R2 — corporate, ownership, decision structure, LinkedIn people.
export async function researchCorporateAndDecisionMakers(
  input: LeadInput,
  sourceContext?: ResearchSourceContext
): Promise<string> {
  const name = input.companyName;

  return searchSonar(
    `${currentResearchWindow()}
${sourceBlock(sourceContext)}

ZADANIE R2: research struktury decyzyjnej i zmian korporacyjnych dla: ${inputLine(input)}.

Nie przepisuj danych KRS jako odkrycia Perplexity. Użyj KRS tylko jako punktu odniesienia i szukaj tego, czego KRS/strona nie pokazują.

Szukaj tematycznie:
- LinkedIn company page oraz profile osób: właściciel, zarząd, CEO/COO/CFO, dyrektor marketingu, dyrektor sprzedaży, Head of Growth, e-commerce, osoby decyzyjne
- publiczne wzmianki o zmianach zarządu, właścicielskich, C-level lub M&A z ostatnich 12 miesięcy
- oznaki złożoności decyzyjnej: grupa kapitałowa, franczyza, sieć oddziałów, spółka zależna, founder-led, zarząd wieloosobowy
- sprzedaż i marketing: czy istnieją role/zespoły sprzedażowe lub marketingowe

Wynik uporządkuj w sekcje: osoby i linki LinkedIn, struktura decyzyjna, zmiany, czego nie znaleziono. Każdy fakt musi mieć URL.`,
    SONAR_PRO
  );
}

// R3 — recent growth signals, jobs, buying intent, marketing maturity.
export async function researchGrowthAndBuyingSignals(
  input: LeadInput,
  sourceContext?: ResearchSourceContext,
  linkedinCompanyUrl?: string | null
): Promise<string> {
  const name = input.companyName;
  const linkedinJobsHint = linkedinCompanyUrl
    ? `- sprawdź oferty pracy na LinkedIn: ${linkedinCompanyUrl.replace(/\/$/, "")}/jobs/`
    : `- "${name}" site:linkedin.com/jobs OR site:pracuj.pl OR site:nofluffjobs.com OR site:rocketjobs.pl`;

  return searchSonar(
    `${currentResearchWindow()}
${sourceBlock(sourceContext)}

ZADANIE R3: research sygnałów wzrostu, aktywności i gotowości zakupowej dla: ${inputLine(input)}.

Szukaj w jednym batchu:
- finansowanie, granty, inwestycje, nowe oddziały, nowe linie produktowe/usługi, partnerstwa, nagrody, eventy, media i PR z ostatnich 12 miesięcy
${linkedinJobsHint}
- aktywne rekrutacje w marketingu, sprzedaży, e-commerce, growth, IT/automatyzacji
- korzystanie z agencji, software house, freelancerów, przetargi, zapytania ofertowe, płatne kampanie lub case studies dostawców
- sygnały modelu sprzedaży: przedstawiciele, B2B sales, kanał partnerski, e-commerce, marketplace

Nie szukaj ponownie danych kontaktowych ani social links ze strony. Wynik podziel na: wzrost/wydarzenia, rekrutacje, marketing i sprzedaż, sygnały budżetowe, brak danych. Każdy fakt musi mieć URL i datę, jeśli jest dostępna.`,
    SONAR_PRO
  );
}

// R4 — external risks and industry context.
export async function researchIndustryAndRisks(
  input: LeadInput,
  industrySlug: string,
  sourceContext?: ResearchSourceContext
): Promise<string> {
  const cacheKey = `${industrySlug}:${input.companyName.toLowerCase()}`;
  const cached = industryCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < INDUSTRY_CACHE_TTL) {
    return `[CACHE HIT: ${industrySlug}]\n${cached.data}`;
  }

  const { companyName: name } = input;
  const industryLabel = industrySlug.replace(/-/g, " ");

  const result = await searchSonar(
    `${currentResearchWindow()}
${sourceBlock(sourceContext)}

ZADANIE R4: research ryzyk zewnętrznych i kontekstu branżowego dla sektora "${industryLabel}" w Polsce, z perspektywy firmy "${name}".

Szukaj:
- najważniejsze trendy, presje konkurencyjne, konsolidacja, typowy cykl zakupowy i sposób kupowania usług/produktów w tej branży
- regulacje i zmiany prawne z ostatnich 12-18 miesięcy wpływające na branżę
- ryzyka technologiczne, automatyzacja, AI, presja cenowa
- zewnętrzne opinie o firmie poza Google Places, np. GoWork, Clutch, katalogi branżowe, media, jeśli faktycznie istnieją
- istotne konflikty między źródłami a publicznymi wzmiankami

Nie duplikuj opinii Google Places, jeśli są w zweryfikowanych źródłach. Wynik podziel na: branża, regulacje, ryzyka technologiczne, opinie zewnętrzne, brak danych. Każdy fakt musi mieć URL.`,
    SONAR_PRO
  );

  industryCache.set(cacheKey, { data: result, cachedAt: Date.now() });
  return result;
}

// ---------------------------------------------------------------------------
// Legacy exports — kept for backward compatibility during migration
// ---------------------------------------------------------------------------

export async function searchS1Firmographics(input: LeadInput): Promise<string> {
  return researchFirmographicGaps(input);
}

export async function searchS2Corporate(input: LeadInput): Promise<string> {
  return researchCorporateAndDecisionMakers(input);
}

export async function searchS3Events(input: LeadInput): Promise<string> {
  return researchGrowthAndBuyingSignals(input);
}

export async function searchS4Digital(input: LeadInput): Promise<string> {
  return researchFirmographicGaps(input);
}

export async function searchS5Industry(input: LeadInput, industrySlug: string): Promise<string> {
  return researchIndustryAndRisks(input, industrySlug);
}

export async function searchS6Intent(input: LeadInput, _s4Context: string): Promise<string> {
  return researchGrowthAndBuyingSignals(input);
}

export async function searchLinkedInEmployees(input: LeadInput): Promise<string> {
  return researchCorporateAndDecisionMakers(input);
}

export async function searchCompanyPeopleAndSocial(input: LeadInput): Promise<string> {
  const [firmographics, corporate] = await Promise.all([
    researchFirmographicGaps(input),
    researchCorporateAndDecisionMakers(input),
  ]);
  return `${firmographics}\n\n---\n\n${corporate}`;
}

export async function searchGrowthAndRisks(
  input: LeadInput,
  krsContext?: string
): Promise<string> {
  const sourceContext = krsContext ? { krs: krsContext } : undefined;
  const [growth, risks] = await Promise.all([
    researchGrowthAndBuyingSignals(input, sourceContext),
    researchIndustryAndRisks(input, "unknown", sourceContext),
  ]);
  return `${growth}\n\n---\n\n${risks}`;
}

export async function searchMarketingReadiness(input: LeadInput): Promise<string> {
  return researchGrowthAndBuyingSignals(input);
}
