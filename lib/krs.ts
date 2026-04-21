const KRS_API = "https://api-krs.ms.gov.pl/api/krs/OdpisAktualny";
const FIRECRAWL_API = "https://api.firecrawl.dev";

export interface KrsManagementPerson {
  name: string;
  role: string;
}

export interface KrsBasicData {
  name: string;
  nip: string;
  regon: string;
  address: string;
  registrationDate: string;
  legalForm: string;
  shareCapital: string | null;
  management: KrsManagementPerson[];
  supervisoryBoard: KrsManagementPerson[];
}

export interface KrsEnrichedData {
  basic: KrsBasicData | null;
  financialContext: string;
}

export async function fetchKrsEnrichedData(krs: string): Promise<KrsEnrichedData> {
  const [basic, financialContext] = await Promise.all([
    fetchKrsBasicData(krs),
    fetchKrsFinancials(krs),
  ]);
  return { basic, financialContext };
}

async function fetchKrsBasicData(krs: string): Promise<KrsBasicData | null> {
  try {
    const res = await fetch(
      `${KRS_API}/${krs}?rejestr=P&format=json`,
      { headers: { Accept: "application/json" }, next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return parseKrsResponse(data);
  } catch {
    return null;
  }
}

function parseKrsResponse(data: Record<string, unknown>): KrsBasicData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  const dzial1 = d?.odpis?.dane?.dzial1;
  const dzial2 = d?.odpis?.dane?.dzial2;
  const dzial3 = d?.odpis?.dane?.dzial3;
  const podmiot = dzial1?.danePodmiotu;
  const adresObj = dzial1?.siedzibaIAdres?.adres;

  const address = adresObj
    ? [adresObj.ulica, adresObj.nrDomu, adresObj.kodPocztowy, adresObj.miejscowosc]
        .filter(Boolean)
        .join(" ")
    : "";

  const management: KrsManagementPerson[] = [];
  const supervisoryBoard: KrsManagementPerson[] = [];

  for (const organ of dzial2?.organPrzedsiebiorstwa || []) {
    const name: string = organ.nazwaMn || "";
    const isSupervision =
      name.toLowerCase().includes("nadzorcza") ||
      name.toLowerCase().includes("komisja");
    const target = isSupervision ? supervisoryBoard : management;

    for (const p of organ.osobyFizyczne || []) {
      target.push({ name: `${p.imiona} ${p.nazwisko}`.trim(), role: p.funkcja || name });
    }
    for (const p of organ.osobyPrawne || []) {
      target.push({ name: p.nazwa, role: p.funkcja || name });
    }
  }

  const kapital = dzial3?.kapitalZakladowy;

  return {
    name: podmiot?.nazwa || "",
    nip: podmiot?.identyfikatory?.nip || "",
    regon: podmiot?.identyfikatory?.regon || "",
    address,
    registrationDate: dzial1?.dataRejestracji || "",
    legalForm: podmiot?.formaPrawna?.nazwaMn || "",
    shareCapital: kapital ? `${kapital.wysokosc} ${kapital.waluta}` : null,
    management,
    supervisoryBoard,
  };
}

async function fetchKrsFinancials(krs: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return "";

  let scrapeId: string | null = null;
  try {
    const scrapeRes = await fetch(`${FIRECRAWL_API}/v2/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://ekrs.ms.gov.pl/web/wyszukiwarka-krs/strona-glowna",
        formats: ["markdown"],
      }),
    });
    if (!scrapeRes.ok) return "";
    const scrapeData = await scrapeRes.json();
    scrapeId = scrapeData?.data?.metadata?.scrapeId as string | null;
    if (!scrapeId) return "";

    await interact(apiKey, scrapeId, 60,
      `Znajdź pole wyszukiwania na stronie i wyszukaj podmiot po numerze KRS: ${krs}. Poczekaj na wyniki wyszukiwania i kliknij w pierwszą znalezioną firmę na liście wyników.`
    );

    const financial = await interact(apiKey, scrapeId, 90,
      "Znajdź dane finansowe firmy: przychody ze sprzedaży, zysk lub stratę netto, zobowiązania ogółem za dostępne lata (2021-2023 lub nowsze). Jeśli są zakładki lub sekcje z dokumentami finansowymi, otwórz je. Zwróć wynik jako czytelny tekst z latami i kwotami w PLN."
    );

    return financial?.output || "";
  } catch {
    return "";
  } finally {
    if (scrapeId && apiKey) {
      await fetch(`${FIRECRAWL_API}/v2/scrape/${scrapeId}/interact`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      }).catch(() => undefined);
    }
  }
}

async function interact(
  apiKey: string,
  scrapeId: string,
  timeout: number,
  prompt: string
): Promise<{ output: string } | null> {
  const res = await fetch(`${FIRECRAWL_API}/v2/scrape/${scrapeId}/interact`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, timeout }),
  });
  if (!res.ok) return null;
  return res.json();
}

export function formatKrsContext(data: KrsEnrichedData): string {
  const parts: string[] = [];

  if (data.basic) {
    const b = data.basic;
    parts.push(`=== DANE Z KRS (zweryfikowane) ===`);
    parts.push(`Nazwa: ${b.name}`);
    if (b.nip) parts.push(`NIP: ${b.nip}`);
    if (b.regon) parts.push(`REGON: ${b.regon}`);
    if (b.legalForm) parts.push(`Forma prawna: ${b.legalForm}`);
    if (b.registrationDate) parts.push(`Data rejestracji: ${b.registrationDate}`);
    if (b.address) parts.push(`Adres: ${b.address}`);
    if (b.shareCapital) parts.push(`Kapitał zakładowy: ${b.shareCapital}`);

    if (b.management.length > 0) {
      parts.push(
        `Zarząd: ${b.management.map((p) => `${p.name} (${p.role})`).join(", ")}`
      );
    }
    if (b.supervisoryBoard.length > 0) {
      parts.push(
        `Rada nadzorcza: ${b.supervisoryBoard.map((p) => `${p.name} (${p.role})`).join(", ")}`
      );
    }
  }

  if (data.financialContext) {
    parts.push(`\n=== DANE FINANSOWE Z eKRS ===`);
    parts.push(data.financialContext);
  }

  return parts.join("\n");
}
