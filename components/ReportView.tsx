"use client";

import { useState } from "react";
import type { CompanyReport } from "@/lib/types";

export function ReportView({ report }: { report: CompanyReport }) {
  const [debugOpen, setDebugOpen] = useState(false);
  const registry = report.registry.rows[0];
  const place = report.googlePlace;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">Raport dla firmy</p>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-950">{report.input.companyName}</h2>
          <p className="mt-1 text-sm text-gray-500">
            Wygenerowano: {new Date(report.generatedAt).toLocaleString("pl-PL")}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setDebugOpen(true)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Debug
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Drukuj
          </button>
        </div>
      </div>

      <ExecutiveOverview report={report} />

      <Section title="1. Dane rejestrowe">
        <RegistryTable report={report} />
      </Section>

      <Section title="2. Dane z oficjalnej strony">
        <WebsiteFactsSection report={report} />
      </Section>

      <Section title="3. Strona i social media">
        <DigitalPresenceTable report={report} />
      </Section>

      <Section title="4. GoWork">
        <GoWorkSection report={report} />
      </Section>

      <Section title="5. Wizytówka Google Maps">
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <InfoRow label="Nazwa" value={place.name} />
            <InfoRow label="Adres" value={place.address} />
            <InfoRow label="Ocena" value={formatRating(place.rating, place.reviewCount)} />
            <InfoRow label="Telefon" value={place.nationalPhoneNumber} />
            <InfoRow label="Strona" value={place.websiteUri} link />
            <InfoRow label="Google Maps" value={place.mapsUrl} link />
            <InfoRow label="Status" value={place.businessStatus} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Godziny otwarcia</p>
            {place.openingHours.length > 0 ? (
              <ul className="space-y-1 text-sm text-gray-700">
                {place.openingHours.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <Empty />
            )}
          </div>
        </div>

        <div className="mt-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <ReviewsList title="Pozytywne opinie" reviews={place.positiveReviews} tone="positive" />
            <ReviewsList title="Negatywne opinie (1-3 gwiazdki)" reviews={place.negativeReviews} tone="negative" />
          </div>
        </div>
      </Section>

      {registry?.name && (
        <p className="text-xs text-gray-400 print:hidden">
          Zapytanie Google Places: {[registry.name, registry.address].filter(Boolean).join(" ")}
        </p>
      )}

      {debugOpen && <DebugModal report={report} onClose={() => setDebugOpen(false)} />}
    </div>
  );
}

function ExecutiveOverview({ report }: { report: CompanyReport }) {
  const financials = report.goWork.pages.flatMap((page) => page.financials);
  const goWorkReviews = report.goWork.pages.flatMap((page) => page.reviews);
  const googlePlace = report.googlePlace;
  const goWorkSentiment = summarizeGoWorkSentiment(goWorkReviews);
  const googleSentiment = summarizeGoogleSentiment(googlePlace.reviews);
  const goWorkRating = calculateGoWorkRating(goWorkReviews);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-gray-950">Finanse z GoWork</h3>
              <p className="text-sm text-gray-500">Przychód netto i zysk / strata brutto na podstawie danych profilu</p>
            </div>
          </div>
          <FinancialChart financials={financials} />
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <RatingCard
              title="Google Maps"
              subtitle="klienci"
              rating={googlePlace.rating}
              count={googlePlace.reviewCount}
              tone="blue"
            />
            <RatingCard
              title="GoWork"
              subtitle="pracownicy i kandydaci"
              rating={goWorkRating.rating}
              count={goWorkRating.count}
              tone="red"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <SentimentCard title="Sentyment GoWork" value={goWorkSentiment} />
            <SentimentCard title="Sentyment Google Maps" value={googleSentiment} />
          </div>
        </div>
      </div>
    </section>
  );
}

function FinancialChart({ financials }: { financials: Array<{ year: string; revenue: string; grossProfit: string }> }) {
  const parsed = financials
    .map((row) => ({
      year: row.year,
      revenueLabel: row.revenue,
      grossProfitLabel: row.grossProfit,
      revenue: parsePolishMoney(row.revenue),
      grossProfit: parsePolishMoney(row.grossProfit),
    }))
    .filter((row) => row.year && (row.revenue !== null || row.grossProfit !== null));
  const maxValue = Math.max(1, ...parsed.flatMap((row) => [Math.abs(row.revenue ?? 0), Math.abs(row.grossProfit ?? 0)]));

  if (parsed.length === 0) return <Empty />;

  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-blue-700" />Przychód</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-emerald-700" />Zysk / strata</span>
      </div>
      <div className="flex min-h-72 items-end gap-5 overflow-x-auto border-b border-gray-200 pb-3">
        {parsed.map((row) => (
          <div key={row.year} className="flex min-w-24 flex-1 flex-col items-center gap-2">
            <div className="flex h-56 items-end gap-3">
              <ChartBar value={row.revenue} maxValue={maxValue} label={row.revenueLabel} color="bg-blue-700" />
              <ChartBar value={row.grossProfit} maxValue={maxValue} label={row.grossProfitLabel} color="bg-emerald-700" />
            </div>
            <div className="text-sm font-medium text-gray-900">{row.year}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartBar({ value, maxValue, label, color }: { value: number | null; maxValue: number; label: string; color: string }) {
  const height = value === null ? 0 : Math.max(6, Math.round((Math.abs(value) / maxValue) * 210));
  const isNegative = (value ?? 0) < 0;

  return (
    <div className="flex h-56 w-10 flex-col items-center justify-end gap-1">
      <span className="max-w-20 text-center text-xs font-medium text-gray-700">{label || "brak"}</span>
      <div className={`w-9 rounded-t-md ${isNegative ? "bg-red-600" : color}`} style={{ height }} />
    </div>
  );
}

function RatingCard({
  title,
  subtitle,
  rating,
  count,
  tone,
}: {
  title: string;
  subtitle: string;
  rating: number | null;
  count: number | null;
  tone: "blue" | "red";
}) {
  const color = tone === "blue" ? "border-blue-200 bg-blue-50 text-blue-950" : "border-red-200 bg-red-50 text-red-950";

  return (
    <div className={`rounded-md border p-4 ${color}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs opacity-75">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold">{rating !== null ? rating.toFixed(1) : "-"}</p>
          <p className="text-xs opacity-75">{count !== null ? `${count} opinii` : "brak opinii"}</p>
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/80">
        <div className="h-2 rounded-full bg-current" style={{ width: `${rating !== null ? Math.min(100, (rating / 5) * 100) : 0}%` }} />
      </div>
    </div>
  );
}

function SentimentCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
      <p className="mb-1 text-sm font-medium text-gray-900">{title}</p>
      <p className="text-sm leading-6 text-gray-700">{value}</p>
    </div>
  );
}

function RegistryTable({ report }: { report: CompanyReport }) {
  if (report.registry.rows.length === 0) return <RawMarkdownFallback value={report.registry.rawMarkdown} />;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="bg-gray-100 text-left text-gray-600">
            <Header>Nazwa</Header>
            <Header>NIP</Header>
            <Header>REGON</Header>
            <Header>KRS</Header>
            <Header>Adres</Header>
            <Header>Forma prawna</Header>
            <Header>Przychody</Header>
            <Header>Opinie</Header>
            <Header>Główna działalność</Header>
          </tr>
        </thead>
        <tbody>
          {report.registry.rows.map((row, index) => (
            <tr key={index} className="align-top">
              <Cell strong>{row.name}</Cell>
              <Cell>{row.nip}</Cell>
              <Cell>{row.regon}</Cell>
              <Cell>{row.krs}</Cell>
              <Cell>{row.address}</Cell>
              <Cell>{row.legalForm}</Cell>
              <Cell>{row.revenue}</Cell>
              <Cell>{row.opinions}</Cell>
              <Cell>{row.mainActivity}</Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WebsiteFactsSection({ report }: { report: CompanyReport }) {
  const facts = report.websiteFacts?.facts ?? [];
  const validation = report.websiteFacts?.validation;
  const conflicts = validation?.conflicts ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 text-sm md:grid-cols-[140px_1fr]">
        <div className="text-gray-500">Źródło</div>
        <div className="font-medium text-gray-900">
          {report.websiteFacts?.url ? renderMaybeLink(report.websiteFacts.url) : <Empty />}
        </div>
        <div className="text-gray-500">Podsumowanie</div>
        <div className="text-gray-700">{report.websiteFacts?.summary || <Empty />}</div>
        {validation?.summary && (
          <>
            <div className="text-gray-500">Walidacja</div>
            <div className="text-gray-700">{validation.summary}</div>
          </>
        )}
      </div>

      {facts.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-gray-100 text-left text-gray-600">
                <Header>Kategoria</Header>
                <Header>Wartość</Header>
                <Header>Fragment źródłowy</Header>
                <Header>Pewność</Header>
              </tr>
            </thead>
            <tbody>
              {facts.map((fact, index) => (
                <tr key={`${fact.category}-${fact.value}-${index}`} className="align-top">
                  <Cell strong>{fact.label || fact.category}</Cell>
                  <Cell>{fact.value}</Cell>
                  <Cell>{fact.sourceQuote}</Cell>
                  <Cell>{formatConfidence(fact.confidence)}</Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty />
      )}

      {conflicts.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-sm font-medium text-amber-900">Wykryte rozbieżności</p>
          <ul className="space-y-1 text-sm text-amber-900">
            {conflicts.map((conflict, index) => (
              <li key={`${conflict.field}-${index}`}>
                <strong>{conflict.field}:</strong> strona: {conflict.websiteValue || "brak"}, Perplexity:{" "}
                {conflict.perplexityValue || "brak"} ({conflict.note})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DigitalPresenceTable({ report }: { report: CompanyReport }) {
  if (report.digitalPresence.rows.length === 0) {
    return <RawMarkdownFallback value={report.digitalPresence.rawMarkdown} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="bg-gray-100 text-left text-gray-600">
            <Header>Platforma</Header>
            <Header>Adres</Header>
            <Header>Liczba followersów / Dodatkowe informacje</Header>
          </tr>
        </thead>
        <tbody>
          {report.digitalPresence.rows.map((row, index) => (
            <tr key={index} className="align-top">
              <Cell strong>{row.platform}</Cell>
              <Cell>{renderMaybeLink(row.address)}</Cell>
              <Cell>{row.details}</Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GoWorkSection({ report }: { report: CompanyReport }) {
  const goWork = report.goWork;
  const pages = goWork?.pages ?? [];
  const reviews = pages.flatMap((page) => page.reviews.map((review) => ({ ...review, pageTitle: page.title })));
  const financials = pages.flatMap((page) => page.financials);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 text-sm md:grid-cols-[140px_1fr]">
        <div className="text-gray-500">Profil</div>
        <div className="font-medium text-gray-900">
          {goWork?.profileUrl ? renderMaybeLink(goWork.profileUrl) : <Empty />}
        </div>
      </div>

      {reviews.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900">Opinie i wpisy</p>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-gray-600">
                  <Header>Data</Header>
                  <Header>Autor</Header>
                  <Header>Typ</Header>
                  <Header>Wydźwięk</Header>
                  <Header>Treść</Header>
                  <Header>Odpowiedź firmy</Header>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review, index) => (
                  <tr key={`${review.date}-${review.author}-${index}`} className="align-top">
                    <Cell>{review.date}</Cell>
                    <Cell strong>{review.author}</Cell>
                    <Cell>{review.type}</Cell>
                    <Cell>{formatSentiment(review.sentiment)}</Cell>
                    <Cell>{review.text}</Cell>
                    <Cell>{review.companyReply}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {financials.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900">Przychody i zysk</p>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-gray-600">
                  <Header>Rok</Header>
                  <Header>Przychód netto</Header>
                  <Header>Zysk / strata brutto</Header>
                </tr>
              </thead>
              <tbody>
                {financials.map((row, index) => (
                  <tr key={`${row.year}-${index}`} className="align-top">
                    <Cell strong>{row.year}</Cell>
                    <Cell>{row.revenue}</Cell>
                    <Cell>{row.grossProfit}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pages.length > 0 ? (
        <div className="space-y-5">
          {pages.map((page) => (
            <div key={page.url} className="space-y-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{page.title}</p>
                <p className="text-xs text-gray-500">{renderMaybeLink(page.url)}</p>
              </div>
              {page.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="bg-gray-100 text-left text-gray-600">
                        <Header>Kategoria</Header>
                        <Header>Informacja</Header>
                        <Header>Wartość</Header>
                        <Header>Fragment źródłowy</Header>
                      </tr>
                    </thead>
                    <tbody>
                      {page.rows.map((row, index) => (
                        <tr key={`${page.url}-${row.label}-${index}`} className="align-top">
                          <Cell strong>{formatGoWorkCategory(row.category)}</Cell>
                          <Cell>{row.label}</Cell>
                          <Cell>{row.value}</Cell>
                          <Cell>{row.sourceQuote}</Cell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty />
              )}
            </div>
          ))}
        </div>
      ) : (
        <RawMarkdownFallback value={goWork?.searchRawMarkdown ?? ""} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-3">
        <h3 className="text-base font-semibold text-gray-950">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-gray-200 px-3 py-2 font-medium">{children}</th>;
}

function Cell({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <td className={`border-b border-gray-100 px-3 py-3 ${strong ? "font-medium text-gray-950" : "text-gray-700"}`}>
      {children || <Empty />}
    </td>
  );
}

function InfoRow({ label, value, link = false }: { label: string; value: string | null; link?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-gray-100 py-2 text-sm">
      <div className="text-gray-500">{label}</div>
      <div className="font-medium text-gray-900">
        {value ? link ? renderMaybeLink(value) : value : <Empty />}
      </div>
    </div>
  );
}

function RawMarkdownFallback({ value }: { value: string }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs whitespace-pre-wrap">
      {value || "Brak danych"}
    </pre>
  );
}

function Empty() {
  return <span className="text-gray-400">brak danych</span>;
}

function renderMaybeLink(value: string) {
  const markdownLink = value.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
  const url = markdownLink?.[2] ?? value.match(/https?:\/\/\S+/)?.[0];
  const label = markdownLink?.[1] ?? url ?? value;

  if (!url) return value;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
      {label}
    </a>
  );
}

function formatRating(rating: number | null, count: number | null): string | null {
  if (rating === null) return null;
  return `${rating}/5${count !== null ? ` (${count} opinii)` : ""}`;
}

function formatConfidence(confidence: "high" | "medium" | "low"): string {
  if (confidence === "high") return "wysoka";
  if (confidence === "low") return "niska";
  return "średnia";
}

function formatGoWorkCategory(category: string): string {
  const labels: Record<string, string> = {
    profile: "Profil",
    ratings: "Oceny",
    opinions: "Opinie",
    contact: "Kontakt",
    salary: "Zarobki",
    jobs: "Praca",
    recruitment: "Rekrutacja",
    benefits: "Benefity",
    questions: "Pytania",
    metadata: "Metadane",
    other: "Inne",
  };

  return labels[category] ?? category;
}

function formatSentiment(sentiment: "positive" | "negative" | "neutral" | "unknown"): string {
  if (sentiment === "positive") return "pozytywny";
  if (sentiment === "negative") return "negatywny";
  if (sentiment === "neutral") return "neutralny";
  return "nieokreślony";
}

function parsePolishMoney(value: string): number | null {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
  const match = normalized.match(/-?\d+(?:[,.]\d+)?/);
  if (!match) return null;
  const base = Number(match[0].replace(",", "."));
  if (!Number.isFinite(base)) return null;
  if (normalized.includes("mln")) return base * 1_000_000;
  if (normalized.includes("tys")) return base * 1_000;
  return base;
}

function calculateGoWorkRating(
  reviews: Array<{ sentiment: "positive" | "negative" | "neutral" | "unknown" }>
): { rating: number | null; count: number | null } {
  const scored = reviews
    .map((review) => {
      if (review.sentiment === "positive") return 5;
      if (review.sentiment === "neutral") return 3;
      if (review.sentiment === "negative") return 1;
      return null;
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  if (scored.length === 0) return { rating: null, count: reviews.length || null };
  return {
    rating: scored.reduce((sum, value) => sum + value, 0) / scored.length,
    count: scored.length,
  };
}

function summarizeGoWorkSentiment(
  reviews: Array<{ sentiment: "positive" | "negative" | "neutral" | "unknown"; text: string }>
): string {
  if (reviews.length === 0) return "Brak pobranych opinii GoWork do oceny sentymentu.";
  const counts = sentimentCounts(reviews);
  const dominant = dominantSentiment(counts);
  const sample = reviews.find((review) => review.sentiment === dominant && review.text)?.text ?? reviews.find((review) => review.text)?.text ?? "";

  return `W pobranych wpisach GoWork dominuje wydźwięk ${formatSentiment(dominant)} (${counts[dominant]} z ${reviews.length} wpisów). ${sentimentExplanation(dominant)}${sample ? ` Przykładowy motyw: ${shortenText(sample, 180)}` : ""}`;
}

function summarizeGoogleSentiment(reviews: Array<{ rating: number | null; text: string }>): string {
  if (reviews.length === 0) return "Brak pobranych opinii Google Maps do oceny sentymentu.";
  const positive = reviews.filter((review) => (review.rating ?? 0) >= 4).length;
  const negative = reviews.filter((review) => (review.rating ?? 5) <= 2).length;
  const neutral = reviews.length - positive - negative;
  const dominant = positive >= negative && positive >= neutral ? "positive" : negative >= neutral ? "negative" : "neutral";
  const sample = reviews.find((review) =>
    dominant === "positive" ? (review.rating ?? 0) >= 4 : dominant === "negative" ? (review.rating ?? 5) <= 2 : (review.rating ?? 0) === 3
  )?.text ?? reviews.find((review) => review.text)?.text ?? "";

  return `W opiniach Google Maps dominuje wydźwięk ${formatSentiment(dominant)} (${positive} pozytywnych, ${neutral} neutralnych, ${negative} negatywnych w pobranej próbce). ${sentimentExplanation(dominant)}${sample ? ` Przykładowy motyw: ${shortenText(sample, 180)}` : ""}`;
}

function sentimentCounts(reviews: Array<{ sentiment: "positive" | "negative" | "neutral" | "unknown" }>) {
  return reviews.reduce(
    (counts, review) => {
      counts[review.sentiment] += 1;
      return counts;
    },
    { positive: 0, negative: 0, neutral: 0, unknown: 0 }
  );
}

function dominantSentiment(counts: Record<"positive" | "negative" | "neutral" | "unknown", number>) {
  const entries = Object.entries(counts) as Array<["positive" | "negative" | "neutral" | "unknown", number]>;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function sentimentExplanation(sentiment: "positive" | "negative" | "neutral" | "unknown"): string {
  if (sentiment === "positive") return "Komentarze częściej wskazują mocne strony doświadczenia z firmą.";
  if (sentiment === "negative") return "Komentarze częściej sygnalizują ryzyka lub niezadowolenie.";
  if (sentiment === "neutral") return "Komentarze mają mieszany lub informacyjny charakter.";
  return "Część wpisów nie ma jednoznacznego wydźwięku.";
}

function shortenText(value: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
}

function ReviewsList({
  title,
  reviews,
  tone,
}: {
  title: string;
  reviews: Array<{ author: string | null; rating: number | null; text: string }>;
  tone: "positive" | "negative";
}) {
  const color = tone === "positive" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50";
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-700">{title}</p>
      {reviews.length > 0 ? (
        <div className="space-y-3">
          {reviews.map((review, index) => (
            <div key={index} className={`rounded-md border p-3 ${color}`}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-800">{review.author ?? "Autor Google"}</span>
                <span className="text-gray-500">{review.rating ? `${review.rating}/5` : "brak oceny"}</span>
              </div>
              <p className="text-sm leading-6 text-gray-700">{review.text || "Brak treści opinii"}</p>
            </div>
          ))}
        </div>
      ) : (
        <Empty />
      )}
    </div>
  );
}

function DebugModal({ report, onClose }: { report: CompanyReport; onClose: () => void }) {
  const debug = report.debug;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h3 className="text-base font-semibold text-gray-950">Debug API</h3>
            <p className="text-xs text-gray-500">Surowe zapytania i odpowiedzi z ostatniego raportu</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Zamknij
          </button>
        </div>

        <div className="overflow-auto p-5">
          {!debug ? (
            <Empty />
          ) : (
            <div className="space-y-4">
              {debug.steps?.map((step, index) => (
                <details key={`${step.name}-${index}`} open={index === 0} className="rounded-md border border-gray-200">
                  <summary className="cursor-pointer bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900">
                    {step.name}
                  </summary>
                  <div className="grid gap-4 p-4 md:grid-cols-2">
                    <DebugBlock title="Request" value={step.request} />
                    <DebugBlock title="Response" value={step.response} />
                  </div>
                </details>
              ))}

              <details className="rounded-md border border-gray-200">
                <summary className="cursor-pointer bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900">
                  Sparsowane dane w raporcie
                </summary>
                <div className="p-4">
                  <DebugBlock
                    title="Parsed report"
                    value={{
                      registry: report.registry,
                      websiteFacts: report.websiteFacts,
                      digitalPresence: report.digitalPresence,
                      goWork: report.goWork,
                      googlePlace: report.googlePlace,
                    }}
                  />
                </div>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DebugBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <pre className="max-h-96 overflow-auto rounded-md border border-gray-200 bg-gray-950 p-3 text-xs leading-5 text-gray-100 whitespace-pre-wrap">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
