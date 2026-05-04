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
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-base font-semibold text-amber-200 shadow-sm">
                B
              </span>
              <h1 className="font-serif text-4xl font-semibold tracking-tight text-slate-950">
                Brutus
              </h1>
              <span className="rounded-full border border-slate-300 bg-white/70 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-600">
                ver. Alpha 0.19
              </span>
            </div>
            <p className="mt-2 max-w-xl text-sm text-slate-600">
              Lead intelligence dla zespołu sprzedaży — pełny brief firmy w 60 sekund.
            </p>
          </div>
        </header>

        <section className="mb-10 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] backdrop-blur">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
            <div className="flex-1">
              <label htmlFor="nip" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                NIP
              </label>
              <input
                id="nip"
                value={nip}
                onChange={(event) => setNip(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="np. 5250007425"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="officialWebsite" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Sprawdzony adres strony klienta
              </label>
              <input
                id="officialWebsite"
                value={officialWebsite}
                onChange={(event) => setOfficialWebsite(event.target.value)}
                inputMode="url"
                autoComplete="url"
                placeholder="np. https://firma.pl"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Generuję…" : "Generuj raport"}
            </button>
          </form>
          {loading && (
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
              Szukam profilu GoWork, pobieram KRS, scrapuję stronę klienta i uzupełniam research Perplexity.
            </p>
          )}
        </section>

        {error && (
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <strong className="font-semibold">Błąd:</strong> {error}
          </div>
        )}

        {report && <ReportView report={report} />}
      </div>
    </main>
  );
}
