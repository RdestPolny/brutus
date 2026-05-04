import { askGeminiJsonWithDebug } from "./gemini";
import type {
  CompanyPagesReport,
  CompanyRegistryRow,
  GoWorkReport,
  GooglePlaceReport,
  IndustryReport,
  KrsReport,
  LeadSynthesis,
  PerplexityResearchSection,
  WebsiteFactsReport,
  WhoisReport,
} from "./types";

export async function synthesizeLeadWithDebug(input: SynthesisInput): Promise<{
  synthesis: LeadSynthesis | null;
  request: unknown;
  response: unknown;
  rawText: string;
}> {
  const prompt = buildSynthesisPrompt(input);
  const result = await askGeminiJsonWithDebug<LeadSynthesis>(prompt, {
    systemInstruction:
      "Jesteś analitykiem sprzedażowym agencji marketingowej. Tworzysz brief lead'a wyłącznie na podstawie przekazanych danych. Nie zmyślasz, nie dodajesz ogólników. Pisz konkretnie, po polsku.",
  });

  const content = result.content;
  if (!content) {
    return { synthesis: null, request: result.request, response: result.response, rawText: result.rawText };
  }

  const synthesis: LeadSynthesis = {
    brief: String(content.brief ?? "").trim(),
    signals: normalizeStringArray(content.signals, 8),
    redFlags: normalizeStringArray(content.redFlags, 6),
    suggestedQuestions: normalizeStringArray(content.suggestedQuestions, 5),
    coverageNotes: normalizeStringArray(content.coverageNotes, 6),
  };

  const isEmpty =
    !synthesis.brief &&
    synthesis.signals.length === 0 &&
    synthesis.redFlags.length === 0 &&
    synthesis.suggestedQuestions.length === 0 &&
    synthesis.coverageNotes.length === 0;

  return {
    synthesis: isEmpty ? null : synthesis,
    request: result.request,
    response: result.response,
    rawText: result.rawText,
  };
}

function buildSynthesisPrompt(input: SynthesisInput): string {
  const registryBlock = formatRegistry(input.registry, input.krs);
  const websiteBlock = formatWebsite(input.websiteFacts);
  const whoisBlock = formatWhois(input.whois);
  const industryBlock = formatIndustry(input.industryReport);
  const goWorkBlock = formatGoWork(input.goWork);
  const placesBlock = formatPlaces(input.googlePlace);
  const companyPagesBlock = formatCompanyPages(input.companyPages);
  const perplexityBlock = formatPerplexitySections({
    companyNews: input.companyNews,
    mediaPr: input.mediaPr,
    jobsTeam: input.jobsTeam,
    marketPosition: input.marketPosition,
  });

  return `Jesteś handlowcem agencji marketingowej. Za chwilę odbędziesz pierwszą rozmowę z firmą wymienioną poniżej. Wykorzystaj WSZYSTKIE przekazane dane, by przygotować się do rozmowy.

Zwróć WYŁĄCZNIE poprawny JSON:
{
  "brief": "3-4 zdania: kim jest klient, czym się zajmuje, jaka jest jego skala i pozycja, co jest aktualnie najważniejsze. Konkretnie i po polsku.",
  "signals": [
    "5-8 punktów - konkretne sygnały sprzedażowe / hooki na rozmowę. Każdy punkt: 1 zdanie, oparty na konkretnym fakcie z danych. Przykłady DOBRYCH sygnałów: 'Otwarte 3 wakaty dla handlowców (pracuj.pl) - rozbudowują dział sprzedaży, dobry moment na ofertę wsparcia generowania leadów.', 'Strata 2024: -120 tys PLN (KRS) - presja na efektywność marketingu.', 'Niedawno otworzyli oddział w Wrocławiu (komunikat 03.2025) - może potrzebować lokalnego SEO i kampanii.'. POMIŃ ogólniki."
  ],
  "redFlags": [
    "Czerwone flagi (max 6): rzeczy które obniżają szansę na współpracę lub wymagają ostrożności. Np. seria strat, restrukturyzacja, negatywne opinie, konflikty kadrowe. Tylko jeśli wynikają z danych."
  ],
  "suggestedQuestions": [
    "3-5 pytań do tej konkretnej firmy. NIE generyczne, lecz dopasowane: jeśli wiemy że firma niedawno się zrebrandingowała, pytamy o to. Jeśli rośnie - pytamy o cele wzrostu. Jeśli ma rotację - pytamy o cele EB."
  ],
  "coverageNotes": [
    "Krótkie noty co jest niepokryte w briefie (max 6). Np. 'Nie ustalono budżetu marketingowego', 'Brak danych o czasie rotacji w branży'. To pomoże handlowcowi dopytać podczas rozmowy."
  ]
}

ZASADY:
- Każdy sygnał i flaga: konkretny FAKT z danych, krótko przed średnikiem, potem WNIOSEK dla sprzedaży.
- Nie powielaj informacji między signals/redFlags.
- Dane finansowe: jeśli widzisz stratę, napisz konkretnie ile i w którym roku. Jeśli wzrost, podaj liczby.
- Pytania na rozmowę: sięgaj po fakty z briefu, nie zadawaj pytań na które już znasz odpowiedź.
- coverageNotes: krytycznie oceń czego brakuje, nie przepisuj wszystkiego.
- Pisz po polsku, w 2 osobie liczby pojedynczej do handlowca ("zwróć uwagę", "spytaj").

DANE:

${registryBlock}

${whoisBlock}

${websiteBlock}

${companyPagesBlock}

${industryBlock}

${perplexityBlock}

${goWorkBlock}

${placesBlock}`;
}

function formatRegistry(registry: CompanyRegistryRow | null, krs: KrsReport): string {
  if (!registry && (!krs || krs.facts.length === 0)) return "## REJESTR\n(brak danych)";
  const lines: string[] = ["## REJESTR (KRS / GoWork)"];
  if (registry) {
    lines.push(`- Nazwa: ${registry.name || "?"}`);
    lines.push(`- NIP: ${registry.nip || "?"} | KRS: ${registry.krs || "?"} | REGON: ${registry.regon || "?"}`);
    lines.push(`- Forma prawna: ${registry.legalForm || "?"} | Kapitał: ${registry.shareCapital || "?"}`);
    lines.push(`- Adres: ${registry.address || "?"}`);
    lines.push(`- Data rejestracji: ${registry.registrationDate || "?"}`);
    lines.push(`- Główna działalność: ${registry.mainActivity || "?"}`);
    if (registry.revenue) lines.push(`- Przychody (GoWork): ${registry.revenue}`);
  }
  if (krs?.boardMembers?.length) {
    lines.push(`- Zarząd: ${krs.boardMembers.map((person) => `${person.name} (${person.function})`).join("; ")}`);
  }
  if (krs?.shareholders?.length) {
    lines.push(`- Wspólnicy/akcjonariusze: ${krs.shareholders.map((fact) => fact.value).join("; ")}`);
  }
  if (krs?.recentChanges?.length) {
    lines.push(`- Bieżące zmiany w KRS: ${krs.recentChanges.map((change) => change.value).join("; ")}`);
  }
  if (krs?.transformations?.length) {
    lines.push(`- Fuzje/przekształcenia: ${krs.transformations.map((change) => change.value).join("; ")}`);
  }
  if (krs?.activities?.length) {
    const main = krs.activities.find((act) => act.isMain);
    const otherCount = krs.activities.filter((act) => !act.isMain).length;
    lines.push(`- PKD: główna ${main ? `${main.code} ${main.description}` : "?"}, dodatkowych: ${otherCount}`);
  }
  return lines.join("\n");
}

function formatWebsite(website: WebsiteFactsReport): string {
  const lines: string[] = ["## STRONA FIRMOWA"];
  if (!website?.url) return `${lines[0]}\n(nie ustalono / niedostępna)`;
  lines.push(`- URL: ${website.url}`);
  if (website.summary) lines.push(`- Streszczenie: ${website.summary}`);
  if (website.facts?.length) {
    lines.push("- Fakty ze strony:");
    website.facts.slice(0, 18).forEach((fact) => {
      lines.push(`  - [${fact.category}] ${fact.label}: ${fact.value}`);
    });
  }
  return lines.join("\n");
}

function formatWhois(whois: WhoisReport | null): string {
  if (!whois || whois.status !== "found") {
    return `## WHOIS DOMENY\n(${whois?.message ?? "brak danych"})`;
  }
  const lines: string[] = ["## WHOIS DOMENY", `- Domena: ${whois.domain}`];
  if (whois.registrationDate) lines.push(`- Data rejestracji domeny: ${whois.registrationDate}`);
  if (whois.lastChanged) lines.push(`- Ostatnia zmiana: ${whois.lastChanged}`);
  if (whois.expirationDate) lines.push(`- Wygasa: ${whois.expirationDate}`);
  if (whois.registrar) lines.push(`- Rejestrator: ${whois.registrar}`);
  return lines.join("\n");
}

function formatIndustry(industry: IndustryReport | null): string {
  if (!industry) return "## RAPORT BRANŻOWY\n(brak danych)";
  const lines: string[] = ["## RAPORT BRANŻOWY"];
  if (industry.standardPurchaseProcessDuration) lines.push(`- Czas zakupu: ${industry.standardPurchaseProcessDuration}`);
  if (industry.organizationalContext) lines.push(`- Kontekst branży: ${industry.organizationalContext}`);
  if (industry.buyingCommittee) lines.push(`- Komitet zakupowy: ${industry.buyingCommittee}`);
  if (industry.marketingBudgetHeuristic) lines.push(`- Budżet marketingowy: ${industry.marketingBudgetHeuristic}`);
  if (industry.geminiComment) lines.push(`- Komentarz: ${industry.geminiComment}`);
  return lines.join("\n");
}

function formatPerplexitySections(sections: {
  companyNews: PerplexityResearchSection;
  mediaPr: PerplexityResearchSection;
  jobsTeam: PerplexityResearchSection;
  marketPosition: PerplexityResearchSection;
}): string {
  const blocks: string[] = [];
  const formatSection = (title: string, section: PerplexityResearchSection) => {
    if (!section?.rows?.length) return `## ${title}\n(brak danych)`;
    const lines: string[] = [`## ${title}`];
    section.rows.slice(0, 14).forEach((row) => {
      if (!row.value || /^brak$/i.test(row.category)) return;
      const source = row.source ? ` [${row.source}]` : "";
      lines.push(`- ${row.category}: ${row.value}${source}`);
    });
    return lines.join("\n");
  };
  blocks.push(formatSection("BIEŻĄCE WYDARZENIA", sections.companyNews));
  blocks.push(formatSection("MEDIA & PR", sections.mediaPr));
  blocks.push(formatSection("WAKATY & ZESPÓŁ", sections.jobsTeam));
  blocks.push(formatSection("POZYCJA RYNKOWA", sections.marketPosition));
  return blocks.join("\n\n");
}

function formatCompanyPages(pages: CompanyPagesReport | null): string {
  if (!pages) return "## PODSTRONY FIRMOWE\n(brak danych)";
  const lines: string[] = ["## PODSTRONY FIRMOWE (kariera/aktualności/blog)"];
  if (pages.openJobs?.length) {
    lines.push("- Aktualne wakaty (ze strony firmowej):");
    pages.openJobs.forEach((job) => lines.push(`  - ${job}`));
  }
  if (pages.recentEvents?.length) {
    lines.push("- Bieżące wydarzenia (ze strony firmowej):");
    pages.recentEvents.forEach((event) => lines.push(`  - ${event}`));
  }
  if (pages.pages?.length) {
    lines.push("- Highlighty z podstron:");
    pages.pages.forEach((page) => {
      if (page.highlights.length === 0) return;
      lines.push(`  - [${page.kind}] ${page.title || page.url}: ${page.highlights.join(" | ")}`);
    });
  }
  if (lines.length === 1) lines.push("(nic istotnego nie znaleziono)");
  return lines.join("\n");
}

function formatGoWork(report: GoWorkReport): string {
  if (!report?.pages?.length) return "## GOWORK\n(brak profilu)";
  const reviews = report.pages.flatMap((page) => page.reviews);
  const financials = report.pages.flatMap((page) => page.financials);
  const lines: string[] = ["## GOWORK"];
  if (report.profileUrl) lines.push(`- Profil: ${report.profileUrl}`);
  if (financials.length > 0) {
    lines.push("- Finanse:");
    financials.slice(0, 5).forEach((row) => {
      lines.push(`  - ${row.year}: przychód ${row.revenue || "?"}, zysk/strata ${row.grossProfit || "?"}`);
    });
  }
  if (reviews.length > 0) {
    const counts = countSentiment(reviews);
    lines.push(`- Opinie GoWork: ${reviews.length} (poz: ${counts.positive}, neg: ${counts.negative}, neutr: ${counts.neutral})`);
    const topNegative = reviews.find((review) => review.sentiment === "negative" && review.text);
    if (topNegative) lines.push(`  - przykład negatywny: "${truncate(topNegative.text, 200)}"`);
  }
  return lines.join("\n");
}

function formatPlaces(places: GooglePlaceReport): string {
  if (!places || (!places.name && !places.mapsUrl && places.rating === null)) {
    return "## GOOGLE MAPS\n(brak danych)";
  }
  const lines: string[] = ["## GOOGLE MAPS"];
  if (places.name) lines.push(`- Nazwa: ${places.name}`);
  if (places.address) lines.push(`- Adres: ${places.address}`);
  if (places.rating !== null) lines.push(`- Ocena: ${places.rating}/5 (${places.reviewCount ?? 0} opinii)`);
  if (places.nationalPhoneNumber) lines.push(`- Telefon: ${places.nationalPhoneNumber}`);
  if (places.websiteUri) lines.push(`- WWW: ${places.websiteUri}`);
  if (places.businessStatus) lines.push(`- Status: ${places.businessStatus}`);
  if (places.negativeReviews?.length) {
    const example = places.negativeReviews[0];
    lines.push(`- Przykład negatywnej opinii: ${example.rating ?? "?"}/5 - "${truncate(example.text, 200)}"`);
  }
  return lines.join("\n");
}

function countSentiment(reviews: Array<{ sentiment: string }>): {
  positive: number;
  negative: number;
  neutral: number;
} {
  return reviews.reduce(
    (acc, review) => {
      if (review.sentiment === "positive") acc.positive += 1;
      else if (review.sentiment === "negative") acc.negative += 1;
      else if (review.sentiment === "neutral") acc.neutral += 1;
      return acc;
    },
    { positive: 0, negative: 0, neutral: 0 }
  );
}

function truncate(value: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength - 1)}…`;
}

function normalizeStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

export interface SynthesisInput {
  registry: CompanyRegistryRow | null;
  websiteFacts: WebsiteFactsReport;
  whois: WhoisReport | null;
  industryReport: IndustryReport | null;
  companyNews: PerplexityResearchSection;
  mediaPr: PerplexityResearchSection;
  jobsTeam: PerplexityResearchSection;
  marketPosition: PerplexityResearchSection;
  companyPages: CompanyPagesReport | null;
  goWork: GoWorkReport;
  krs: KrsReport;
  googlePlace: GooglePlaceReport;
}
