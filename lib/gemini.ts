import type {
  LeadInput,
  CompanyProfile,
  GrowthSection,
  RiskSection,
  DecisionStructure,
  BuyingReadiness,
  RecommendedQuestions,
} from "./types";

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.candidates[0].content.parts[0].text as string;
}

const STRUCTURE_SYSTEM = `Jesteś ekspertem w analizie danych sprzedażowych B2B dla polskiego rynku. Otrzymujesz surowe wyniki wyszukiwania i strukturyzujesz je w precyzyjny JSON raport.

ZASADY:
- Każde pole DataField ma: value, confidence (0.0–1.0), status (confirmed/inferred/missing/conflicting), source_urls (tablica URL-i), evidence_excerpt (cytat z dowodu)
- status "confirmed" = bezpośredni URL-dowód; "inferred" = logiczny wniosek; "missing" = brak danych w materiale
- NIE WYMYŚLAJ URL-i ani nazwisk — użyj tylko tych z surowych danych
- confidence: 0.9+ tylko gdy masz bezpośredni URL; 0.5–0.8 dla wniosków; 0.1–0.4 gdy nie znaleziono
- Zwróć TYLKO JSON, bez komentarzy`;

export async function structureCompanyProfile(
  raw: string,
  input: LeadInput
): Promise<CompanyProfile> {
  const prompt = `Poniżej surowe wyniki wyszukiwania o firmie "${input.companyName}" (${input.domain}).

SUROWE DANE:
${raw}

Zwróć JSON o DOKŁADNIE tej strukturze:
{
  "industry": { "value": "string", "confidence": 0.0, "status": "confirmed|inferred|missing|conflicting", "source_urls": [], "evidence_excerpt": "" },
  "specialization": { "value": "string", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "market_scope": { "value": "local|national|international", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "founded_year": { "value": null, "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "employee_count": { "value": "string", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "company_structure": { "value": "string", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "business_model": { "value": "string", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "contact_address": { "value": "string", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "website_domain_registered": { "value": "string", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "social_links": { "value": [], "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "google_maps_link": { "value": "string", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "summary": "4–6 zdań: czym się firma zajmuje, jak zarabia, etap rozwoju"
}

WAŻNE dla social_links.value: wstaw TYLKO faktyczne URL-e znalezione w surowych danych. Jeśli Perplexity podał link do LinkedIn/Facebook/Instagram/YouTube — UMIEŚĆ GO w tablicy. Sprawdź dokładnie całość tekstu.`;

  const raw_json = await callGemini(STRUCTURE_SYSTEM, prompt);
  return JSON.parse(raw_json) as CompanyProfile;
}

export async function structureGrowthSection(raw: string): Promise<GrowthSection> {
  const prompt = `Poniżej surowe wyniki wyszukiwania o sygnałach wzrostu firmy.

SUROWE DANE:
${raw}

Zwróć JSON o DOKŁADNIE tej strukturze:
{
  "signals": [
    { "type": "string", "description": "string", "date": "string lub null", "source_url": "string", "relevance": "high|medium|low" }
  ],
  "recent_events": ["string"],
  "open_vacancies": { "value": ["stanowisko 1", "stanowisko 2"], "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "pr_mentions": ["tytuł artykułu lub wzmianki z URL"],
  "summary": "2–4 zdania podsumowujące sygnały wzrostu"
}

Dla każdego sygnału wzrostu — jeden obiekt w signals[]. Ogłoszenia o pracę wstaw do open_vacancies.value jako listę stanowisk.`;

  const raw_json = await callGemini(STRUCTURE_SYSTEM, prompt);
  return JSON.parse(raw_json) as GrowthSection;
}

export async function structureRiskSection(
  raw: string,
  krsContext?: string
): Promise<RiskSection> {
  const krsNote = krsContext
    ? `\nDANE Z KRS (zweryfikowane — użyj jako podstawy finansowej):\n${krsContext}\n`
    : "";

  const prompt = `Poniżej surowe wyniki wyszukiwania o ryzykach i finansach firmy.
${krsNote}
SUROWE DANE:
${raw}

Zwróć JSON o DOKŁADNIE tej strukturze:
{
  "signals": [
    { "type": "string", "description": "string", "level": "low|medium|high", "source_url": "string" }
  ],
  "financial": [
    { "year": 2023, "revenue": "string lub null", "profit_loss": "string lub null", "debt": "string lub null", "trend": "growing|stable|declining|unknown" }
  ],
  "management_changes": { "value": ["opis zmiany 1"], "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "reviews": {
    "google": { "value": "ocena X/5, główne skargi...", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
    "clutch": { "value": "string", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
    "gowork": { "value": "ocena X/5, główne skargi pracowników...", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" }
  },
  "summary": "2–4 zdania o profilu ryzyka i kondycji finansowej"
}

financial[]: jeden obiekt per rok, tylko lata z faktycznymi danymi. Jeśli brak danych finansowych — zwróć pustą tablicę [].`;

  const raw_json = await callGemini(STRUCTURE_SYSTEM, prompt);
  return JSON.parse(raw_json) as RiskSection;
}

export async function structureDecisionStructure(
  rawPeople: string,
  input: LeadInput,
  krsManagement?: string
): Promise<DecisionStructure> {
  const krsBlock = krsManagement
    ? `\nZWERYFIKOWANY ZARZĄD Z KRS:\n${krsManagement}\n`
    : "";
  const contactLine = input.contactName
    ? `\nOsoba kontaktowa: ${input.contactName}${input.contactTitle ? `, stanowisko: ${input.contactTitle}` : ""}.`
    : "";

  const prompt = `Poniżej surowe wyniki wyszukiwania o strukturze decyzyjnej i pracownikach firmy "${input.companyName}".
${krsBlock}${contactLine}

SUROWE DANE:
${rawPeople}

Zwróć JSON o DOKŁADNIE tej strukturze:
{
  "contact_role_in_hierarchy": { "value": "opis roli", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "marketing_team_size": { "value": "szacunkowa wielkość np. '2–5 osób'", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "has_sales_team": { "value": true, "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "sales_model": { "value": "opis modelu sprzedaży", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "buying_committee_complexity": { "value": "simple|medium|complex", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "decision_maker_type": { "value": "owner|director|manager|specialist", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "linkedin_company_url": { "value": "https://linkedin.com/company/...", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "key_decision_makers": { "value": ["Imię Nazwisko — Stanowisko — linkedin.com/in/slug"], "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "summary": "2–4 zdania o strukturze decyzyjnej"
}

WAŻNE dla key_decision_makers.value: wypisz WSZYSTKICH znalezionych pracowników z surowych danych. Dla każdej osoby z LinkedIn URL — format: "Imię Nazwisko — Stanowisko — pełny URL". Bez URL: "Imię Nazwisko — Stanowisko". NIE POMIJAJ żadnej znalezionej osoby.`;

  const raw_json = await callGemini(STRUCTURE_SYSTEM, prompt);
  return JSON.parse(raw_json) as DecisionStructure;
}

export async function structureBuyingReadiness(
  raw: string,
  input: LeadInput
): Promise<BuyingReadiness> {
  const prompt = `Poniżej surowe wyniki wyszukiwania o aktywności marketingowej firmy "${input.companyName}" (${input.domain}).

SUROWE DANE:
${raw}

Zwróć JSON o DOKŁADNIE tej strukturze:
{
  "budget_signal": { "value": "budgeted|ad_hoc|no_budget|unknown", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "urgency": { "value": "immediate|short_term|long_term|unknown", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "problem_awareness": { "value": "high|medium|low", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "marketing_maturity": { "value": "high|medium|low", "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "used_similar_solution_before": { "value": false, "confidence": 0.0, "status": "...", "source_urls": [], "evidence_excerpt": "" },
  "summary": "2–4 zdania o gotowości zakupowej"
}

Kryteria: budgeted = aktywne płatne reklamy lub potwierdzona agencja; ad_hoc = sporadyczna aktywność; no_budget = brak jakichkolwiek sygnałów płatnego marketingu; marketing_maturity high = aktywny blog + reklamy + profesjonalna strona.`;

  const raw_json = await callGemini(STRUCTURE_SYSTEM, prompt);
  return JSON.parse(raw_json) as BuyingReadiness;
}

export async function generateRecommendedQuestions(
  input: LeadInput,
  context: string
): Promise<RecommendedQuestions> {
  const contactLine = input.contactName
    ? ` Rozmówca: ${input.contactName}${input.contactTitle ? ` (${input.contactTitle})` : ""}.`
    : "";

  const prompt = `Przygotuj plan rozmowy sprzedażowej dla firmy "${input.companyName}".${contactLine}

KONTEKST FIRMY:
${context}

Zwróć JSON o DOKŁADNIE tej strukturze:
{
  "hypotheses": ["hipoteza 1", "hipoteza 2", "hipoteza 3", "hipoteza 4", "hipoteza 5"],
  "questions": ["pytanie 1", "pytanie 2", "pytanie 3", "pytanie 4", "pytanie 5"],
  "expected_objections": ["obiekcja 1 i jak odpowiedzieć", "obiekcja 2 i jak odpowiedzieć", "obiekcja 3 i jak odpowiedzieć"],
  "sales_angles": ["kąt wejścia 1", "kąt wejścia 2", "kąt wejścia 3"]
}

Dokładnie 5 hipotez, 5 pytań, 3 obiekcje, 2–3 kąty wejścia. Wszystko dopasowane konkretnie do tej firmy.`;

  const raw_json = await callGemini(
    "Jesteś ekspertem sprzedaży B2B na polskim rynku. Generujesz trafne materiały do rozmowy handlowej. Zwróć TYLKO JSON.",
    prompt
  );
  return JSON.parse(raw_json) as RecommendedQuestions;
}
