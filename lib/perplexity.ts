import type { LeadInput } from "./types";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const MODEL = "sonar-pro";

async function searchSonar(query: string): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY not set");

  const res = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Jesteś analitykiem wywiadowczym. Wykonujesz precyzyjne wyszukiwania i zwracasz TYLKO znalezione fakty z konkretnymi URL-ami źródeł. Nie wymyślaj danych. Jeśli czegoś nie znajdziesz — napisz wprost 'nie znaleziono'.",
        },
        { role: "user", content: query },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Perplexity error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content as string;
}

export async function searchCompanyPeopleAndSocial(input: LeadInput): Promise<string> {
  const name = input.companyName;
  const domain = input.domain;
  const nipStr = input.nip ? `, NIP: ${input.nip}` : "";
  const krsStr = input.krs ? `, KRS: ${input.krs}` : "";

  return searchSonar(`Zbierz kompleksowe dane o firmie "${name}" (strona: ${domain}${nipStr}${krsStr}).

CZĘŚĆ 1 — DANE FIRMY:
Wykonaj wyszukiwania:
- "${name}" historia założenie rok siedziba właściciel${nipStr}
- site:${domain} "o nas" OR "o firmie" OR "kim jesteśmy" OR "historia"
- "${name}" pracownicy zatrudnienie liczba zespół

Podaj: branżę i specjalizację, rok założenia, liczbę pracowników, strukturę właścicielską, model biznesowy, adres i telefon.

CZĘŚĆ 2 — SOCIAL MEDIA (wykonaj osobne wyszukiwanie dla każdego):
- "${name}" site:linkedin.com/company — podaj pełny URL profilu firmowego LinkedIn
- "${name}" site:facebook.com — podaj pełny URL profilu Facebook
- "${name}" site:instagram.com — podaj pełny URL profilu Instagram
- "${name}" site:youtube.com — podaj pełny URL kanału YouTube
- "${name}" site:twitter.com OR site:x.com — podaj pełny URL profilu Twitter/X
- "${name}" site:tiktok.com — podaj pełny URL profilu TikTok
- "${name}" Google Maps wizytówka — podaj pełny URL wizytówki

Dla każdej platformy: jeśli znalazłeś profil — podaj URL. Jeśli nie — napisz "brak".

CZĘŚĆ 3 — KLUCZOWI PRACOWNICY (wykonaj WSZYSTKIE wyszukiwania):
- site:linkedin.com/in "${name}" (CEO OR prezes OR właściciel OR founder OR "Managing Director")
- site:linkedin.com/in "${name}" ("dyrektor marketingu" OR CMO OR "Head of Marketing" OR "marketing director")
- site:linkedin.com/in "${name}" ("dyrektor sprzedaży" OR "Head of Sales" OR "Sales Director" OR "VP Sales")
- "${name}" LinkedIn zarząd kadra kierownicza management team

Dla każdej znalezionej osoby podaj: pełne imię i nazwisko, stanowisko, URL profilu LinkedIn.`);
}

export async function searchGrowthAndRisks(
  input: LeadInput,
  krsContext?: string
): Promise<string> {
  const name = input.companyName;
  const domain = input.domain;
  const nipStr = input.nip ? ` NIP: ${input.nip}` : "";
  const krsBlock = krsContext
    ? `\nDANE Z KRS (zweryfikowane, użyj jako podstawy dla finansów):\n${krsContext}\n`
    : "";
  const finSource = krsContext
    ? "— dane z KRS powyżej mają priorytet; z internetu uzupełnij tylko brakujące lata"
    : "— szukaj na: ekrs.ms.gov.pl, rejestr.io, infoveriti.pl";

  return searchSonar(`Zbierz sygnały wzrostu, dane finansowe i ryzyka dla firmy "${name}" (${domain}${nipStr}).
${krsBlock}
CZĘŚĆ 1 — SYGNAŁY WZROSTU (lata 2023–2025):
- "${name}" 2024 2025 ekspansja nowy oddział inwestycja dofinansowanie grant przejęcie fuzja
- "${name}" 2024 2025 nowy produkt nowa usługa linia biznesowa partnerstwo współpraca
- "${name}" targi konferencja event wystąpienie nagroda wyróżnienie 2023 2024 2025
- "${name}" site:pracuj.pl OR site:linkedin.com/jobs OR site:nofluffjobs.com — otwarte oferty pracy (jakie stanowiska)
- "${name}" 2024 2025 wywiad artykuł prasa media wzmianki

CZĘŚĆ 2 — DANE FINANSOWE (lata 2021–2024) ${finSource}:
- "${name}"${nipStr} sprawozdanie finansowe przychody zysk strata 2022 2023 2024
- "${name}" wyniki finansowe roczne bilans 2023 2024
Podaj za każdy znaleziony rok: przychody ogółem, zysk/strata netto, zobowiązania ogółem.

CZĘŚĆ 3 — ZMIANY ZARZĄDU I WŁASNOŚCI:
- "${name}" zarząd prezes zmiany odwołanie powołanie 2022 2023 2024 2025
- "${name}" właściciel udziały sprzedaż zmiana struktura własnościowa 2022 2023 2024 2025

CZĘŚĆ 4 — OPINIE I RYZYKO:
- "${name}" site:gowork.pl — ocena gwiazdki i powtarzające się skargi pracowników
- "${name}" site:clutch.co — ocena i opinie klientów B2B
- "${name}" opinie Google Maps — ocena i główne skargi
- "${name}" zwolnienia restrukturyzacja problemy kary UOKiK kontrowersje 2023 2024 2025`);
}

export async function searchMarketingReadiness(input: LeadInput): Promise<string> {
  const name = input.companyName;
  const domain = input.domain;

  return searchSonar(`Oceń aktywność marketingową i gotowość zakupową firmy "${name}" (${domain}).

CZĘŚĆ 1 — REKLAMY PŁATNE:
- "${name}" reklama Google Ads kampania PPC
- "${name}" Facebook reklama Meta Ads Instagram kampania
- "${name}" agencja marketingowa współpraca obsługuje marketing
Sprawdź też bibliotekę reklam Meta pod kątem reklam firmy "${name}".

CZĘŚĆ 2 — CONTENT I WIDOCZNOŚĆ:
- site:${domain} blog OR artykuł OR poradnik OR "case study" — ile treści na stronie
- "${name}" blog wpis artykuł content 2024 2025 — aktywność contentowa
- Opisz ogólną jakość i aktualność strony ${domain}: wygląd, treść, kiedy aktualizowana

CZĘŚĆ 3 — SYGNAŁY ZAKUPU:
- "${name}" "specjalista ds. marketingu" OR "marketing manager" OR "SEM" OR "SEO" OR "content" site:pracuj.pl OR site:linkedin.com/jobs — rekrutacja w marketingu
- "${name}" rebrand "nowa strona" rebranding 2024 2025 — inwestycje w markę
- "${name}" "szukamy agencji" OR "przetarg" OR "zapytanie ofertowe" marketing

Na podstawie zebranych danych napisz ocenę: czy firma inwestuje w marketing, czy ma wewnętrzny zespół czy korzysta z agencji, jaki poziom dojrzałości marketingowej.`);
}
