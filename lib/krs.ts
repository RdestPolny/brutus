import type { CompanyRegistryRow, KrsActivity, KrsFact, KrsFiling, KrsPerson, KrsReport } from "./types";

const KRS_API_BASE_URL = process.env.KRS_OPEN_API_URL ?? "https://api-krs.ms.gov.pl/";

export async function fetchKrsReportWithDebug(
  rawKrs: string | null | undefined
): Promise<{ report: KrsReport; request: unknown; response: unknown }> {
  const krs = normalizeKrsNumber(rawKrs);
  if (!krs) {
    return {
      report: emptyKrsReport(null, "skipped", "Brak numeru KRS - oficjalne API KRS nie wspiera wyszukiwania po nazwie ani NIP."),
      request: { skipped: true, reason: "missing KRS number" },
      response: null,
    };
  }

  const currentRequest = buildKrsRequest("OdpisAktualny", krs);
  const fullRequest = buildKrsRequest("OdpisPelny", krs);

  try {
    const [current, full] = await Promise.all([
      fetchKrsJson(currentRequest.url),
      fetchKrsJson(fullRequest.url),
    ]);
    const request = { current: currentRequest, full: fullRequest };
    const response = { current: current.response, full: full.response };

    if (!current.ok) {
      return {
        report: emptyKrsReport(krs, current.status === 404 || current.status === 204 ? "not_found" : "error", current.message),
        request,
        response,
      };
    }

    return {
      report: buildKrsReport(krs, currentRequest.url, full.ok ? fullRequest.url : null, current.data, full.ok ? full.data : null),
      request,
      response,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Nieznany błąd KRS API";
    return {
      report: emptyKrsReport(krs, "error", message),
      request: { current: currentRequest, full: fullRequest },
      response: { error: message },
    };
  }
}

export function mergeRegistryRowsWithKrs(rows: CompanyRegistryRow[], krsReport: KrsReport): CompanyRegistryRow[] {
  if (rows.length === 0 || krsReport.status !== "found") return rows;
  const base = rows[0];
  const facts = new Map(krsReport.facts.map((fact) => [fact.label, fact.value]));
  const mainActivity = krsReport.activities.find((activity) => activity.isMain) ?? krsReport.activities[0];

  return [
    {
      ...base,
      name: facts.get("Nazwa") || base.name,
      nip: facts.get("NIP") || base.nip,
      regon: facts.get("REGON") || base.regon,
      krs: krsReport.krs || base.krs,
      address: facts.get("Adres") || base.address,
      legalForm: facts.get("Forma prawna") || base.legalForm,
      shareCapital: facts.get("Kapitał zakładowy") || base.shareCapital,
      registrationDate: facts.get("Data rejestracji w KRS") || base.registrationDate,
      mainActivity: mainActivity ? `${mainActivity.code} ${mainActivity.description}`.trim() : base.mainActivity,
    },
    ...rows.slice(1),
  ];
}

function buildKrsReport(
  krs: string,
  sourceUrl: string,
  fullSourceUrl: string | null,
  currentData: unknown,
  fullData: unknown
): KrsReport {
  const odpis = asRecord(currentData)?.odpis;
  const odpisRecord = asRecord(odpis);
  const header = asRecord(odpisRecord?.naglowekA);
  const data = asRecord(odpisRecord?.dane);
  const section1 = asRecord(data?.dzial1);
  const section2 = asRecord(data?.dzial2);
  const section3 = asRecord(data?.dzial3);
  const section6 = asRecord(data?.dzial6);
  const entity = asRecord(section1?.danePodmiotu);
  const identifiers = asRecord(entity?.identyfikatory);
  const seatAndAddress = asRecord(section1?.siedzibaIAdres);
  const capital = asRecord(section1?.kapital);
  const founding = asRecord(section1?.sposobPowstaniaPodmiotu);

  const facts: KrsFact[] = compactFacts([
    fact("Dane rejestrowe", "Nazwa", text(entity?.nazwa)),
    fact("Dane rejestrowe", "KRS", text(header?.numerKRS) || krs),
    fact("Dane rejestrowe", "NIP", text(identifiers?.nip)),
    fact("Dane rejestrowe", "REGON", text(identifiers?.regon)),
    fact("Dane rejestrowe", "Forma prawna", text(entity?.formaPrawna)),
    fact("Dane rejestrowe", "Adres", formatAddress(asRecord(seatAndAddress?.adres))),
    fact("Dane rejestrowe", "Siedziba", formatSeat(asRecord(seatAndAddress?.siedziba))),
    fact("Dane rejestrowe", "WWW według KRS", normalizeWebsite(text(seatAndAddress?.adresStronyInternetowej))),
    fact("Doświadczenie", "Data rejestracji w KRS", text(header?.dataRejestracjiWKRS)),
    fact("Bieżące zmiany", "Data ostatniego wpisu", text(header?.dataOstatniegoWpisu)),
    fact("Bieżące zmiany", "Numer ostatniego wpisu", text(header?.numerOstatniegoWpisu)),
    fact("Bieżące zmiany", "Sygnatura ostatniego wpisu", text(header?.sygnaturaAktSprawyDotyczacejOstatniegoWpisu)),
    fact("Bieżące zmiany", "Sąd ostatniego wpisu", text(header?.oznaczenieSaduDokonujacegoOstatniegoWpisu)),
    fact("Struktura", "Czas na jaki utworzono podmiot", text(asRecord(section1?.pozostaleInformacje)?.czasNaJakiUtworzonyZostalPodmiot)),
    fact("Struktura", "Sposób powstania", text(founding?.okolicznosciPowstania)),
    fact("Struktura", "Opis powstania", text(founding?.opisSposobuPowstaniaInformacjaOUchwale)),
    fact("Kapitał", "Kapitał zakładowy", formatMoney(asRecord(capital?.wysokoscKapitaluZakladowego))),
    fact("Kapitał", "Liczba akcji/udziałów", text(capital?.lacznaLiczbaAkcjiUdzialow)),
    fact("Kapitał", "Wartość jednej akcji/udziału", formatMoney(asRecord(capital?.wartoscJednejAkcji))),
  ]);

  const boardMembers = mapPeople(asArray(asRecord(section2?.reprezentacja)?.sklad), text(asRecord(section2?.reprezentacja)?.nazwaOrganu) || "Zarząd");
  const supervisoryBoardMembers = asArray(section2?.organNadzoru).flatMap((organ) => {
    const organRecord = asRecord(organ);
    return mapPeople(asArray(organRecord?.sklad), text(organRecord?.nazwa) || "Organ nadzoru");
  });

  const representation = text(asRecord(section2?.reprezentacja)?.sposobReprezentacji);
  if (representation) {
    facts.push(fact("Komitet zakupowy", "Sposób reprezentacji", representation));
  }

  return {
    krs,
    sourceUrl,
    fullSourceUrl,
    status: "found",
    message: null,
    facts,
    boardMembers,
    supervisoryBoardMembers,
    shareholders: extractShareholders(data),
    activities: extractActivities(section3),
    branches: extractBranches(section1),
    filings: extractFilings(section3).slice(0, 12),
    transformations: extractTransformations(section6, fullData),
    recentChanges: extractRecentChanges(header, fullData),
  };
}

function fetchKrsJson(url: string): Promise<KrsFetchResult> {
  return fetch(url, { signal: AbortSignal.timeout(15000) })
    .then(async (res) => {
      const rawText = await res.text();
      const data = parseJsonOrRawText(rawText);
      const response = { status: res.status, ok: res.ok, body: data };
      if (!res.ok || res.status === 204 || rawText.trim() === "") {
        return {
          ok: false,
          status: res.status,
          data,
          response,
          message: res.status === 204 ? "KRS API zwróciło pustą odpowiedź 204" : `KRS API HTTP ${res.status}`,
        };
      }
      return { ok: true, status: res.status, data, response, message: null };
    });
}

function extractActivities(section3: Record<string, unknown> | null): KrsActivity[] {
  const activity = asRecord(section3?.przedmiotDzialalnosci);
  const main = asArray(activity?.przedmiotPrzewazajacejDzialalnosci).map((item) => mapActivity(item, true));
  const other = asArray(activity?.przedmiotPozostalejDzialalnosci).map((item) => mapActivity(item, false));
  return [...main, ...other].filter((item) => item.code || item.description);
}

function mapActivity(item: unknown, isMain: boolean): KrsActivity {
  const row = asRecord(item);
  const code = [row?.kodDzialu, row?.kodKlasy, row?.kodPodklasy].map(text).filter(Boolean).join(".");
  return {
    code,
    description: text(row?.opis) || text(row?.przedmiot) || text(row?.nazwa),
    isMain,
  };
}

function extractBranches(section1: Record<string, unknown> | null): KrsFact[] {
  return asArray(section1?.jednostkiTerenoweOddzialy).map((item, index) => {
    const branch = asRecord(item);
    return fact(
      "Obszar działania",
      `Oddział ${index + 1}`,
      [text(branch?.nazwa), formatAddress(asRecord(branch?.adres))].filter(Boolean).join(" - ")
    );
  }).filter((item) => item.value);
}

function extractFilings(section3: Record<string, unknown> | null): KrsFiling[] {
  const documents = asRecord(section3?.wzmiankiOZlozonychDokumentach);
  return [
    ...mapFilings(documents?.wzmiankaOZlozeniuRocznegoSprawozdaniaFinansowego, "Roczne sprawozdanie finansowe"),
    ...mapFilings(documents?.wzmiankaOZlozeniuSprawozdaniaZDzialalnosci, "Sprawozdanie z działalności"),
    ...mapFilings(asRecord(section3?.sprawozdaniaGrupyKapitalowej)?.wzmiankaOZlozeniuSkonsolidowanegoRocznegoSprawozdaniaFinansowego, "Skonsolidowane sprawozdanie finansowe"),
  ].sort((a, b) => yearFromText(b.period) - yearFromText(a.period));
}

function mapFilings(value: unknown, type: string): KrsFiling[] {
  return asArray(value).map((item) => {
    const row = asRecord(item);
    return {
      type,
      filedAt: text(row?.dataZlozenia),
      period: text(row?.zaOkresOdDo),
    };
  }).filter((item) => item.filedAt || item.period);
}

function extractShareholders(data: Record<string, unknown> | null): KrsFact[] {
  const section1 = asRecord(data?.dzial1);
  const shareholders = [
    ...asArray(section1?.wspolnicy),
    ...asArray(section1?.akcjonariusze),
  ];
  return shareholders.map((item, index) => {
    const row = asRecord(item);
    return fact(
      "Struktura własnościowa",
      `Wspólnik/akcjonariusz ${index + 1}`,
      [
        text(row?.nazwa),
        text(row?.liczbaUdzialow) && `udziały: ${text(row?.liczbaUdzialow)}`,
        text(row?.wartoscUdzialow) && `wartość: ${text(row?.wartoscUdzialow)}`,
      ].filter(Boolean).join(", ")
    );
  }).filter((item) => item.value);
}

function extractTransformations(section6: Record<string, unknown> | null, fullData: unknown): KrsFact[] {
  const current = asArray(section6?.polaczeniePodzialPrzeksztalcenie).map((item, index) =>
    transformationFact(item, index + 1)
  );
  const fullSection6 = asRecord(asRecord(asRecord(asRecord(fullData)?.odpis)?.dane)?.dzial6);
  const full = asArray(fullSection6?.polaczeniePodzialPrzeksztalcenie).map((item, index) =>
    transformationFact(item, current.length + index + 1)
  );
  return uniqueFacts([...current, ...full]).slice(0, 8);
}

function transformationFact(item: unknown, index: number): KrsFact {
  const row = asRecord(item);
  return fact(
    "Fuzje / przejęcia / przekształcenia",
    `Zdarzenie ${index}`,
    [text(row?.okreslenieOkolicznosci), text(row?.opisPolaczeniaPodzialuPrzeksztalcenia)].filter(Boolean).join(": ")
  );
}

function extractRecentChanges(header: Record<string, unknown> | null, fullData: unknown): KrsFact[] {
  const changes = compactFacts([
    fact("Bieżące wydarzenia", "Ostatni wpis", [
      text(header?.dataOstatniegoWpisu),
      text(header?.sygnaturaAktSprawyDotyczacejOstatniegoWpisu),
    ].filter(Boolean).join(" - ")),
  ]);
  const fullHeader = asRecord(asRecord(asRecord(fullData)?.odpis)?.naglowekA);
  const fullChange = fact("Bieżące wydarzenia", "Ostatni wpis w odpisie pełnym", [
    text(fullHeader?.dataOstatniegoWpisu),
    text(fullHeader?.sygnaturaAktSprawyDotyczacejOstatniegoWpisu),
  ].filter(Boolean).join(" - "));
  return compactFacts([...changes, fullChange]);
}

function mapPeople(items: unknown[], role: string): KrsPerson[] {
  return items.map((item) => {
    const row = asRecord(item);
    return {
      role,
      name: formatMaskedName(asRecord(row?.imiona), asRecord(row?.nazwisko)),
      function: text(row?.funkcjaWOrganie) || text(row?.rodzajProkury),
      suspended: typeof row?.czyZawieszona === "boolean" ? row.czyZawieszona : null,
    };
  }).filter((person) => person.name || person.function);
}

function buildKrsRequest(type: "OdpisAktualny" | "OdpisPelny", krs: string) {
  const url = new URL(`api/krs/${type}/${krs}`, KRS_API_BASE_URL);
  url.search = new URLSearchParams({ rejestr: "P", format: "json" }).toString();
  return { url: url.toString(), method: "GET", type, krs, rejestr: "P", format: "json" };
}

function normalizeKrsNumber(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 0 || digits.length > 10) return null;
  return digits.padStart(10, "0");
}

function emptyKrsReport(krs: string | null, status: KrsReport["status"], message: string | null): KrsReport {
  return {
    krs,
    sourceUrl: krs ? buildKrsRequest("OdpisAktualny", krs).url : null,
    fullSourceUrl: krs ? buildKrsRequest("OdpisPelny", krs).url : null,
    status,
    message,
    facts: [],
    boardMembers: [],
    supervisoryBoardMembers: [],
    shareholders: [],
    activities: [],
    branches: [],
    filings: [],
    transformations: [],
    recentChanges: [],
  };
}

function fact(category: string, label: string, value: string): KrsFact {
  return { category, label, value, source: "KRS OpenAPI" };
}

function compactFacts(facts: KrsFact[]): KrsFact[] {
  return facts.filter((item) => item.value);
}

function uniqueFacts(facts: KrsFact[]): KrsFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.label}:${fact.value}`;
    if (!fact.value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatAddress(address: Record<string, unknown> | null): string {
  if (!address) return "";
  return [
    [text(address.ulica), text(address.nrDomu), text(address.nrLokalu) && `/${text(address.nrLokalu)}`].filter(Boolean).join(" "),
    [text(address.kodPocztowy), text(address.miejscowosc)].filter(Boolean).join(" "),
    text(address.poczta) && text(address.poczta) !== text(address.miejscowosc) ? `poczta ${text(address.poczta)}` : "",
    text(address.kraj),
  ].filter(Boolean).join(", ");
}

function formatSeat(seat: Record<string, unknown> | null): string {
  if (!seat) return "";
  return [seat.kraj, seat.wojewodztwo, seat.powiat, seat.gmina, seat.miejscowosc].map(text).filter(Boolean).join(", ");
}

function formatMoney(value: Record<string, unknown> | null): string {
  if (!value) return "";
  return [text(value.wartosc), text(value.waluta)].filter(Boolean).join(" ");
}

function formatMaskedName(names: Record<string, unknown> | null, surname: Record<string, unknown> | null): string {
  return [
    text(names?.imie),
    text(names?.imieDrugie),
    text(surname?.nazwiskoICzlon),
    text(surname?.nazwiskoIICzlon),
  ].filter(Boolean).join(" ");
}

function normalizeWebsite(value: string): string {
  if (!value) return "";
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value.toLowerCase()}`;
  try {
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.hostname.replace(/^www\./, "")}`;
  } catch {
    return value;
  }
}

function yearFromText(value: string): number {
  return Math.max(0, ...Array.from(value.matchAll(/\b(19|20)\d{2}\b/g)).map((match) => Number(match[0])));
}

function parseJsonOrRawText(rawText: string): unknown {
  if (!rawText.trim()) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return { rawText };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

interface KrsFetchResult {
  ok: boolean;
  status: number;
  data: unknown;
  response: unknown;
  message: string | null;
}
