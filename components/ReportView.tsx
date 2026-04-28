"use client";

import type { CompanyReport } from "@/lib/types";

export function ReportView({ report }: { report: CompanyReport }) {
  const registry = report.registry.rows[0];
  const place = report.googlePlace;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">Raport dla NIP</p>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-950">{report.input.nip}</h2>
          <p className="mt-1 text-sm text-gray-500">
            Wygenerowano: {new Date(report.generatedAt).toLocaleString("pl-PL")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 print:hidden"
        >
          Drukuj
        </button>
      </div>

      <Section title="1. Dane rejestrowe">
        <RegistryTable report={report} />
      </Section>

      <Section title="2. Strona i social media">
        <DigitalPresenceTable report={report} />
      </Section>

      <Section title="3. Wizytówka Google Maps">
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
          <p className="mb-2 text-sm font-medium text-gray-700">Ostatnie opinie</p>
          {place.reviews.length > 0 ? (
            <div className="space-y-3">
              {place.reviews.map((review, index) => (
                <div key={index} className="rounded-md border border-gray-200 bg-gray-50 p-3">
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
      </Section>

      {registry?.name && (
        <p className="text-xs text-gray-400 print:hidden">
          Zapytanie Google Places: {[registry.name, registry.address].filter(Boolean).join(" ")}
        </p>
      )}
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
            <Header>KRS</Header>
            <Header>Adres</Header>
            <Header>Forma prawna</Header>
            <Header>Kapitał zakładowy</Header>
            <Header>Data rejestracji</Header>
            <Header>Główna działalność</Header>
          </tr>
        </thead>
        <tbody>
          {report.registry.rows.map((row, index) => (
            <tr key={index} className="align-top">
              <Cell strong>{row.name}</Cell>
              <Cell>{row.krs}</Cell>
              <Cell>{row.address}</Cell>
              <Cell>{row.legalForm}</Cell>
              <Cell>{row.shareCapital}</Cell>
              <Cell>{row.registrationDate}</Cell>
              <Cell>{row.mainActivity}</Cell>
            </tr>
          ))}
        </tbody>
      </table>
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
