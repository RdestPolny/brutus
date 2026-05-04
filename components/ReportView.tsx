"use client";

import { useState } from "react";
import type { CompanyReport } from "@/lib/types";

export function ReportView({ report }: { report: CompanyReport }) {
  const [debugOpen, setDebugOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState("summary");
  const registry = report.registry.rows[0] ?? null;
  const reportTitle = registry?.name || report.input.companyName || `NIP ${report.input.nip}`;
  const businessRows = buildBusinessRows(report);
  const structureRows = buildStructureRows(report);
  const presenceRows = buildPresenceRows(report);
  const websiteRows = buildWebsiteRows(report);
  const hasFinancials =
    report.goWork.pages.some((page) => page.financials.length > 0) ||
    report.krs?.filings.length > 0;
  const hasOpinions =
    report.goWork.pages.some((page) => page.reviews.length > 0) ||
    report.googlePlace.reviews.length > 0 ||
    report.googlePlace.positiveReviews.length > 0 ||
    report.googlePlace.negativeReviews.length > 0;
  const tabs = [
    hasExecutiveOverview(report)
      ? {
          id: "summary",
          title: "Podsumowanie",
          shortTitle: "Podsumowanie",
          content: <ExecutiveOverview report={report} />,
        }
      : null,
    {
      id: "profile",
      title: "1. Profil firmy",
      shortTitle: "Profil",
      content: <CompanyProfileSection report={report} />,
    },
    businessRows.length > 0
      ? {
          id: "business",
          title: "2. Branża i model działania",
          shortTitle: "Branża",
          content: <BusinessSection report={report} rows={businessRows} />,
        }
      : null,
    structureRows.length > 0
      ? {
          id: "structure",
          title: "3. Struktura i decyzje",
          shortTitle: "Struktura",
          content: <StructureSection report={report} rows={structureRows} />,
        }
      : null,
    hasFinancials
      ? {
          id: "financials",
          title: "4. Finanse i dokumenty",
          shortTitle: "Finanse",
          content: <FinancialSection report={report} />,
        }
      : null,
    presenceRows.length > 0
      ? {
          id: "presence",
          title: "5. Kontakt i obecność online",
          shortTitle: "Kontakt",
          content: <PresenceSection report={report} rows={presenceRows} />,
        }
      : null,
    hasOpinions
      ? {
          id: "reputation",
          title: "6. Opinie i reputacja",
          shortTitle: "Opinie",
          content: <ReputationSection report={report} />,
        }
      : null,
    websiteRows.length > 0
      ? {
          id: "website",
          title: "7. Dodatkowe fakty ze strony",
          shortTitle: "Strona",
          content: <FactsTable rows={websiteRows} />,
        }
      : null,
  ].filter((tab): tab is ReportTab => tab !== null);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">Raport dla firmy</p>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-950">{reportTitle}</h2>
          <p className="mt-1 text-sm text-gray-500">NIP: {report.input.nip}</p>
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

      {activeTab && (
        <>
          <div className="print:hidden">
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
              <div role="tablist" aria-label="Sekcje raportu" className="flex min-w-max gap-1">
                {tabs.map((tab) => {
                  const isActive = tab.id === activeTab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTabId(tab.id)}
                      className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? "bg-gray-950 text-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-950"
                      }`}
                    >
                      {tab.shortTitle}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="print:hidden">
            {activeTab.id === "summary" ? activeTab.content : <Section title={activeTab.title}>{activeTab.content}</Section>}
          </div>

          <div className="hidden space-y-6 print:block">
            {tabs.map((tab) =>
              tab.id === "summary" ? (
                <div key={tab.id}>{tab.content}</div>
              ) : (
                <Section key={tab.id} title={tab.title}>
                  {tab.content}
                </Section>
              )
            )}
          </div>
        </>
      )}

      {registry?.name && (
        <p className="text-xs text-gray-400 print:hidden">
          Zapytanie Google Places: {report.debug?.placesQuery || [registry.name, registry.address].filter(Boolean).join(" ")}
        </p>
      )}

      {debugOpen && <DebugModal report={report} onClose={() => setDebugOpen(false)} />}
    </div>
  );
}

function ExecutiveOverview({ report }: { report: CompanyReport }) {
  const financials = uniqueFinancials(report.goWork.pages.flatMap((page) => page.financials));
  const goWorkReviews = uniqueGoWorkReviews(report.goWork.pages.flatMap((page) => page.reviews));
  const googlePlace = report.googlePlace;
  const goWorkSentiment = summarizeGoWorkSentiment(goWorkReviews);
  const googleSentiment = summarizeGoogleSentiment(googlePlace.reviews);
  const goWorkRating = calculateGoWorkRating(goWorkReviews);
  const latestFinancial = latestFinancialRow(financials);
  const hasFinancialChart = financials.some((row) => row.year && (row.revenue || row.grossProfit));
  const hasCards =
    googlePlace.rating !== null ||
    goWorkReviews.length > 0 ||
    Boolean(latestFinancial?.revenue) ||
    Boolean(latestFinancial?.grossProfit);
  const hasSentiment = goWorkReviews.length > 0 || googlePlace.reviews.length > 0;

  if (!hasCards && !hasFinancialChart && !hasSentiment) return null;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-950">Podsumowanie</h3>
          <p className="text-sm text-gray-500">Finanse, oceny i sentyment z GoWork oraz Google Maps</p>
        </div>
      </div>

      {hasCards && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {googlePlace.rating !== null && (
            <RatingCard
              title="Google Maps"
              subtitle="klienci"
              rating={googlePlace.rating}
              count={googlePlace.reviewCount}
              tone="blue"
            />
          )}
          {goWorkReviews.length > 0 && (
            <RatingCard
              title="GoWork"
              subtitle="pracownicy i kandydaci"
              rating={goWorkRating.rating}
              count={goWorkRating.count}
              tone="red"
            />
          )}
          {latestFinancial?.revenue && (
            <FinancialMetricCard label={`Przychód ${latestFinancial.year}`} value={latestFinancial.revenue} tone="blue" />
          )}
          {latestFinancial?.grossProfit && (
            <FinancialMetricCard label={`Zysk / strata ${latestFinancial.year}`} value={latestFinancial.grossProfit} tone="green" />
          )}
        </div>
      )}

      {hasFinancialChart && <FinancialChart financials={financials} />}

      {hasSentiment && (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {goWorkReviews.length > 0 && <SentimentCard title="Sentyment GoWork" value={goWorkSentiment} />}
          {googlePlace.reviews.length > 0 && <SentimentCard title="Sentyment Google Maps" value={googleSentiment} />}
        </div>
      )}
    </section>
  );
}

type ReportTab = {
  id: string;
  title: string;
  shortTitle: string;
  content: React.ReactElement;
};

function hasExecutiveOverview(report: CompanyReport): boolean {
  const financials = uniqueFinancials(report.goWork.pages.flatMap((page) => page.financials));
  const goWorkReviews = uniqueGoWorkReviews(report.goWork.pages.flatMap((page) => page.reviews));
  const googlePlace = report.googlePlace;
  const latestFinancial = latestFinancialRow(financials);
  const hasCards =
    googlePlace.rating !== null ||
    goWorkReviews.length > 0 ||
    Boolean(latestFinancial?.revenue) ||
    Boolean(latestFinancial?.grossProfit);
  const hasFinancialChart = financials.some((row) => row.year && (row.revenue || row.grossProfit));
  const hasSentiment = goWorkReviews.length > 0 || googlePlace.reviews.length > 0;

  return hasCards || hasFinancialChart || hasSentiment;
}

type FactRow = {
  category: string;
  label: string;
  value: string;
};

function CompanyProfileSection({ report }: { report: CompanyReport }) {
  const rows = buildProfileRows(report);

  return (
    <div className="space-y-5">
      <FactsTable rows={rows} />
      {report.krs?.status && report.krs.status !== "found" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          KRS OpenAPI: {formatKrsStatus(report.krs.status)}
          {report.krs.message ? ` - ${report.krs.message}` : ""}
        </div>
      )}
    </div>
  );
}

function BusinessSection({ report, rows }: { report: CompanyReport; rows: FactRow[] }) {
  const activities = uniqueActivities(report.krs?.activities ?? []);

  return (
    <div className="space-y-5">
      <FactsTable rows={rows} />
      {activities.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900">PKD</p>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-gray-600">
                  <Header>Typ</Header>
                  <Header>Kod</Header>
                  <Header>Opis</Header>
                </tr>
              </thead>
              <tbody>
                {activities.slice(0, 16).map((activity, index) => (
                  <tr key={`${activity.code}-${activity.description}-${index}`} className="align-top">
                    <Cell strong>{activity.isMain ? "przeważająca" : "pozostała"}</Cell>
                    <Cell>{activity.code}</Cell>
                    <Cell>{activity.description}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StructureSection({ report, rows }: { report: CompanyReport; rows: FactRow[] }) {
  return (
    <div className="space-y-5">
      <FactsTable rows={rows} />
      <div className="grid gap-5 lg:grid-cols-2">
        {report.krs?.boardMembers.length > 0 && (
          <PeopleTable title="Zarząd / reprezentacja" people={report.krs.boardMembers} />
        )}
        {report.krs?.supervisoryBoardMembers.length > 0 && (
          <PeopleTable title="Rada nadzorcza / organ nadzoru" people={report.krs.supervisoryBoardMembers} />
        )}
      </div>
      {report.krs?.shareholders.length > 0 && (
        <FactsTable title="Struktura własnościowa" rows={krsFactsToRows(report.krs.shareholders)} />
      )}
      {report.krs?.branches.length > 0 && (
        <FactsTable title="Oddziały / obszar działania" rows={krsFactsToRows(report.krs.branches)} />
      )}
      {report.krs?.transformations.length > 0 && (
        <FactsTable title="Fuzje, przejęcia, przekształcenia" rows={krsFactsToRows(report.krs.transformations)} />
      )}
    </div>
  );
}

function FinancialSection({ report }: { report: CompanyReport }) {
  const financials = uniqueFinancials(report.goWork.pages.flatMap((page) => page.financials));
  const filings = uniqueFilings(report.krs?.filings ?? []);

  return (
    <div className="space-y-5">
      {financials.length > 0 && <FinancialChart financials={financials} />}

      {financials.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900">Przychody i wynik</p>
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

      {filings.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900">Dokumenty finansowe złożone w KRS</p>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-gray-600">
                  <Header>Dokument</Header>
                  <Header>Data złożenia</Header>
                  <Header>Okres</Header>
                </tr>
              </thead>
              <tbody>
                {filings.slice(0, 12).map((filing, index) => (
                  <tr key={`${filing.type}-${filing.period}-${index}`} className="align-top">
                    <Cell strong>{filing.type}</Cell>
                    <Cell>{filing.filedAt}</Cell>
                    <Cell>{filing.period}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function PresenceSection({ report, rows }: { report: CompanyReport; rows: FactRow[] }) {
  const digitalRows = uniqueDigitalRows(report.digitalPresence.rows);
  const openingHours = uniqueStrings(report.googlePlace.openingHours);

  return (
    <div className="space-y-5">
      <FactsTable rows={rows} />

      {digitalRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900">Kanały online</p>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-gray-600">
                  <Header>Platforma</Header>
                  <Header>Adres</Header>
                  <Header>Informacje</Header>
                </tr>
              </thead>
              <tbody>
                {digitalRows.map((row, index) => (
                  <tr key={`${row.platform}-${row.address}-${index}`} className="align-top">
                    <Cell strong>{row.platform}</Cell>
                    <Cell>{renderMaybeLink(row.address)}</Cell>
                    <Cell>{row.details}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {openingHours.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-900">Godziny otwarcia</p>
          <ul className="grid gap-1 text-sm text-gray-700 md:grid-cols-2">
            {openingHours.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReputationSection({ report }: { report: CompanyReport }) {
  const place = report.googlePlace;
  const goWorkReviews = uniqueGoWorkReviews(report.goWork.pages.flatMap((page) => page.reviews));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {place.rating !== null && (
          <RatingCard title="Google Maps" subtitle="klienci" rating={place.rating} count={place.reviewCount} tone="blue" />
        )}
        {goWorkReviews.length > 0 && (
          <RatingCard
            title="GoWork"
            subtitle="pracownicy i kandydaci"
            rating={calculateGoWorkRating(goWorkReviews).rating}
            count={calculateGoWorkRating(goWorkReviews).count}
            tone="red"
          />
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {goWorkReviews.length > 0 && <SentimentCard title="Sentyment GoWork" value={summarizeGoWorkSentiment(goWorkReviews)} />}
        {place.reviews.length > 0 && <SentimentCard title="Sentyment Google Maps" value={summarizeGoogleSentiment(place.reviews)} />}
      </div>

      {goWorkReviews.length > 0 && <GoWorkReviewsTable reviews={goWorkReviews} />}

      <div className="grid gap-5 lg:grid-cols-2">
        {place.positiveReviews.length > 0 && (
          <ReviewsList title="Pozytywne opinie Google" reviews={place.positiveReviews} tone="positive" />
        )}
        {place.negativeReviews.length > 0 && (
          <ReviewsList title="Negatywne opinie Google" reviews={place.negativeReviews} tone="negative" />
        )}
      </div>
    </div>
  );
}

function GoWorkReviewsTable({
  reviews,
}: {
  reviews: Array<{
    author: string;
    date: string;
    type: string;
    sentiment: "positive" | "negative" | "neutral" | "unknown";
    text: string;
    companyReply: string;
  }>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-900">Opinie i wpisy GoWork</p>
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
  );
}

function FactsTable({ rows, title }: { rows: FactRow[]; title?: string }) {
  const visibleRows = uniqueFactRows(rows);
  if (visibleRows.length === 0) return null;

  return (
    <div className="space-y-2">
      {title && <p className="text-sm font-medium text-gray-900">{title}</p>}
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-gray-100 text-left text-gray-600">
              <Header>Kategoria</Header>
              <Header>Informacja</Header>
              <Header>Wartość</Header>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={`${row.category}-${row.label}-${index}`} className="align-top">
                <Cell>{row.category}</Cell>
                <Cell strong>{row.label}</Cell>
                <Cell>{renderMaybeLink(row.value)}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildProfileRows(report: CompanyReport): FactRow[] {
  const registry = report.registry.rows[0];
  return uniqueFactRows([
    row("Identyfikacja", "Nazwa", registry?.name || getKrsFact(report, "Nazwa")),
    row("Identyfikacja", "NIP", registry?.nip || getKrsFact(report, "NIP")),
    row("Identyfikacja", "REGON", registry?.regon || getKrsFact(report, "REGON")),
    row("Identyfikacja", "KRS", registry?.krs || report.krs?.krs || getKrsFact(report, "KRS")),
    row("Rejestr", "Forma prawna", registry?.legalForm || getKrsFact(report, "Forma prawna")),
    row("Rejestr", "Data rejestracji w KRS", registry?.registrationDate || getKrsFact(report, "Data rejestracji w KRS")),
    row("Rejestr", "Kapitał zakładowy", registry?.shareCapital || getKrsFact(report, "Kapitał zakładowy")),
    row("Adres", "Siedziba", getKrsFact(report, "Siedziba")),
    row("Adres", "Adres rejestrowy", registry?.address || getKrsFact(report, "Adres")),
    row("Kontakt", "Strona WWW", firstValue(getKrsFact(report, "WWW według KRS"), report.websiteFacts?.url, report.googlePlace.websiteUri)),
    row("Zmiany", "Ostatni wpis KRS", [
      getKrsFact(report, "Data ostatniego wpisu"),
      getKrsFact(report, "Sygnatura ostatniego wpisu"),
    ].filter(Boolean).join(" - ")),
  ]);
}

function buildBusinessRows(report: CompanyReport): FactRow[] {
  const registry = report.registry.rows[0];
  const websiteFacts = report.websiteFacts?.facts ?? [];
  const selectedWebsiteFacts = websiteFacts.filter((fact) =>
    includesAny(`${fact.category} ${fact.label}`, ["branża", "specjalizacja", "model", "rynek", "obszar", "produkt", "usług"])
  );

  return uniqueFactRows([
    row("Branża", "Główna działalność", registry?.mainActivity),
    ...krsFactsToRows(report.krs?.facts.filter((fact) =>
      ["Czas na jaki utworzono podmiot", "Sposób powstania", "Opis powstania"].includes(fact.label)
    ) ?? []),
    ...selectedWebsiteFacts.map((fact) => row(fact.category || "Strona firmowa", fact.label || fact.category, fact.value)),
  ]);
}

function buildStructureRows(report: CompanyReport): FactRow[] {
  const krsFacts = report.krs?.facts ?? [];
  return uniqueFactRows([
    ...krsFactsToRows(krsFacts.filter((fact) =>
      ["Sposób reprezentacji", "Liczba akcji/udziałów", "Wartość jednej akcji/udziału"].includes(fact.label)
    )),
    ...krsFactsToRows(report.krs?.recentChanges ?? []),
  ]);
}

function buildPresenceRows(report: CompanyReport): FactRow[] {
  const place = report.googlePlace;
  return uniqueFactRows([
    row("Kontakt", "Telefon", place.nationalPhoneNumber),
    row("Kontakt", "Strona WWW", firstValue(report.websiteFacts?.url, place.websiteUri, getKrsFact(report, "WWW według KRS"))),
    row("Kontakt", "Google Maps", place.mapsUrl),
    row("Lokalizacja", "Nazwa w Google Maps", place.name),
    row("Lokalizacja", "Adres Google Maps", place.address),
    row("Lokalizacja", "Status Google", place.businessStatus),
    row("Reputacja", "Ocena Google Maps", formatRating(place.rating, place.reviewCount)),
  ]);
}

function buildWebsiteRows(report: CompanyReport): FactRow[] {
  const alreadyShown = new Set([
    "branża",
    "specjalizacja",
    "model",
    "rynek",
    "obszar",
    "produkt",
    "usług",
  ]);
  return uniqueFactRows(
    (report.websiteFacts?.facts ?? [])
      .filter((fact) => !Array.from(alreadyShown).some((term) => `${fact.category} ${fact.label}`.toLowerCase().includes(term)))
      .map((fact) => row(fact.category || "Strona firmowa", fact.label || fact.category, fact.value))
  );
}

function krsFactsToRows(facts: Array<{ category: string; label: string; value: string }>): FactRow[] {
  return facts.map((fact) => row(fact.category, fact.label, fact.value)).filter((item): item is FactRow => Boolean(item));
}

function row(category: string, label: string, value: string | null | undefined): FactRow | null {
  const cleaned = cleanValue(value);
  return cleaned ? { category, label, value: cleaned } : null;
}

function uniqueFactRows(rows: Array<FactRow | null | undefined>): FactRow[] {
  const seenLabels = new Set<string>();
  const seenValues = new Set<string>();
  const result: FactRow[] = [];

  for (const row of rows) {
    if (!row?.value) continue;
    const labelKey = normalizeForCompare(`${row.category}:${row.label}`);
    const valueKey = normalizeForCompare(row.value);
    if (seenLabels.has(labelKey) || seenValues.has(valueKey)) continue;
    seenLabels.add(labelKey);
    seenValues.add(valueKey);
    result.push(row);
  }

  return result;
}

function uniqueActivities(activities: Array<{ code: string; description: string; isMain: boolean }>) {
  const seen = new Set<string>();
  return activities.filter((activity) => {
    const key = normalizeForCompare(`${activity.code}:${activity.description}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueDigitalRows(rows: CompanyReport["digitalPresence"]["rows"]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.platform && !row.address && !row.details) return false;
    const key = normalizeForCompare(`${row.platform}:${row.address}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueFinancials(rows: Array<{ year: string; revenue: string; grossProfit: string }>) {
  const seen = new Set<string>();
  return rows
    .filter((row) => row.year && (row.revenue || row.grossProfit))
    .filter((row) => {
      const key = normalizeForCompare(`${row.year}:${row.revenue}:${row.grossProfit}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function uniqueGoWorkReviews<T extends { author?: string; date?: string; type?: string; text: string }>(reviews: T[]): T[] {
  const seen = new Set<string>();
  return reviews.filter((review) => {
    const textKey = normalizeForCompare(review.text).slice(0, 300);
    if (!textKey || isSyntheticGoWorkReview(review)) return false;
    const key = normalizeForCompare(`${review.author}:${review.date}:${review.type}:${textKey}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSyntheticGoWorkReview(review: { author?: string; type?: string; text: string }): boolean {
  const author = normalizeForCompare(review.author ?? "");
  const type = normalizeForCompare(review.type ?? "");
  const text = normalizeForCompare(review.text);
  return (
    type.includes("asystent ai") ||
    author.includes("asystent ai") ||
    text.startsWith("jakie jest wynagrodzenie") ||
    text.startsWith("jak wyglada praca") ||
    text.startsWith("czy firma sprawdza kompetencje") ||
    text.startsWith("w jaki sposob firma wdraza") ||
    text.startsWith("czy kultura pracy sprzyja") ||
    text.startsWith("czy przewidziane sa sciezki")
  );
}

function uniqueFilings(rows: CompanyReport["krs"]["filings"]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = normalizeForCompare(`${row.type}:${row.filedAt}:${row.period}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeForCompare(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getKrsFact(report: CompanyReport, label: string): string {
  return report.krs?.facts.find((fact) => fact.label === label)?.value ?? "";
}

function firstValue(...values: Array<string | null | undefined>): string {
  return values.map(cleanValue).find(Boolean) ?? "";
}

function cleanValue(value: string | null | undefined): string {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "brak danych") return "";
  return cleaned;
}

function normalizeForCompare(value: string): string {
  return cleanValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/[.,;:()\s]+/g, " ")
    .trim();
}

function includesAny(value: string, patterns: string[]): boolean {
  const normalized = value.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
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
    <div className="rounded-md border border-gray-200 p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-gray-900">Przychód i wynik brutto</p>
        <div className="flex gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-blue-700" />Przychód</span>
          <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-emerald-700" />Zysk / strata</span>
        </div>
      </div>
      <div className="flex min-h-56 items-end gap-4 overflow-x-auto border-b border-gray-200 pb-3">
        {parsed.map((row) => (
          <div key={row.year} className="flex min-w-24 flex-1 flex-col items-center gap-2">
            <div className="flex h-44 items-end gap-3">
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
  const height = value === null ? 0 : Math.max(6, Math.round((Math.abs(value) / maxValue) * 150));
  const isNegative = (value ?? 0) < 0;

  return (
    <div className="flex h-44 w-10 flex-col items-center justify-end gap-1">
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
    <div className={`rounded-md border p-3 ${color}`}>
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

function FinancialMetricCard({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" }) {
  const color = tone === "blue" ? "border-blue-200 bg-blue-50 text-blue-950" : "border-emerald-200 bg-emerald-50 text-emerald-950";

  return (
    <div className={`rounded-md border p-3 ${color}`}>
      <p className="text-xs opacity-75">{label.trim()}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function SentimentCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
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

function KrsSection({ report }: { report: CompanyReport }) {
  const krs = report.krs;
  if (!krs || krs.status !== "found") {
    return (
      <div className="space-y-3 text-sm">
        <InfoRow label="Status" value={formatKrsStatus(krs?.status)} />
        <InfoRow label="KRS" value={krs?.krs} />
        <InfoRow label="Źródło" value={krs?.sourceUrl} link />
        <div className="text-gray-700">{krs?.message || "Brak danych z KRS OpenAPI"}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 text-sm md:grid-cols-[140px_1fr]">
        <div className="text-gray-500">Odpis aktualny</div>
        <div className="font-medium text-gray-900">{krs.sourceUrl ? renderMaybeLink(krs.sourceUrl) : <Empty />}</div>
        <div className="text-gray-500">Odpis pełny</div>
        <div className="font-medium text-gray-900">{krs.fullSourceUrl ? renderMaybeLink(krs.fullSourceUrl) : <Empty />}</div>
      </div>

      <SimpleFactsTable facts={krs.facts} />

      <div className="grid gap-5 lg:grid-cols-2">
        <PeopleTable title="Zarząd / reprezentacja" people={krs.boardMembers} />
        <PeopleTable title="Rada nadzorcza / organ nadzoru" people={krs.supervisoryBoardMembers} />
      </div>

      {krs.activities.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900">PKD / działalność</p>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-gray-600">
                  <Header>Typ</Header>
                  <Header>Kod</Header>
                  <Header>Opis</Header>
                </tr>
              </thead>
              <tbody>
                {krs.activities.map((activity, index) => (
                  <tr key={`${activity.code}-${index}`} className="align-top">
                    <Cell strong>{activity.isMain ? "przeważająca" : "pozostała"}</Cell>
                    <Cell>{activity.code}</Cell>
                    <Cell>{activity.description}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SimpleFactsTable title="Oddziały / obszar działania" facts={krs.branches} />
      <SimpleFactsTable title="Struktura własnościowa" facts={krs.shareholders} />
      <SimpleFactsTable title="Fuzje, przejęcia, przekształcenia" facts={krs.transformations} />

      {krs.filings.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900">Wzmianki o dokumentach finansowych</p>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-gray-600">
                  <Header>Dokument</Header>
                  <Header>Data złożenia</Header>
                  <Header>Okres</Header>
                </tr>
              </thead>
              <tbody>
                {krs.filings.map((filing, index) => (
                  <tr key={`${filing.type}-${filing.period}-${index}`} className="align-top">
                    <Cell strong>{filing.type}</Cell>
                    <Cell>{filing.filedAt}</Cell>
                    <Cell>{filing.period}</Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleFactsTable({ facts, title }: { facts: Array<{ category: string; label: string; value: string }>; title?: string }) {
  if (facts.length === 0) return null;

  return (
    <div className="space-y-2">
      {title && <p className="text-sm font-medium text-gray-900">{title}</p>}
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-gray-100 text-left text-gray-600">
              <Header>Kategoria</Header>
              <Header>Informacja</Header>
              <Header>Wartość</Header>
            </tr>
          </thead>
          <tbody>
            {facts.map((fact, index) => (
              <tr key={`${fact.category}-${fact.label}-${index}`} className="align-top">
                <Cell>{fact.category}</Cell>
                <Cell strong>{fact.label}</Cell>
                <Cell>{renderMaybeLink(fact.value)}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PeopleTable({
  title,
  people,
}: {
  title: string;
  people: Array<{ role: string; name: string; function: string; suspended: boolean | null }>;
}) {
  if (people.length === 0) return <div><p className="mb-2 text-sm font-medium text-gray-900">{title}</p><Empty /></div>;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-gray-100 text-left text-gray-600">
              <Header>Organ</Header>
              <Header>Osoba</Header>
              <Header>Funkcja</Header>
              <Header>Status</Header>
            </tr>
          </thead>
          <tbody>
            {people.map((person, index) => (
              <tr key={`${person.role}-${person.name}-${index}`} className="align-top">
                <Cell>{person.role}</Cell>
                <Cell strong>{person.name}</Cell>
                <Cell>{person.function}</Cell>
                <Cell>{person.suspended === null ? "" : person.suspended ? "zawieszona" : "aktywna"}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const reviews = uniqueGoWorkReviews(pages.flatMap((page) => page.reviews.map((review) => ({ ...review, pageTitle: page.title }))));
  const financials = uniqueFinancials(pages.flatMap((page) => page.financials));

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

function formatKrsStatus(status: "found" | "not_found" | "skipped" | "error" | undefined): string | null {
  if (!status) return null;
  if (status === "found") return "znaleziono";
  if (status === "not_found") return "nie znaleziono";
  if (status === "skipped") return "pominięto";
  return "błąd";
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

function latestFinancialRow(financials: Array<{ year: string; revenue: string; grossProfit: string }>) {
  return [...financials]
    .filter((row) => row.year && (row.revenue || row.grossProfit))
    .sort((a, b) => Number(b.year.replace(/\D/g, "")) - Number(a.year.replace(/\D/g, "")))[0] ?? null;
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
  const uniqueReviews = uniqueGoWorkReviews(reviews);
  if (uniqueReviews.length === 0) return "Brak pobranych opinii GoWork do oceny sentymentu.";
  const counts = sentimentCounts(uniqueReviews);
  const assessment = cautiousSentimentAssessment(counts, uniqueReviews.length);
  const sample = pickRiskSample(uniqueReviews);

  return `Próba GoWork: ${uniqueReviews.length} wpisów. Rozkład: ${formatSentimentCounts(counts)}. Ocena ostrożna: ${assessment}. ${sample ? `Istotny sygnał: ${sample}` : "Próbka jest ograniczona i może nie być reprezentatywna."}`;
}

function summarizeGoogleSentiment(reviews: Array<{ rating: number | null; text: string }>): string {
  if (reviews.length === 0) return "Brak pobranych opinii Google Maps do oceny sentymentu.";
  const rated = reviews.filter((review) => review.rating !== null);
  const positive = reviews.filter((review) => (review.rating ?? 0) >= 4).length;
  const negative = reviews.filter((review) => (review.rating ?? 5) <= 2).length;
  const neutral = reviews.length - positive - negative;
  const total = reviews.length;
  const average = rated.length > 0 ? rated.reduce((sum, review) => sum + (review.rating ?? 0), 0) / rated.length : null;
  const sample = reviews.find((review) => (review.rating ?? 5) <= 2 && review.text)?.text ?? reviews.find((review) => review.text)?.text ?? "";

  return `Próba Google Maps: ${total} opinii${average !== null ? `, średnia ${average.toFixed(1)}/5` : ""}. Rozkład: ${positive} pozytywne, ${neutral} neutralne, ${negative} negatywne. To sygnał z małej próbki, nie pełny obraz reputacji.${sample ? ` Przykład: ${sample}` : ""}`;
}

function formatSentimentCounts(counts: Record<"positive" | "negative" | "neutral" | "unknown", number>): string {
  return `${counts.positive} pozytywne, ${counts.neutral} neutralne, ${counts.negative} negatywne, ${counts.unknown} niejednoznaczne`;
}

function cautiousSentimentAssessment(
  counts: Record<"positive" | "negative" | "neutral" | "unknown", number>,
  total: number
): string {
  const sorted = (Object.entries(counts) as Array<["positive" | "negative" | "neutral" | "unknown", number]>)
    .filter(([sentiment]) => sentiment !== "unknown")
    .sort((a, b) => b[1] - a[1]);
  const [dominant, dominantCount] = sorted[0] ?? ["unknown", 0];
  const runnerUpCount = sorted[1]?.[1] ?? 0;
  const share = dominantCount / Math.max(1, total);

  if (total < 5) return `próbka jest mała, więc wynik traktuję jako jakościowy sygnał, nie ocenę firmy`;
  if (counts.negative > 0 && counts.positive > 0 && (share < 0.7 || dominantCount - runnerUpCount < 2)) {
    return "obraz jest mieszany; warto czytać treść wpisów, bo same proporcje mogą maskować silne ryzyka";
  }
  if (dominant === "positive") return "przewaga pozytywnych wpisów w pobranej próbce, z zastrzeżeniem możliwej selekcji źródła";
  if (dominant === "negative") return "przewaga negatywnych wpisów w pobranej próbce; sygnały ryzyka wymagają weryfikacji w treści";
  if (dominant === "neutral") return "większość wpisów ma charakter neutralny lub informacyjny";
  return "część wpisów nie ma jednoznacznego wydźwięku";
}

function pickRiskSample(
  reviews: Array<{ sentiment: "positive" | "negative" | "neutral" | "unknown"; text: string }>
): string {
  return (
    reviews.find((review) => review.sentiment === "negative" && review.text)?.text ??
    reviews.find((review) => review.sentiment === "neutral" && review.text)?.text ??
    reviews.find((review) => review.text)?.text ??
    ""
  );
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
              <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                <span className="font-medium text-gray-900">{debug.steps?.length ?? 0}</span> osobnych kroków debug:
                każde zapytanie i każda odpowiedź są w oddzielnym bloku.
              </div>

              {debug.steps?.map((step, index) => (
                <DebugStepCard key={`${step.name}-${index}`} index={index} step={step} />
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

function DebugStepCard({
  index,
  step,
}: {
  index: number;
  step: NonNullable<CompanyReport["debug"]>["steps"][number];
}) {
  return (
    <div className="rounded-md border border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {index + 1}. {step.name}
          </p>
          <p className="text-xs text-gray-500">{debugSourceLabel(step.name)}</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <DebugPayloadDetails title="Input / zapytanie" value={step.request} defaultOpen={index === 0} />
        <DebugPayloadDetails title="Output / odpowiedź" value={step.response} defaultOpen={index === 0} />
      </div>
    </div>
  );
}

function DebugPayloadDetails({
  title,
  value,
  defaultOpen,
}: {
  title: string;
  value: unknown;
  defaultOpen?: boolean;
}) {
  const serialized = stringifyDebugValue(value);

  return (
    <details open={defaultOpen} className="rounded-md border border-gray-200 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
        {title}
      </summary>
      <pre className="max-h-96 overflow-auto border-t border-gray-200 bg-gray-950 p-3 text-xs leading-5 text-gray-100 whitespace-pre-wrap">
        {serialized}
      </pre>
    </details>
  );
}

function DebugBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <pre className="max-h-96 overflow-auto rounded-md border border-gray-200 bg-gray-950 p-3 text-xs leading-5 text-gray-100 whitespace-pre-wrap">
        {stringifyDebugValue(value)}
      </pre>
    </div>
  );
}

function stringifyDebugValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function debugSourceLabel(name: string): string {
  if (name.startsWith("Gemini")) return "AI: Gemini";
  if (name.startsWith("Perplexity")) return "AI: Perplexity";
  if (name.startsWith("Firecrawl")) return "Scraping: Firecrawl";
  if (name.startsWith("Google Places")) return "API: Google Places";
  if (name.startsWith("KRS")) return "API: KRS";
  return "Debug";
}
