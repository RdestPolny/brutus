"use client";

import type { LeadBrief, DataField, LeadScore, RiskLevel, FieldStatus, DecisionMaker } from "@/lib/types";

const STATUS_LABELS: Record<FieldStatus, string> = {
  confirmed: "Potwierdzone",
  inferred: "Wywnioskowane",
  missing: "Brak danych",
  conflicting: "Sprzeczne dane",
};

const STATUS_COLORS: Record<FieldStatus, string> = {
  confirmed: "bg-green-100 text-green-800",
  inferred: "bg-yellow-100 text-yellow-800",
  missing: "bg-gray-100 text-gray-500",
  conflicting: "bg-orange-100 text-orange-800",
};

const RISK_COLORS: Record<RiskLevel, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-red-100 text-red-700",
};

const RECOMMENDATION_CONFIG = {
  proceed: { label: "Kontynuuj", color: "bg-green-500", text: "text-green-700 bg-green-50 border-green-200" },
  qualify_further: { label: "Kwalifikuj dalej", color: "bg-yellow-400", text: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  manual_review: { label: "Ręczna weryfikacja", color: "bg-orange-400", text: "text-orange-700 bg-orange-50 border-orange-200" },
  skip: { label: "Pomiń", color: "bg-red-400", text: "text-red-700 bg-red-50 border-red-200" },
};

function FieldRow({ label, field }: { label: string; field: DataField<unknown> }) {
  const status = field.status;
  const isMissing = status === "missing" || field.value === null;

  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      <div className="w-40 shrink-0 text-sm text-gray-500">{label}</div>
      <div className="flex-1">
        {isMissing ? (
          <span className="text-sm text-gray-400 italic">— brak danych</span>
        ) : (
          <div className="text-sm text-gray-900">
            {Array.isArray(field.value)
              ? (field.value as string[]).map((v, i) => (
                  <div key={i} className="truncate">{v}</div>
                ))
              : typeof field.value === "boolean"
              ? field.value ? "Tak" : "Nie"
              : String(field.value)}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[status]}`}>
            {STATUS_LABELS[status]}
          </span>
          {field.confidence > 0 && !isMissing && (
            <span className="text-xs text-gray-400">{Math.round(field.confidence * 100)}%</span>
          )}
        </div>
        {field.evidence_excerpt && !isMissing && (
          <p className="text-xs text-gray-400 mt-1 italic line-clamp-2">{field.evidence_excerpt}</p>
        )}
      </div>
    </div>
  );
}

function ScoreBar({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const displayColor = inverse
    ? value < 30 ? "bg-green-400" : value < 60 ? "bg-yellow-400" : "bg-red-400"
    : value >= 70 ? "bg-green-400" : value >= 40 ? "bg-yellow-400" : "bg-red-400";

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${displayColor}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

const SOCIAL_ICONS: Record<string, string> = {
  linkedin: "in",
  facebook: "fb",
  instagram: "ig",
  youtube: "yt",
  tiktok: "tt",
  twitter: "tw",
  x: "x",
};

function SocialLinks({ field }: { field: DataField<string[]> }) {
  if (!field.value || field.value.length === 0) {
    return <span className="text-sm text-gray-400 italic">— brak danych</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {field.value.map((entry, i) => {
        const [platform, ...rest] = entry.split(": ");
        const url = rest.join(": ").trim();
        const label = SOCIAL_ICONS[platform.toLowerCase()] ?? platform;
        return (
          <a
            key={i}
            href={url.startsWith("http") ? url : `https://${url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100"
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}

function EmployeesTable({ field }: { field: DataField<DecisionMaker[]> }) {
  if (!field.value || field.value.length === 0) {
    return <span className="text-sm text-gray-400 italic">— brak danych</span>;
  }

  return (
    <table className="w-full text-sm mt-1">
      <thead>
        <tr className="text-left text-gray-500 border-b">
          <th className="pb-1 font-normal">Imię i nazwisko</th>
          <th className="pb-1 font-normal">Stanowisko</th>
          <th className="pb-1 font-normal">LinkedIn</th>
        </tr>
      </thead>
      <tbody>
        {field.value.map((p, i) => (
          <tr key={i} className="border-b border-gray-100">
            <td className="py-1.5 font-medium">{p.name}</td>
            <td className="py-1.5 text-gray-600">{p.role}</td>
            <td className="py-1.5">
              {p.linkedinUrl ? (
                <a
                  href={p.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  profil →
                </a>
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ScoreCard({ score }: { score: LeadScore }) {
  const config = RECOMMENDATION_CONFIG[score.recommendation];
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-900 border-b border-gray-700">
        <h3 className="font-semibold text-white">Lead Score</h3>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative w-24 h-24 shrink-0">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={score.total >= 70 ? "#22c55e" : score.total >= 40 ? "#eab308" : "#ef4444"}
                strokeWidth="3"
                strokeDasharray={`${score.total} ${100 - score.total}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold">{score.total}</span>
            </div>
          </div>
          <div>
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${config.text}`}>
              {config.label}
            </div>
            <p className="text-sm text-gray-600 mt-2">{score.recommendation_reason}</p>
          </div>
        </div>
        <div className="space-y-3">
          <ScoreBar label="Fit (dopasowanie)" value={score.fit} />
          <ScoreBar label="Readiness (gotowość)" value={score.readiness} />
          <ScoreBar label="Authority (decyzyjność)" value={score.authority} />
          <ScoreBar label="Risk (ryzyko)" value={score.risk} inverse />
        </div>
      </div>
    </div>
  );
}

export function BriefView({ brief }: { brief: LeadBrief }) {
  const handlePrint = () => window.print();
  const handleCopy = () => {
    const text = JSON.stringify(brief, null, 2);
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{brief.input.companyName}</h2>
          <p className="text-gray-500">{brief.input.domain}</p>
          {brief.input.contactName && (
            <p className="text-sm text-gray-400 mt-1">
              Rozmówca: {brief.input.contactName}
              {brief.input.contactTitle && ` · ${brief.input.contactTitle}`}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Wygenerowano: {new Date(brief.generated_at).toLocaleString("pl-PL")}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Kopiuj JSON
          </button>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700"
          >
            Drukuj brief
          </button>
        </div>
      </div>

      {/* Score card — prominently first */}
      <ScoreCard score={brief.score} />

      {/* Company summary */}
      <Section title="Profil firmy">
        <p className="text-sm text-gray-700 mb-4">{brief.company_profile.summary}</p>
        <div>
          <FieldRow label="Branża" field={brief.company_profile.industry} />
          <FieldRow label="Specjalizacja" field={brief.company_profile.specialization} />
          <FieldRow label="Zasięg rynku" field={brief.company_profile.market_scope} />
          <FieldRow label="Rok założenia" field={brief.company_profile.founded_year as DataField<unknown>} />
          <FieldRow label="Pracownicy" field={brief.company_profile.employee_count} />
          <FieldRow label="Struktura" field={brief.company_profile.company_structure} />
          <FieldRow label="Model biznesowy" field={brief.company_profile.business_model} />
          <FieldRow label="Adres / telefon" field={brief.company_profile.contact_address} />
          <FieldRow label="Domena (WHOIS)" field={brief.company_profile.website_domain_registered} />
          <div className="flex items-start gap-3 py-2 border-b border-gray-100">
            <div className="w-40 shrink-0 text-sm text-gray-500">Social media</div>
            <div className="flex-1">
              <SocialLinks field={brief.company_profile.social_links} />
            </div>
          </div>
          <FieldRow label="Google Maps" field={brief.company_profile.google_maps_link} />
        </div>
      </Section>

      {/* Growth signals */}
      <Section title="Sygnały wzrostu">
        <p className="text-sm text-gray-700 mb-4">{brief.growth.summary}</p>
        {brief.growth.signals.length > 0 && (
          <div className="space-y-2 mb-4">
            {brief.growth.signals.map((s, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${
                  s.relevance === "high" ? "bg-green-100 text-green-700" :
                  s.relevance === "medium" ? "bg-yellow-100 text-yellow-700" :
                  "bg-gray-100 text-gray-600"
                }`}>{s.relevance}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.type}</p>
                  <p className="text-sm text-gray-600">{s.description}</p>
                  {s.date && <p className="text-xs text-gray-400">{s.date}</p>}
                  {s.source_url && (
                    <a href={s.source_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline truncate block max-w-sm">
                      {s.source_url}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {brief.growth.open_vacancies.value && brief.growth.open_vacancies.value.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium text-gray-700 mb-1">Otwarte wakaty:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              {brief.growth.open_vacancies.value.map((v, i) => <li key={i} className="flex gap-1"><span>·</span>{v}</li>)}
            </ul>
          </div>
        )}
      </Section>

      {/* Risk signals */}
      <Section title="Sygnały ryzyka">
        <p className="text-sm text-gray-700 mb-4">{brief.risks.summary}</p>
        {brief.risks.signals.length > 0 && (
          <div className="space-y-2 mb-4">
            {brief.risks.signals.map((s, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${RISK_COLORS[s.level]}`}>
                  {s.level}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.type}</p>
                  <p className="text-sm text-gray-600">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {brief.risks.financial.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Dane finansowe:</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-1 font-normal">Rok</th>
                  <th className="pb-1 font-normal">Przychody</th>
                  <th className="pb-1 font-normal">Wynik</th>
                  <th className="pb-1 font-normal">Zadłużenie</th>
                  <th className="pb-1 font-normal">Trend</th>
                </tr>
              </thead>
              <tbody>
                {brief.risks.financial.map((f, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1">{f.year}</td>
                    <td className="py-1">{f.revenue ?? "—"}</td>
                    <td className="py-1">{f.profit_loss ?? "—"}</td>
                    <td className="py-1">{f.debt ?? "—"}</td>
                    <td className="py-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        f.trend === "growing" ? "bg-green-100 text-green-700" :
                        f.trend === "declining" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>{f.trend}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">Google</p>
            <p className="text-sm">{brief.risks.reviews.google.value ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Clutch</p>
            <p className="text-sm">{brief.risks.reviews.clutch.value ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Gowork</p>
            <p className="text-sm">{brief.risks.reviews.gowork.value ?? "—"}</p>
          </div>
        </div>
      </Section>

      {/* Decision structure */}
      <Section title="Struktura decyzyjna">
        <p className="text-sm text-gray-700 mb-4">{brief.decision_structure.summary}</p>
        <FieldRow label="Rola rozmówcy" field={brief.decision_structure.contact_role_in_hierarchy} />
        <FieldRow label="Typ decydenta" field={brief.decision_structure.decision_maker_type as DataField<unknown>} />
        <FieldRow label="Dział marketingu" field={brief.decision_structure.marketing_team_size} />
        <FieldRow label="Dział sprzedaży" field={brief.decision_structure.has_sales_team as DataField<unknown>} />
        <FieldRow label="Model sprzedaży" field={brief.decision_structure.sales_model} />
        <FieldRow label="Komitet zakupowy" field={brief.decision_structure.buying_committee_complexity as DataField<unknown>} />
        {brief.decision_structure.key_decision_makers.value &&
          brief.decision_structure.key_decision_makers.value.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Pracownicy / decydenci</p>
              <EmployeesTable field={brief.decision_structure.key_decision_makers} />
            </div>
          )}
      </Section>

      {/* Buying readiness */}
      <Section title="Gotowość zakupowa">
        <p className="text-sm text-gray-700 mb-4">{brief.buying_readiness.summary}</p>
        <FieldRow label="Budżet" field={brief.buying_readiness.budget_signal as DataField<unknown>} />
        <FieldRow label="Pilność" field={brief.buying_readiness.urgency as DataField<unknown>} />
        <FieldRow label="Świadomość problemu" field={brief.buying_readiness.problem_awareness as DataField<unknown>} />
        <FieldRow label="Dojrzałość mktg" field={brief.buying_readiness.marketing_maturity as DataField<unknown>} />
        <FieldRow label="Używał wcześniej" field={brief.buying_readiness.used_similar_solution_before as DataField<unknown>} />
      </Section>

      {/* Recommended questions — call plan */}
      <Section title="Plan rozmowy">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Hipotezy do sprawdzenia</p>
            <ol className="space-y-2">
              {brief.recommended_questions.hypotheses.map((h, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-gray-400 shrink-0 w-5">{i + 1}.</span>
                  <span>{h}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Pytania na call</p>
            <ol className="space-y-2">
              {brief.recommended_questions.questions.map((q, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-gray-400 shrink-0 w-5">{i + 1}.</span>
                  <span>{q}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Spodziewane obiekcje</p>
            <ul className="space-y-2">
              {brief.recommended_questions.expected_objections.map((o, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-red-400 shrink-0">!</span>
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Kąty wejścia sprzedażowego</p>
            <ul className="space-y-2">
              {brief.recommended_questions.sales_angles.map((a, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-green-500 shrink-0">→</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
