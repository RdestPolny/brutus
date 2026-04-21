import type {
  LeadInput,
  CompanyProfile,
  GrowthSection,
  RiskSection,
  DecisionStructure,
  BuyingReadiness,
  RecommendedQuestions,
} from "./types";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const MODEL = "sonar-pro";

const SYSTEM_PROMPT = `Jesteś analitykiem wywiadu sprzedażowego dla polskich firm B2B. Wykonujesz konkretne wyszukiwania w sieci i zwracasz TYLKO potwierdzone fakty z cytatami źródeł.

ZASADY:
- Odpowiadaj WYŁĄCZNIE w formacie JSON zgodnym ze schematem
- status "confirmed" = znalazłeś bezpośredni dowód z URL; "inferred" = logiczny wniosek; "missing" = nie znaleziono mimo szukania
- NIE WYMYŚLAJ danych, URL-i ani nazwisk — użyj status "missing" jeśli brak
- Gdy prompt zawiera konkretne zapytania do wyszukania — wykonaj JE WSZYSTKIE przed odpowiedzią
- Skup się na danych z 2022–2025 chyba że pytanie dotyczy historii firmy`;

async function callSonar<T>(prompt: string, schema: object): Promise<T> {
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
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_schema", json_schema: { schema } },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Perplexity API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content) as T;
}

function field<T = string>(description: string, type = "string", extra: object = {}) {
  return {
    type: "object",
    properties: {
      value: { type, description, ...extra },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      status: { type: "string", enum: ["confirmed", "inferred", "missing", "conflicting"] },
      source_urls: { type: "array", items: { type: "string" } },
      evidence_excerpt: { type: "string" },
    },
    required: ["value", "confidence", "status", "source_urls", "evidence_excerpt"],
  };
}

export async function fetchCompanyProfile(input: LeadInput): Promise<CompanyProfile> {
  const id = `"${input.companyName}"`;
  const nipLine = input.nip ? ` NIP: ${input.nip}` : "";
  const krsLine = input.krs ? ` KRS: ${input.krs}` : "";

  const prompt = `Zbierz dane firmograficzne dla firmy ${id}, strona: ${input.domain}${nipLine}${krsLine}.

Wykonaj kolejno następujące wyszukiwania:
1. ${id} historia założenie siedziba właściciel${nipLine} — rok założenia, forma prawna, adres rejestrowy
2. site:${input.domain} "o nas" OR "o firmie" OR "kim jesteśmy" OR "historia" — opis firmy ze strony
3. ${id} "liczba pracowników" OR "zatrudniamy" OR "nasz zespół" — wielkość zespołu
4. ${id} LinkedIn Facebook Instagram YouTube TikTok — linki do profili społecznościowych
5. ${id} "Google Maps" OR "wizytówka" — adres i dane kontaktowe

Na podstawie wyników wypełnij:
- branżę i specjalizację (co konkretnie robi ta firma)
- obszar działania: local (miasto/region), national (cała Polska), international (eksport/zagranica)
- rok założenia
- liczbę pracowników lub przedział (np. "10–50")
- strukturę: independent / corporation / franchise / public
- model biznesowy: SaaS / one-time / commission / production / services
- adres siedziby i numer telefonu
- datę rejestracji domeny i właściciela (whois)
- listę URL-i profili social media (tylko znalezione)
- link do Google Maps (tylko jeśli znaleziony)

Napisz podsumowanie 4–6 zdań: czym się firma zajmuje, na jakim etapie jest i jak zarabia.`;

  const schema = {
    type: "object",
    properties: {
      industry: field("Branża firmy"),
      specialization: field("Specjalizacja lub nisza"),
      market_scope: {
        ...field("Obszar działania"),
        properties: {
          ...field("Obszar działania").properties,
          value: { type: "string", enum: ["local", "national", "international"] },
        },
      },
      founded_year: {
        type: "object",
        properties: {
          value: { type: "number" },
          confidence: { type: "number" },
          status: { type: "string", enum: ["confirmed", "inferred", "missing", "conflicting"] },
          source_urls: { type: "array", items: { type: "string" } },
          evidence_excerpt: { type: "string" },
        },
        required: ["value", "confidence", "status", "source_urls", "evidence_excerpt"],
      },
      employee_count: field("Liczba pracowników lub przedział"),
      company_structure: field("Struktura firmy"),
      business_model: field("Model biznesowy"),
      contact_address: field("Adres biura i telefon"),
      website_domain_registered: field("Data rejestracji domeny i właściciel"),
      social_links: {
        type: "object",
        properties: {
          value: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          status: { type: "string", enum: ["confirmed", "inferred", "missing", "conflicting"] },
          source_urls: { type: "array", items: { type: "string" } },
          evidence_excerpt: { type: "string" },
        },
        required: ["value", "confidence", "status", "source_urls", "evidence_excerpt"],
      },
      google_maps_link: field("Link do wizytówki Google Maps"),
      summary: { type: "string" },
    },
    required: [
      "industry", "specialization", "market_scope", "founded_year",
      "employee_count", "company_structure", "business_model",
      "contact_address", "website_domain_registered", "social_links",
      "google_maps_link", "summary",
    ],
  };

  return callSonar<CompanyProfile>(prompt, schema);
}

export async function fetchGrowthSignals(input: LeadInput): Promise<GrowthSection> {
  const id = `"${input.companyName}"`;

  const prompt = `Znajdź sygnały wzrostu firmy ${id} (${input.domain}) — skup się na wydarzeniach z lat 2023–2025.

Wykonaj kolejno następujące wyszukiwania:
1. ${id} 2024 2025 ekspansja nowy oddział inwestycja dofinansowanie przejęcie — inwestycje i ekspansja
2. ${id} 2024 2025 nowy produkt nowa usługa linia partnerstwo współpraca — nowe produkty i partnerstwa
3. ${id} targi konferencja event wystąpienie nagroda wyróżnienie — aktywność PR i eventowa
4. ${id} site:pracuj.pl OR site:linkedin.com/jobs OR site:nofluffjobs.com — otwarte rekrutacje (jakie stanowiska)
5. ${id} 2024 2025 wywiad artykuł prasa media wzmianki — artykuły i wzmianki medialne
6. ${id} influencer ambasador marka kampania reklamowa — współprace marketingowe

Dla każdego sygnału podaj: typ, opis, datę (jeśli znana) i URL źródła. Ocen relevance (high/medium/low) dla potencjalnego klienta B2B.`;

  const schema = {
    type: "object",
    properties: {
      signals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            description: { type: "string" },
            date: { type: "string" },
            source_url: { type: "string" },
            relevance: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["type", "description", "date", "source_url", "relevance"],
        },
      },
      recent_events: { type: "array", items: { type: "string" } },
      open_vacancies: {
        type: "object",
        properties: {
          value: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          status: { type: "string", enum: ["confirmed", "inferred", "missing", "conflicting"] },
          source_urls: { type: "array", items: { type: "string" } },
          evidence_excerpt: { type: "string" },
        },
        required: ["value", "confidence", "status", "source_urls", "evidence_excerpt"],
      },
      pr_mentions: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
    },
    required: ["signals", "recent_events", "open_vacancies", "pr_mentions", "summary"],
  };

  return callSonar<GrowthSection>(prompt, schema);
}

export async function fetchRiskSignals(
  input: LeadInput,
  krsContext?: string
): Promise<RiskSection> {
  const id = `"${input.companyName}"`;
  const nipStr = input.nip ? ` NIP ${input.nip}` : "";
  const krsBlock = krsContext
    ? `\nZWERYFIKOWANE DANE Z KRS (użyj jako podstawy dla danych finansowych, uzupełnij tylko brakujące lata):\n${krsContext}\n`
    : "";
  const finSource = krsContext
    ? "— dane z KRS powyżej mają priorytet; uzupełnij brakujące lata z internetu"
    : "— szukaj na: ekrs.ms.gov.pl, rejestr.io, infoveriti.pl, biznes.gov.pl";

  const prompt = `Zbierz sygnały ryzyka i dane finansowe firmy ${id} (${input.domain}${nipStr}).
${krsBlock}
SEKCJA 1 — DANE FINANSOWE (lata 2021–2024) ${finSource}:
Wykonaj wyszukiwania:
- ${id}${nipStr} sprawozdanie finansowe przychody zysk strata 2022 2023 2024
- ${id} wyniki finansowe roczne raport 2023 2024
- ${id} przychody ze sprzedaży zadłużenie zobowiązania
Zbierz za każdy dostępny rok: przychody ogółem, zysk/strata netto, zobowiązania ogółem. Oceń trend (growing/stable/declining).

SEKCJA 2 — ZMIANY ZARZĄDU I WŁASNOŚCI:
- ${id} zarząd prezes dyrektor zmiana odwołanie powołanie 2022 2023 2024 2025
- ${id} właściciel udziały sprzedaż przejęcie zmiana 2022 2023 2024 2025
- ${id} dyrektor sprzedaży dyrektor marketingu zmiana odejście 2023 2024 2025

SEKCJA 3 — OPINIE PRACOWNIKÓW I KLIENTÓW:
- ${id} site:gowork.pl — pobierz aktualną ocenę (gwiazdki) i powtarzające się skargi pracowników
- ${id} site:clutch.co — ocena i opinie klientów B2B
- ${id} site:google.com/maps OR "opinie Google" — ogólna ocena i skargi

SEKCJA 4 — SYGNAŁY OPERACYJNE I PR:
- ${id} zwolnienia restrukturyzacja redukcja etatów 2023 2024 2025
- ${id} kontrowersje problemy skargi kary UOKiK pozew 2022 2023 2024 2025
- ${id} rotacja pracowników opinie zatrudnienie

Każdy sygnał ryzyka oznacz poziomem: low / medium / high.`;

  const schema = {
    type: "object",
    properties: {
      signals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            description: { type: "string" },
            level: { type: "string", enum: ["low", "medium", "high"] },
            source_url: { type: "string" },
          },
          required: ["type", "description", "level", "source_url"],
        },
      },
      financial: {
        type: "array",
        items: {
          type: "object",
          properties: {
            year: { type: "number" },
            revenue: { type: "string" },
            profit_loss: { type: "string" },
            debt: { type: "string" },
            trend: { type: "string", enum: ["growing", "stable", "declining", "unknown"] },
          },
          required: ["year", "revenue", "profit_loss", "debt", "trend"],
        },
      },
      management_changes: {
        type: "object",
        properties: {
          value: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          status: { type: "string", enum: ["confirmed", "inferred", "missing", "conflicting"] },
          source_urls: { type: "array", items: { type: "string" } },
          evidence_excerpt: { type: "string" },
        },
        required: ["value", "confidence", "status", "source_urls", "evidence_excerpt"],
      },
      reviews: {
        type: "object",
        properties: {
          google: field("Ocena i opinie w Google Maps"),
          clutch: field("Ocena i opinie na Clutch"),
          gowork: field("Ocena i opinie na Gowork"),
        },
        required: ["google", "clutch", "gowork"],
      },
      summary: { type: "string" },
    },
    required: ["signals", "financial", "management_changes", "reviews", "summary"],
  };

  return callSonar<RiskSection>(prompt, schema);
}

export async function fetchDecisionStructure(
  input: LeadInput,
  krsManagement?: string
): Promise<DecisionStructure> {
  const id = `"${input.companyName}"`;
  const krsBlock = krsManagement
    ? `\nZWERYFIKOWANY ZARZĄD Z KRS (traktuj jako potwierdzony):\n${krsManagement}\n`
    : "";
  const contactLine = input.contactName
    ? `\nOsoba kontaktowa: ${input.contactName}${input.contactTitle ? `, stanowisko: ${input.contactTitle}` : ""}. Określ jej rolę w hierarchii (owner/director/manager/specialist).`
    : "";

  const prompt = `Przeanalizuj strukturę decyzyjną i znajdź kluczowych pracowników firmy ${id} (${input.domain}).
${krsBlock}${contactLine}

KROK 1 — PROFIL FIRMY NA LINKEDIN:
Wyszukaj: site:linkedin.com/company ${id}
Znajdź oficjalny profil i liczbę pracowników widoczną na LinkedIn.

KROK 2 — ZNAJDŹ KLUCZOWE OSOBY (wykonaj WSZYSTKIE 4 wyszukiwania):
a) site:linkedin.com/in ${id} (CEO OR prezes OR właściciel OR "Managing Director" OR "founder")
b) site:linkedin.com/in ${id} ("dyrektor marketingu" OR CMO OR "Head of Marketing" OR "marketing director" OR "marketing manager")
c) site:linkedin.com/in ${id} ("dyrektor sprzedaży" OR "Head of Sales" OR "Sales Director" OR "VP Sales" OR "key account")
d) ${id} LinkedIn pracownicy zarząd — dodatkowe profile nie znalezione wyżej

Dla każdej znalezionej osoby podaj dokładnie w formacie: "Imię Nazwisko — Stanowisko — linkedin.com/in/slug"
TYLKO rzeczywiście znalezione profile z realnym URL. Jeśli brak URL, format: "Imię Nazwisko — Stanowisko".

KROK 3 — OCEŃ STRUKTURĘ ORGANIZACYJNĄ:
Na podstawie liczby pracowników, profilu LinkedIn i dostępnych danych określ:
- czy firma ma wewnętrzny dział marketingu (szacowana liczba osób)
- czy ma dział sprzedaży / model przedstawicieli handlowych
- złożoność komitetu zakupowego: simple (1-2 decydentów) / medium / complex (>5 osób)
- typ rozmówcy: owner / director / manager / specialist`;

  const boolField = () => ({
    type: "object",
    properties: {
      value: { type: "boolean" },
      confidence: { type: "number" },
      status: { type: "string", enum: ["confirmed", "inferred", "missing", "conflicting"] },
      source_urls: { type: "array", items: { type: "string" } },
      evidence_excerpt: { type: "string" },
    },
    required: ["value", "confidence", "status", "source_urls", "evidence_excerpt"],
  });

  const enumField = (values: string[]) => ({
    type: "object",
    properties: {
      value: { type: "string", enum: values },
      confidence: { type: "number" },
      status: { type: "string", enum: ["confirmed", "inferred", "missing", "conflicting"] },
      source_urls: { type: "array", items: { type: "string" } },
      evidence_excerpt: { type: "string" },
    },
    required: ["value", "confidence", "status", "source_urls", "evidence_excerpt"],
  });

  const arrField = (description: string) => ({
    type: "object",
    properties: {
      value: { type: "array", items: { type: "string" }, description },
      confidence: { type: "number" },
      status: { type: "string", enum: ["confirmed", "inferred", "missing", "conflicting"] },
      source_urls: { type: "array", items: { type: "string" } },
      evidence_excerpt: { type: "string" },
    },
    required: ["value", "confidence", "status", "source_urls", "evidence_excerpt"],
  });

  const schema = {
    type: "object",
    properties: {
      contact_role_in_hierarchy: field("Rola rozmówcy w hierarchii firmy"),
      marketing_team_size: field("Szacowany rozmiar działu marketingu"),
      has_sales_team: boolField(),
      sales_model: field("Model sprzedaży (przedstawiciele/e-commerce/direct itp)"),
      buying_committee_complexity: enumField(["simple", "medium", "complex"]),
      decision_maker_type: enumField(["owner", "director", "manager", "specialist"]),
      linkedin_company_url: field("Oficjalny URL strony firmowej na LinkedIn (linkedin.com/company/...)"),
      key_decision_makers: arrField(
        'Lista kluczowych osób w formacie "Imię Nazwisko — Stanowisko — linkedin.com/in/slug" lub "Imię Nazwisko — Stanowisko" jeśli brak URL'
      ),
      summary: { type: "string" },
    },
    required: [
      "contact_role_in_hierarchy", "marketing_team_size", "has_sales_team",
      "sales_model", "buying_committee_complexity", "decision_maker_type",
      "linkedin_company_url", "key_decision_makers", "summary",
    ],
  };

  return callSonar<DecisionStructure>(prompt, schema);
}

export async function fetchBuyingReadiness(input: LeadInput): Promise<BuyingReadiness> {
  const id = `"${input.companyName}"`;

  const prompt = `Oceń gotowość zakupową firmy ${id} (${input.domain}) na usługi marketingowe.

KROK 1 — OBECNOŚĆ REKLAMOWA:
- ${id} reklama Google Ads kampania PPC SEA — czy prowadzi płatne reklamy
- ${id} Facebook reklama Meta kampania Instagram — reklamy w social media
- ${id} agencja marketingowa współpraca obsługuje — czy korzysta z zewnętrznej agencji
- Sprawdź bibliotekę reklam Meta: wyszukaj ${id} w facebook.com/ads/library

KROK 2 — CONTENT I WIDOCZNOŚĆ ONLINE:
- site:${input.domain} blog OR artykuł OR poradnik — aktywność contentowa
- ${id} blog wpis artykuł 2024 2025 — content marketing w ostatnim roku
- Oceń stronę ${input.domain}: wygląd, aktualność, czy jest nowoczesna i profesjonalna

KROK 3 — SYGNAŁY ZAKUPOWE:
- ${id} zatrudni "specjalista ds. marketingu" OR "marketing manager" OR "SEM specialist" OR "content manager" site:pracuj.pl OR site:linkedin.com/jobs — czy szuka marketerów (= brak agencji lub plany wzrostu)
- ${id} rebrand nowa strona rebranding 2024 2025 — plany inwestycji w markę
- ${id} "szukamy agencji" OR "przetarg marketingowy" OR "zapytanie ofertowe marketing"

Na podstawie WSZYSTKICH zebranych sygnałów oceń:
- budget_signal: budgeted (wyraźne sygnały budżetu) / ad_hoc / no_budget / unknown
- urgency: immediate / short_term / long_term / unknown
- problem_awareness: high / medium / low — czy firma rozumie potrzebę profesjonalnego marketingu
- marketing_maturity: high (aktywne kampanie, blog, dobra strona) / medium / low (brak działań)
- used_similar_solution_before: czy korzystała z agencji lub SaaS marketingowego`;

  const schema = {
    type: "object",
    properties: {
      budget_signal: {
        type: "object",
        properties: {
          value: { type: "string", enum: ["budgeted", "ad_hoc", "no_budget", "unknown"] },
          confidence: { type: "number" },
          status: { type: "string", enum: ["confirmed", "inferred", "missing", "conflicting"] },
          source_urls: { type: "array", items: { type: "string" } },
          evidence_excerpt: { type: "string" },
        },
        required: ["value", "confidence", "status", "source_urls", "evidence_excerpt"],
      },
      urgency: {
        type: "object",
        properties: {
          value: { type: "string", enum: ["immediate", "short_term", "long_term", "unknown"] },
          confidence: { type: "number" },
          status: { type: "string", enum: ["confirmed", "inferred", "missing", "conflicting"] },
          source_urls: { type: "array", items: { type: "string" } },
          evidence_excerpt: { type: "string" },
        },
        required: ["value", "confidence", "status", "source_urls", "evidence_excerpt"],
      },
      problem_awareness: {
        type: "object",
        properties: {
          value: { type: "string", enum: ["high", "medium", "low"] },
          confidence: { type: "number" },
          status: { type: "string", enum: ["confirmed", "inferred", "missing", "conflicting"] },
          source_urls: { type: "array", items: { type: "string" } },
          evidence_excerpt: { type: "string" },
        },
        required: ["value", "confidence", "status", "source_urls", "evidence_excerpt"],
      },
      marketing_maturity: {
        type: "object",
        properties: {
          value: { type: "string", enum: ["high", "medium", "low"] },
          confidence: { type: "number" },
          status: { type: "string", enum: ["confirmed", "inferred", "missing", "conflicting"] },
          source_urls: { type: "array", items: { type: "string" } },
          evidence_excerpt: { type: "string" },
        },
        required: ["value", "confidence", "status", "source_urls", "evidence_excerpt"],
      },
      used_similar_solution_before: {
        type: "object",
        properties: {
          value: { type: "boolean" },
          confidence: { type: "number" },
          status: { type: "string", enum: ["confirmed", "inferred", "missing", "conflicting"] },
          source_urls: { type: "array", items: { type: "string" } },
          evidence_excerpt: { type: "string" },
        },
        required: ["value", "confidence", "status", "source_urls", "evidence_excerpt"],
      },
      summary: { type: "string" },
    },
    required: [
      "budget_signal", "urgency", "problem_awareness",
      "marketing_maturity", "used_similar_solution_before", "summary",
    ],
  };

  return callSonar<BuyingReadiness>(prompt, schema);
}

export async function fetchRecommendedQuestions(
  input: LeadInput,
  context: string
): Promise<RecommendedQuestions> {
  const prompt = `Na podstawie zebranych danych o firmie "${input.companyName}" przygotuj plan rozmowy sprzedażowej.${input.contactName ? ` Rozmówca: ${input.contactName}${input.contactTitle ? ` (${input.contactTitle})` : ""}.` : ""}

Kontekst firmy:
${context}

Wygeneruj:
1. 5 najważniejszych hipotez do sprawdzenia podczas rozmowy (co chcemy zweryfikować)
2. 5 konkretnych pytań dopasowanych do tej firmy i sytuacji
3. 3 prawdopodobne obiekcje/blokery (i jak je zaadresować)
4. 2-3 kąty wejścia sprzedażowego (co może być najsilniejszym hakiem)`;

  const schema = {
    type: "object",
    properties: {
      hypotheses: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 5 },
      questions: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 5 },
      expected_objections: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
      sales_angles: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
    },
    required: ["hypotheses", "questions", "expected_objections", "sales_angles"],
  };

  return callSonar<RecommendedQuestions>(prompt, schema);
}
