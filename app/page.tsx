"use client";

import { useState } from "react";
import { ReportView } from "@/components/ReportView";
import type { CompanyReport } from "@/lib/types";

export default function Home() {
  const [nip, setNip] = useState("");
  const [officialWebsite, setOfficialWebsite] = useState("");
  const [report, setReport] = useState<CompanyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nip, officialWebsite }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

      setReport(data as CompanyReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nieznany błąd");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950">Prezesol</h1>
          <p className="mt-1 text-sm text-gray-500">Raport firmowy po NIP i sprawdzonej stronie klienta</p>
        </header>

        <section className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
          <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
            <div className="flex-1">
              <label htmlFor="nip" className="mb-1 block text-sm font-medium text-gray-700">
                NIP
              </label>
              <input
                id="nip"
                value={nip}
                onChange={(event) => setNip(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="np. 5250007425"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="officialWebsite" className="mb-1 block text-sm font-medium text-gray-700">
                Sprawdzony adres strony klienta
              </label>
              <input
                id="officialWebsite"
                value={officialWebsite}
                onChange={(event) => setOfficialWebsite(event.target.value)}
                inputMode="url"
                autoComplete="url"
                placeholder="np. https://firma.pl"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-gray-950 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Generuję..." : "Generuj raport"}
            </button>
          </form>
          {loading && (
            <p className="mt-3 text-sm text-gray-500">
              Szukam profilu GoWork po NIP, pobieram odpis KRS, scrapuję podaną stronę klienta i uzupełniam social media.
            </p>
          )}
        </section>

        {error && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>Błąd:</strong> {error}
          </div>
        )}

        {report && <ReportView report={report} />}
      </div>
    </main>
  );
}
