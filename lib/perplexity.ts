import type { LeadInput } from "./types";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const SONAR = "sonar";
const SONAR_PRO = "sonar-pro";

// Industry cache for S5 — TTL 10 days, keyed by industrySlug
const industryCache = new Map<string, { data: string; cachedAt: number }>();
const INDUSTRY_CACHE_TTL = 10 * 24 * 60 * 60 * 1000;

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
            "Jesteś analitykiem wywiadowczym. Wykonujesz precyzyjne wyszukiwania i zwracasz TYLKO znalezione fakty z konkretnymi URL-ami źródeł. Nie wymyślaj danych. Jeśli czegoś nie znajdziesz — napisz wprost 'nie znaleziono'.",
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

// S1 — firmographics (sonar: simple facts)
export async function searchS1Firmographics(input: LeadInput): Promise<string> {
  const { companyName: name, domain, nip, krs } = input;
  const ctx = [nip && `NIP: ${nip}`, krs && `KRS: ${krs}`].filter(Boolean).join(", ");

  return searchSonar(
    `Zbierz podstawowe dane firmograficzne o "${name}" (${domain}${ctx ? `, ${ctx}` : ""}).

Wyszukaj:
- "${name}" branża specjalizacja rok założenia siedziba
- "${name}" liczba pracowników zatrudnienie zespół
- "${name}" model biznesowy przychody klienci
- "${name}" adres biura telefon dane kontaktowe
- site:${domain} "o nas" OR "o firmie" OR "kim jesteśmy"

Podaj: branżę, specjalizację, rok założenia, liczbę pracowników, model biznesowy (SaaS/jednorazowy/prowizje/produkcja itp.), adres i telefon, właściciela/udziałowców.`,
    SONAR
  );
}

// S2 — corporate structure + changes (sonar-pro: multi-step reasoning)
export async function searchS2Corporate(input: LeadInput): Promise<string> {
  const { companyName: name, nip } = input;
  const nipStr = nip ? ` NIP: ${nip}` : "";

  return searchSonar(
    `Zbierz dane o strukturze korporacyjnej i zmianach w firmie "${name}"${nipStr} (ostatnie 12 miesięcy).

Wyszukaj na: pulsbizneu.pl, rp.pl, bankier.pl, money.pl, rejestr.io:
- "${name}" zarząd prezes zmiany odwołanie powołanie 2024 2025
- "${name}" właściciel udziały sprzedaż zmiana struktura własnościowa 2024 2025
- "${name}" fuzja przejęcie akwizycja wykup 2024 2025
- "${name}" dyrektor sprzedaży dyrektor marketingu zmiana 2024 2025
- "${name}" struktura firmy franczyza korporacja spółka giełdowa niezależna

Podaj: typ struktury (niezależna/franczyza/korporacja/giełdowa), zmiany w zarządzie, zmiany własnościowe, zmiany na stanowiskach C-level.`,
    SONAR_PRO
  );
}

// S3 — current events + market signals (sonar-pro: needs recent data)
export async function searchS3Events(input: LeadInput): Promise<string> {
  const { companyName: name, domain } = input;

  return searchSonar(
    `Zbierz bieżące sygnały rynkowe i wydarzenia dla firmy "${name}" (${domain}) z ostatnich 6–12 miesięcy.

Wyszukaj (filtr czasowy: 2024–2025):
- "${name}" dofinansowanie grant inwestycja pozyskanie kapitału 2024 2025
- "${name}" nowy oddział nowa linia produktowa expansion 2024 2025
- "${name}" targi konferencja event wystąpienie nagroda 2024 2025
- "${name}" prasa media wywiad artykuł wzmianka PR 2024 2025
- "${name}" nowa strona rebrand logo zmiana identyfikacji 2024 2025
- "${name}" współpraca partnerstwo ambasador influencer 2024 2025

Dla każdego znalezionego wydarzenia podaj: opis, datę (jeśli dostępna), URL źródła.`,
    SONAR_PRO
  );
}

// S4 — digital presence (sonar: simple URL lookups)
export async function searchS4Digital(input: LeadInput): Promise<string> {
  const { companyName: name, domain } = input;

  return searchSonar(
    `Znajdź profile cyfrowe i social media firmy "${name}" (${domain}).

Wykonaj osobne wyszukiwania:
- "${name}" site:linkedin.com/company — pełny URL profilu LinkedIn
- "${name}" site:facebook.com — pełny URL profilu Facebook
- "${name}" site:instagram.com — pełny URL profilu Instagram
- "${name}" site:youtube.com — pełny URL kanału YouTube
- "${name}" site:tiktok.com — pełny URL TikTok
- "${name}" site:twitter.com OR site:x.com — URL Twitter/X
- "${name}" Google Maps wizytówka — URL wizytówki Google Business
- ${domain} WHOIS data rejestracji domeny właściciel
- "${name}" site:clutch.co OR site:g2.com OR site:capterra.com — jeśli branża IT/agencja

Dla każdej platformy: jeśli znalazłeś — pełny URL. Jeśli nie — "brak".`,
    SONAR
  );
}

// S5 — industry context (sonar-pro + industry cache)
export async function searchS5Industry(
  input: LeadInput,
  industrySlug: string
): Promise<string> {
  // Cache check — industry data is company-independent
  const cacheKey = industrySlug;
  const cached = industryCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < INDUSTRY_CACHE_TTL) {
    return `[CACHE HIT: ${industrySlug}]\n${cached.data}`;
  }

  const { companyName: name } = input;
  const industryLabel = industrySlug.replace(/-/g, " ");

  const result = await searchSonar(
    `Zbierz kontekst rynkowy i branżowy dla sektora "${industryLabel}" w Polsce (perspektywa firmy "${name}").

Wyszukaj:
- Branża "${industryLabel}" Polska 2024 2025 konkurencja rynek podmioty
- Regulacje prawne projekty ustaw zmiany przepisów wpływające na "${industryLabel}" 2024 2025
- Zagrożenia technologiczne AI automatyzacja dla sektora "${industryLabel}"
- Standardowy czas i proces zakupowy w branży "${industryLabel}"
- Trendy wzrost stagnacja konsolidacja rynek "${industryLabel}" Polska 2024 2025

Podaj: poziom konkurencji i rozdrobnienie rynku, kluczowe regulacje, zagrożenia technologiczne, typowy cykl zakupowy, ogólną koniunkturę w branży.`,
    SONAR_PRO
  );

  // Store in cache
  industryCache.set(cacheKey, { data: result, cachedAt: Date.now() });
  return result;
}

// S6 — purchase intent + budget signals (sonar, uses S4 context for LinkedIn jobs)
export async function searchS6Intent(
  input: LeadInput,
  s4Context: string
): Promise<string> {
  const { companyName: name, domain } = input;

  // Extract LinkedIn company URL from S4 if available
  const linkedinMatch = s4Context.match(/linkedin\.com\/company\/[\w-]+/);
  const linkedinUrl = linkedinMatch ? `https://www.${linkedinMatch[0]}` : null;
  const jobsHint = linkedinUrl
    ? `Sprawdź oferty pracy na: ${linkedinUrl}/jobs/`
    : `"${name}" site:pracuj.pl OR site:linkedin.com/jobs OR site:nofluffjobs.com`;

  return searchSonar(
    `Zbierz sygnały intencji zakupowej i budżetu dla firmy "${name}" (${domain}).

Wyszukaj:
- ${jobsHint} — jakich stanowisk szukają (sygnał kierunku inwestycji)
- "${name}" "specjalista marketingu" OR "marketing manager" OR "CMO" OR "SEM" OR "SEO" — rozmiar i skład zespołu marketingu
- "${name}" agencja marketingowa obsługuje współpracuje — korzystanie z agencji zewnętrznych
- "${name}" przedstawiciel handlowy sprzedaż B2B sales team — model sprzedaży
- "${name}" przetarg zapytanie ofertowe "szukamy agencji" ogłoszenie 2024 2025
- "${name}" budżet marketingowy reklamowy inwestycja 2024 2025

Podaj: otwarte wakaty (jakie role — sygnał gdzie inwestują), wielkość zespołu marketingu, model sprzedaży (przedstawiciele/digital), historia korzystania z agencji/freelancerów, sygnały budżetowe.`,
    SONAR
  );
}

// ---------------------------------------------------------------------------
// Legacy exports — kept for backward compatibility during migration
// ---------------------------------------------------------------------------

export async function searchCompanyPeopleAndSocial(input: LeadInput): Promise<string> {
  const [s1, s4] = await Promise.all([searchS1Firmographics(input), searchS4Digital(input)]);
  return `${s1}\n\n---\n\n${s4}`;
}

export async function searchGrowthAndRisks(
  input: LeadInput,
  _krsContext?: string
): Promise<string> {
  return searchS3Events(input);
}

export async function searchMarketingReadiness(input: LeadInput): Promise<string> {
  return searchS6Intent(input, "");
}
