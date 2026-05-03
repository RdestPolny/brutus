const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const MODEL = "sonar-pro";
const REQUEST_TIMEOUT = 60000;
const MAX_RETRIES = 2;

export async function askPerplexityTable(prompt: string): Promise<string> {
  const result = await askPerplexityTableWithDebug(prompt);
  return result.content;
}

export async function askPerplexityTableWithDebug(
  prompt: string,
  retryCount = 0
): Promise<{ content: string; request: unknown; response: unknown }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY not set");

  const request = {
    model: MODEL,
    web_search_options: {
      search_context_size: "high",
      search_recency_filter: "month" // Priorytet dla świeżych danych
    },
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(),
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2, // Niższa temperatura dla bardziej deterministycznych odpowiedzi
    max_tokens: 2000,
  };

  try {
    const res = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    const rawText = await res.text();
    const data = parseJsonOrRawText(rawText);

    if (!res.ok) {
      throw new Error(`Perplexity error ${res.status}: ${JSON.stringify(data)}`);
    }

    const content = String(
      (data as PerplexityResponse)?.choices?.[0]?.message?.content ?? ""
    ).trim();

    // Walidacja czy odpowiedź zawiera tabelę
    if (!isValidTableResponse(content)) {
      if (retryCount < MAX_RETRIES) {
        console.warn(`Invalid table response, retrying (${retryCount + 1}/${MAX_RETRIES})`);
        return askPerplexityTableWithDebug(prompt, retryCount + 1);
      }
      throw new Error("Response does not contain a valid Markdown table");
    }

    return {
      content,
      request,
      response: data,
    };
  } catch (error) {
    if (retryCount < MAX_RETRIES && error instanceof Error && error.name !== 'AbortError') {
      console.warn(`Request failed, retrying (${retryCount + 1}/${MAX_RETRIES}):`, error.message);
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
      return askPerplexityTableWithDebug(prompt, retryCount + 1);
    }
    throw error;
  }
}

interface PerplexityResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function parseJsonOrRawText(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    return { rawText };
  }
}

function buildSystemPrompt(): string {
  return `Jesteś specjalistycznym asystentem do weryfikacji informacji o firmach.

KRYTYCZNE ZASADY:
1. Odpowiadasz WYŁĄCZNIE tabelą Markdown
2. Tabela MUSI zaczynać się od nagłówka (|Kolumna1|Kolumna2|...|)
3. NIE dodawaj żadnego tekstu przed ani po tabeli
4. NIE używaj słów "oto", "tabela", "wyniki" ani żadnych komentarzy
5. Jeśli nie znaleziono danych, wpisz "nie znaleziono" w komórce
6. Używaj dokładnie takich nazw kolumn, jak w zapytaniu
7. Zachowaj spójne formatowanie (wyrównanie, separatory)

WYSZUKIWANIE:
- Używaj precyzyjnych zapytań: NIP, KRS, nazwa firmy
- Weryfikuj informacje z oficjalnych źródeł: GUS, KRS, CEIDG
- Dla social media sprawdzaj oficjalne profile firmy, nie artykuły o niej
- Weryfikuj liczby followersów tylko jeśli są publicznie widoczne`;
}

function isValidTableResponse(content: string): boolean {
  // Sprawdza czy odpowiedź zawiera poprawną tabelę Markdown
  const lines = content.trim().split('\n');
  if (lines.length < 2) return false;

  // Pierwsza linia to nagłówek (musi zawierać |)
  const hasHeader = lines[0].includes('|');
  // Druga linia to separator (musi zawierać | i -)
  const hasSeparator = lines[1].includes('|') && lines[1].includes('-');

  return hasHeader && hasSeparator;
}

export function buildRegistryPrompt(nip: string): string {
  return `NIP: ${nip}

Wyszukaj w oficjalnych rejestrach (KRS, CEIDG, GUS) i zwróć tabelę z kolumnami:
Nazwa | KRS | Adres | Forma prawna | Kapitał zakładowy | Data rejestracji | Główna działalność

Dla każdej kolumny:
- Nazwa: pełna nazwa firmy z rejestru
- KRS: numer KRS (jeśli dotyczy) lub "nie dotyczy" dla jednoosobowych działalności
- Adres: pełny adres siedziby (ulica, kod, miasto)
- Forma prawna: np. Sp. z o.o., jednoosobowa działalność gospodarcza, SA
- Kapitał zakładowy: kwota w PLN lub "nie dotyczy"
- Data rejestracji: format DD.MM.RRRR
- Główna działalność: PKD + krótki opis (max 60 znaków)

Priorytet wiarygodności: rejestr.io > biznes.gov.pl > KRS > lokalne rejestry`;
}

export function buildDigitalPresencePrompt(
  nip: string,
  context?: {
    officialWebsite?: string | null;
    krs?: string;
    companyName?: string;
  }
): string {
  const searchTerms = buildSearchTerms(nip, context);

  return `Firma: NIP ${nip}${context?.krs ? `, KRS ${context.krs}` : ''}${context?.companyName ? `, ${context.companyName}` : ''}
${context?.officialWebsite ? `Oficjalna strona: ${context.officialWebsite}` : ''}

Znajdź oficjalne profile firmy i zwróć tabelę:
Platforma | Adres URL | Metryki

Platformy do sprawdzenia:
- Strona WWW (jeśli nie podana wcześniej)
- Facebook (facebook.com)
- Instagram (instagram.com)
- LinkedIn (linkedin.com/company)
- YouTube (youtube.com)
- TikTok (tiktok.com)
- X/Twitter (x.com lub twitter.com)

WYSZUKIWANIE - użyj tych zapytań:
${searchTerms.map(term => `- "${term}"`).join('\n')}

WALIDACJA PROFILI:
- Potwierdź, że profil należy do firmy (sprawdź opis, About, info)
- NIE uwzględniaj profili prywatnych pracowników
- NIE uwzględniaj artykułów/postów o firmie

METRYKI (kolumna "Metryki"):
- Dla social media: liczba followersów/obserwujących jeśli widoczna publicznie
- Format: np. "1,2K obserwujących", "350 followersów", "5K subskrybentów"
- Jeśli profil istnieje ale liczba ukryta: "profil aktywny, metryki niepubliczne"
- Dla strony WWW: data ostatniej aktualizacji lub "aktywna" jeśli świeża

Jeśli platformy nie ma, pomiń wiersz całkowicie.`;
}

function buildSearchTerms(
  nip: string,
  context?: {
    officialWebsite?: string | null;
    krs?: string;
    companyName?: string;
  }
): string[] {
  const terms: string[] = [nip];

  if (context?.krs) {
    terms.push(`KRS ${context.krs}`);
  }

  if (context?.officialWebsite) {
    const domain = extractDomain(context.officialWebsite);
    if (domain) {
      terms.push(domain);
      // Dodaj wariant bez TLD
      const brandName = domain.split('.')[0];
      if (brandName && brandName !== domain) {
        terms.push(brandName);
      }
    }
  }

  if (context?.companyName) {
    const cleanName = cleanCompanyName(context.companyName);
    if (cleanName && !terms.includes(cleanName)) {
      terms.push(cleanName);
    }
  }

  return [...new Set(terms)]; // Usuń duplikaty
}

function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname;
  } catch {
    return null;
  }
}

function cleanCompanyName(name: string): string {
  return name
    .replace(/spółka z ograniczoną odpowiedzialnością/gi, '')
    .replace(/sp\.?\s*z\s*o\.?o\.?/gi, '')
    .replace(/s\.?\s*a\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Dodatkowe funkcje pomocnicze dla bardziej zaawansowanego użycia

export function buildFinancialPrompt(nip: string, context?: { krs?: string }): string {
  return `NIP: ${nip}${context?.krs ? `, KRS ${context.krs}` : ''}

Znajdź dane finansowe z ostatnich 3 lat i zwróć tabelę:
Rok | Przychody | Zysk/Strata netto | Aktywa | Zatrudnienie

Źródła:
- Opublikowane sprawozdania finansowe (KRS, EMIS)
- Informacje GUS
- Dane z Monitora Sądowego i Gospodarczego

Dla każdej pozycji podaj wartość lub "brak danych". Format liczb: "12,5 mln PLN" lub "brak danych".`;
}

export function buildReputationPrompt(
  nip: string,
  context?: {
    companyName?: string;
    officialWebsite?: string | null;
  }
): string {
  const searchName = context?.companyName || `firma NIP ${nip}`;

  return `Firma: ${searchName}${context?.officialWebsite ? ` (${context.officialWebsite})` : ''}

Sprawdź reputację online i zwróć tabelę:
Źródło | Ocena/Informacja | Link

Sprawdź:
- Google Reviews/Opinie (wyszukaj "${searchName} opinie")
- Pinger.pl, Opineo.pl (polskie platformy opinii B2B)
- Ceneo.pl (jeśli e-commerce)
- Skarga.pl, Sprawdzonych.pl (skargi konsumenckie)
- Artykuły prasowe (pozytywne i negatywne)

Dla każdego źródła:
- Ocena: np. "4.2/5 (120 opinii)", "brak negatywnych informacji", "10 skarg"
- Jeśli nie znaleziono: pomiń wiersz
- Max 5 najważniejszych wyników`;
}

export function buildLegalPrompt(nip: string, context?: { krs?: string }): string {
  return `NIP: ${nip}${context?.krs ? `, KRS ${context.krs}` : ''}

Sprawdź postępowania prawne i zwróć tabelę:
Typ postępowania | Status | Wartość/Opis | Data | Źródło

Sprawdź:
- Postępowania sądowe (orzeczenia.ms.gov.pl)
- Postępowania upadłościowe/restrukturyzacyjne
- Wpisy w Krajowym Rejestrze Długów
- Egzekucje komornicze (licytacje.komornik.pl)

Jeśli nie znaleziono żadnych postępowań, zwróć tabelę z jednym wierszem:
Typ postępowania | Status | Wartość/Opis | Data | Źródło
Brak | Nie wykryto aktywnych postępowań | - | - | Sprawdzono rejestry publiczne`;
}
