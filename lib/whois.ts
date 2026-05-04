import type { WhoisReport } from "./types";

const RDAP_BASE_URL = "https://rdap.org";

export async function fetchWhoisReportWithDebug(
  officialWebsite: string | null
): Promise<{ report: WhoisReport; request: unknown; response: unknown }> {
  const domain = extractDomain(officialWebsite);
  if (!domain) {
    return {
      report: emptyReport(null, "skipped", "Brak domeny"),
      request: { skipped: true, reason: "no domain" },
      response: null,
    };
  }

  const url = `${RDAP_BASE_URL}/domain/${domain}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(10000),
    });
    const rawText = await res.text();
    const data = parseJson(rawText);

    if (!res.ok) {
      return {
        report: emptyReport(domain, res.status === 404 ? "not_found" : "error", `RDAP HTTP ${res.status}`),
        request: { url, method: "GET" },
        response: { status: res.status, body: data },
      };
    }

    const report = parseRdapResponse(domain, data);
    return {
      report,
      request: { url, method: "GET" },
      response: { status: res.status, body: data },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Nieznany błąd RDAP";
    return {
      report: emptyReport(domain, "error", message),
      request: { url, method: "GET" },
      response: { error: message },
    };
  }
}

function parseRdapResponse(domain: string, data: unknown): WhoisReport {
  const obj = (data ?? {}) as RdapResponse;
  const events = Array.isArray(obj.events) ? obj.events : [];
  const findEvent = (action: string) =>
    events.find((event) => event?.eventAction === action)?.eventDate ?? null;
  const registrar = pickRegistrar(obj);

  return {
    domain,
    registrationDate: normalizeDate(findEvent("registration")),
    lastChanged: normalizeDate(findEvent("last changed") || findEvent("last update of RDAP database")),
    expirationDate: normalizeDate(findEvent("expiration")),
    registrar,
    status: "found",
    message: null,
  };
}

function pickRegistrar(obj: RdapResponse): string | null {
  const entities = Array.isArray(obj.entities) ? obj.entities : [];
  for (const entity of entities) {
    if (!Array.isArray(entity?.roles) || !entity.roles.includes("registrar")) continue;
    const vcard = Array.isArray(entity.vcardArray) ? entity.vcardArray[1] : null;
    if (Array.isArray(vcard)) {
      for (const item of vcard) {
        if (Array.isArray(item) && item[0] === "fn" && typeof item[3] === "string") {
          return item[3];
        }
      }
    }
    if (typeof entity.handle === "string") return entity.handle;
  }
  return null;
}

function extractDomain(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function emptyReport(domain: string | null, status: WhoisReport["status"], message: string | null): WhoisReport {
  return {
    domain,
    registrationDate: null,
    lastChanged: null,
    expirationDate: null,
    registrar: null,
    status,
    message,
  };
}

function parseJson(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    return { rawText };
  }
}

interface RdapResponse {
  events?: Array<{ eventAction?: string; eventDate?: string }>;
  entities?: Array<{
    roles?: string[];
    handle?: string;
    vcardArray?: unknown[];
  }>;
}
