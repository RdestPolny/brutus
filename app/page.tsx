"use client";

import { useState } from "react";
import type { LeadBrief, LeadInput } from "@/lib/types";
import { BriefView } from "@/components/BriefView";

export default function Home() {
  const [form, setForm] = useState<LeadInput>({
    companyName: "",
    domain: "",
    nip: "",
    krs: "",
    contactName: "",
    contactTitle: "",
  });
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<LeadBrief | null>(null);
  const [debug, setDebug] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setBrief(null);
    setError(null);

    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = `HTTP ${res.status}`;
        try {
          const err = JSON.parse(text);
          message = err.error || message;
        } catch { /* HTML error page — use status code */ }
        throw new Error(message);
      }

      const data = await res.json();
      const { _debug, ...briefData } = data;
      setBrief(briefData as LeadBrief);
      setDebug(_debug ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nieznany błąd");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Prezesol</h1>
          <p className="text-gray-500 mt-1">Automatyczny brief przed rozmową sprzedażową</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nazwa firmy <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  placeholder="np. Acme Sp. z o.o."
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Domena <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  placeholder="np. acme.pl"
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NIP</label>
                <input
                  type="text"
                  placeholder="np. 1234567890"
                  value={form.nip}
                  onChange={(e) => setForm({ ...form, nip: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KRS</label>
                <input
                  type="text"
                  placeholder="np. 0000123456"
                  value={form.krs}
                  onChange={(e) => setForm({ ...form, krs: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Imię i nazwisko rozmówcy</label>
                <input
                  type="text"
                  placeholder="np. Jan Kowalski"
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stanowisko rozmówcy</label>
                <input
                  type="text"
                  placeholder="np. Dyrektor Marketingu"
                  value={form.contactTitle}
                  onChange={(e) => setForm({ ...form, contactTitle: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full md:w-auto px-6 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Generuję brief... (~60s)" : "Generuj brief"}
              </button>
              {loading && (
                <p className="text-sm text-gray-500 mt-2">
                  Przeszukuję web, weryfikuję dane firmowe i buduję raport...
                </p>
              )}
            </div>
          </form>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
            <strong>Błąd:</strong> {error}
          </div>
        )}

        {/* Brief */}
        {brief && <BriefView brief={brief} debug={debug} />}
      </div>
    </main>
  );
}
