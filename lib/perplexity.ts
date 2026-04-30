const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const MODEL = "sonar-pro";

export async function askPerplexityTable(prompt: string): Promise<string> {
  const result = await askPerplexityTableWithDebug(prompt);
  return result.content;
}

export async function askPerplexityTableWithDebug(
  prompt: string
): Promise<{ content: string; request: unknown; response: unknown }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY not set");

  const request = {
    model: MODEL,
    web_search_options: { search_context_size: "high" },
    messages: [
      {
        role: "system",
        content:
          "Odpowiadasz wyłącznie tabelą Markdown. Bez wstępu, komentarzy, podsumowań i tekstu poza tabelą. Jeśli nie znajdziesz wartości, wpisz 'nie znaleziono'.",
      },
      { role: "user", content: prompt },
    ],
  };

  const res = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60000),
  });

  const rawText = await res.text();
  const data = parseJsonOrRawText(rawText);

  if (!res.ok) {
    throw new Error(`Perplexity error ${res.status}: ${JSON.stringify(data)}`);
  }

  return {
    content: String((data as PerplexityResponse)?.choices?.[0]?.message?.content ?? "").trim(),
    request,
    response: data,
  };
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

export function buildRegistryPrompt(nip: string): string {
  return `NIP firmy: ${nip}, podaj Nazwę, KRS, adres, formę prawną, kapitał zakładowy, datę rejestracji i główną działalność. W tabeli, bez dodatkowego komentarza.
Tabela musi mieć dokładnie kolumny: Nazwa | KRS | Adres | Forma prawna | Kapitał zakładowy | Data rejestracji | Główna działalność.`;
}

export function buildDigitalPresencePrompt(
  nip: string,
  context?: { officialWebsite?: string | null; krs?: string }
): string {
  const brandName = context?.officialWebsite ? deriveBrandName("", context.officialWebsite) : "";
  const websiteLine = context?.officialWebsite
    ? `Oficjalna strona ustalona w pierwszym kroku: ${context.officialWebsite}.`
    : "Jeśli znajdziesz oficjalną stronę, użyj jej jako punktu odniesienia.";
  const registryLine = [
    `NIP: ${nip}`,
    context?.krs && `KRS: ${context.krs}`,
  ]
    .filter(Boolean)
    .join(", ");
  const brandSearchLine = brandName
    ? `Dodatkowo sprawdź wariant domenowy/brandowy wynikający z oficjalnej strony: "${brandName}".`
    : "Jeśli nie masz oficjalnej domeny, oprzyj wyszukiwanie na NIP.";

  return `NIP firmy: ${nip} - poszukaj strony internetowej i linków do social mediów tej firmy.
${websiteLine}
${registryLine ? `${registryLine}.` : ""}

Wykonaj osobne wyszukiwania dla identyfikatora NIP: "${nip}" oraz domeny z oficjalnej strony.
${brandSearchLine}
Nie ograniczaj się do wyników z oficjalnej strony. Sprawdź zewnętrzne platformy, szczególnie:
- site:facebook.com "${nip}"
- site:instagram.com "${nip}"
- site:linkedin.com/company "${nip}"
- site:youtube.com "${nip}"
- site:tiktok.com "${nip}"
- site:x.com OR site:twitter.com "${nip}"

Przygotuj tabelę Markdown z kolumnami dokładnie:
Platforma | Adres | Liczba followersów / Dodatkowe informacje

Zasady:
- W kolumnie Adres podawaj pełny URL, jeśli został znaleziony.
- Dla strony internetowej podaj oficjalny URL.
- Dla social mediów podaj tylko profile tej konkretnej firmy, nie artykuły i nie prywatne profile pracowników.
- Dla każdego znalezionego profilu social media spróbuj ustalić publicznie widoczną liczbę followersów / obserwujących / polubień / subskrybentów. Wpisz ją w kolumnie "Liczba followersów / Dodatkowe informacje" razem ze źródłem lub krótką informacją, np. "ok. 500 followersów", "1,2 tys. obserwujących", "liczba followersów niewidoczna".
- Jeśli profil jest znaleziony, nie wpisuj w tej kolumnie samego "nie znaleziono"; wpisz przynajmniej "profil znaleziony, liczba followersów niewidoczna".
- Jeśli liczba followersów nie jest publicznie dostępna, wpisz "profil znaleziony, liczba followersów niewidoczna".
- Jeśli platformy nie znajdziesz, możesz ją pominąć zamiast dodawać pusty wiersz.
- Zwróć tylko tabelę, bez dodatkowego komentarza.`;
}

function deriveBrandName(companyName: string, officialWebsite?: string | null): string {
  if (officialWebsite) {
    try {
      const host = new URL(officialWebsite).hostname.replace(/^www\./, "");
      const base = host.split(".").slice(0, -1).join(".");
      if (base) return titleCaseBrand(base);
    } catch {
      // Fall back to company name cleanup.
    }
  }

  const cleaned = companyName
    .replace(/spółka z ograniczoną odpowiedzialnością/gi, "")
    .replace(/sp\.?\s*z\s*o\.?o\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return titleCaseBrand(cleaned || companyName);
}

function titleCaseBrand(value: string): string {
  return value
    .split(/(\s+|-)/)
    .map((part) => {
      if (/^\s+$|^-$/.test(part)) return part;
      if (part.includes(".")) {
        return part
          .split(".")
          .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
          .join(".");
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}
