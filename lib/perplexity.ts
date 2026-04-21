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
        {
          role: "system",
          content:
            "Jesteś asystentem analizy leadów sprzedażowych dla polskich firm. Zawsze odpowiadaj w formacie JSON zgodnym ze schematem. Nie wymyślaj URL-i — używaj tylko tych, które znalazłeś w wyszukiwaniu. Dla każdego pola podaj status: confirmed (znaleziono bezpośrednio), inferred (wywnioskowano z kontekstu), missing (brak danych), conflicting (sprzeczne dane).",
        },
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
  const prompt = `Zbierz dane firmograficzne dla firmy: "${input.companyName}", domena: ${input.domain}${input.nip ? `, NIP: ${input.nip}` : ""}${input.krs ? `, KRS: ${input.krs}` : ""}.

Zbierz: branżę i specjalizację, obszar działania (lokalny/krajowy/międzynarodowy), rok założenia, wielkość zespołu, strukturę firmy (niezależna/korporacja/franczyza/giełdowa), model biznesowy (SaaS/jednorazowa/prowizje/produkcja), adres biura i telefon, datę rejestracji domeny i właściciela, linki do social media (LinkedIn/Facebook/Instagram/YouTube/Twitter/TikTok), link do wizytówki Google Maps.

Na końcu napisz krótkie podsumowanie 4-6 zdań: kim jest ta firma, na jakim etapie jest i jak zarabia.`;

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
  const prompt = `Znajdź sygnały wzrostu i bieżące wydarzenia dla firmy "${input.companyName}" (${input.domain}).

Szukaj: nowych oddziałów, dofinansowania, fuzji/przejęć, nowych produktów/linii biznesowych, ekspansji zagranicznej, aktywności PR/eventowej (targi, własne eventy, wystąpienia), współprac z influencerami lub ambasadorami marki, nowych katalogów produktowych, wzmianek medialnych, aktualnie otwartych wakatów (na jakie stanowiska rekrutują).

Każdy sygnał powinien mieć: typ, opis, datę (jeśli znana) i URL źródła.`;

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
  const krsBlock = krsContext
    ? `\nZweryfikowane dane z KRS i eKRS (użyj jako podstawy dla danych finansowych):\n${krsContext}\n`
    : "";

  const prompt = `Zbierz sygnały ryzyka dla firmy "${input.companyName}" (${input.domain}${input.nip ? `, NIP: ${input.nip}` : ""}).
${krsBlock}
Szukaj: zmian zarządu lub rady nadzorczej, zmian na stanowiskach dyrektora sprzedaży/marketingu, sprzedaży lub wykupu akcji, zmian struktury własnościowej, danych finansowych z ostatnich 2-3 lat (przychody, zysk/strata, zadłużenie${krsContext ? " — dane z KRS wyżej mają priorytet" : " — sprawdź ekrs.ms.gov.pl lub dostępne sprawozdania"}), opinii w Google Maps, Clutch i Gowork (ocena i główne skargi), sygnałów operacyjnych (redukcje etatów, rotacja pracowników, problemy PR).

Każdy sygnał ryzyka powinien mieć poziom: low/medium/high.`;

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
  const krsBlock = krsManagement
    ? `\nZweryfikowany zarząd z KRS:\n${krsManagement}\n`
    : "";

  const prompt = `Przeanalizuj strukturę decyzyjną i profil LinkedIn firmy "${input.companyName}" (${input.domain}).${input.contactName ? ` Osoba kontaktowa: ${input.contactName}${input.contactTitle ? `, stanowisko: ${input.contactTitle}` : ""}.` : ""}
${krsBlock}
KROK 1 — LINKEDIN:
Wyszukaj profil firmowy na LinkedIn używając zapytania: site:linkedin.com/company "${input.companyName}". Znajdź oficjalny URL strony firmowej LinkedIn. Następnie wyszukaj pracowników: site:linkedin.com/in "${input.companyName}" (CEO OR CMO OR "dyrektor sprzedaży" OR "dyrektor marketingu" OR "Head of Sales" OR "Head of Marketing" OR właściciel). Dla każdej znalezionej osoby podaj: imię, nazwisko, stanowisko, URL profilu LinkedIn w formacie "Imię Nazwisko - Stanowisko - linkedin.com/in/slug".

KROK 2 — STRUKTURA DECYZYJNA:
Określ: gdzie w hierarchii firmy siedzi nasz rozmówca, czy firma ma wewnętrzny dział marketingu (i jak liczny), czy ma dział sprzedaży, czy stosuje model przedstawicieli handlowych i struktur regionalnych, jak złożony jest prawdopodobny komitet zakupowy (simple/medium/complex), czy nasz rozmówca to właściciel/dyrektor/manager/specjalista.

Hipotezy na podstawie poszlak oznacz jako "inferred", nie "confirmed". URL-e LinkedIn tylko jeśli faktycznie je znalazłeś.`;

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
        'Lista kluczowych osób w formacie "Imię Nazwisko - Stanowisko - linkedin.com/in/slug" lub "Imię Nazwisko - Stanowisko" jeśli brak URL'
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
  const prompt = `Oceń gotowość zakupową firmy "${input.companyName}" (${input.domain}) na usługi marketingowe.

Określ: czy firma prawdopodobnie ma budżet marketingowy (budgeted/ad_hoc/no_budget/unknown), pilność zakupu (immediate/short_term/long_term/unknown), świadomość problemu (high/medium/low), dojrzałość marketingową (high/medium/low — na podstawie jakości strony, aktywności social media, obecności online, reklam), czy korzystała wcześniej z podobnych usług zewnętrznych (agencja, SaaS marketingowy).

Szukaj sygnałów: ogłoszenia o pracę na stanowiska marketingowe, aktywna reklama w Google/Meta, aktywny blog lub content marketing, profesjonalna strona www.`;

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
