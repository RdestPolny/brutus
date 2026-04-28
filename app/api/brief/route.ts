import { NextRequest, NextResponse } from "next/server";
import {
  askPerplexityTable,
  buildDigitalPresencePrompt,
  buildRegistryPrompt,
} from "@/lib/perplexity";
import { parseMarkdownTable, pickValue } from "@/lib/markdownTable";
import { fetchGooglePlaceReport } from "@/lib/places";
import type { CompanyRegistryRow, DigitalPresenceRow } from "@/lib/types";

export const maxDuration = 90;

export async function POST(req: NextRequest) {
  let body: { nip?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  const nip = String(body.nip ?? "").replace(/\D/g, "");
  if (nip.length !== 10) {
    return NextResponse.json({ error: "NIP musi mieć 10 cyfr" }, { status: 400 });
  }

  try {
    const registryPrompt = buildRegistryPrompt(nip);
    const registryMarkdown = await askPerplexityTable(registryPrompt);
    const registryRows = parseRegistryRows(registryMarkdown);
    const firstRegistryRow = registryRows[0];

    if (!firstRegistryRow?.name) {
      throw new Error("Nie udało się odczytać nazwy firmy z pierwszej tabeli Perplexity");
    }

    const digitalPresencePrompt = buildDigitalPresencePrompt(firstRegistryRow.name);
    const digitalPresenceMarkdown = await askPerplexityTable(digitalPresencePrompt);
    const digitalPresenceRows = parseDigitalPresenceRows(digitalPresenceMarkdown);

    const placesQuery = [firstRegistryRow.name, firstRegistryRow.address]
      .filter(Boolean)
      .join(" ");
    const googlePlace = await fetchGooglePlaceReport(placesQuery);

    return NextResponse.json({
      input: { nip },
      generatedAt: new Date().toISOString(),
      registry: {
        rawMarkdown: registryMarkdown,
        rows: registryRows,
      },
      digitalPresence: {
        rawMarkdown: digitalPresenceMarkdown,
        rows: digitalPresenceRows,
      },
      googlePlace,
      debug: {
        registryPrompt,
        digitalPresencePrompt,
        placesQuery,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[brief] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseRegistryRows(markdown: string): CompanyRegistryRow[] {
  return parseMarkdownTable(markdown).map((row) => ({
    name: pickValue(row, ["Nazwa", "Nazwa firmy", "Firma"]),
    krs: pickValue(row, ["KRS", "Numer KRS"]),
    address: pickValue(row, ["Adres", "Siedziba", "Adres siedziby"]),
    legalForm: pickValue(row, ["Forma prawna"]),
    shareCapital: pickValue(row, ["Kapitał zakładowy", "Kapital zakladowy"]),
    registrationDate: pickValue(row, ["Data rejestracji", "Rejestracja"]),
    mainActivity: pickValue(row, ["Główna działalność", "Glowna dzialalnosc", "PKD"]),
  }));
}

function parseDigitalPresenceRows(markdown: string): DigitalPresenceRow[] {
  return parseMarkdownTable(markdown).map((row) => ({
    platform: pickValue(row, ["Platforma"]),
    address: pickValue(row, ["Adres", "URL", "Link"]),
    details: pickValue(row, [
      "Liczba followersów / Dodatkowe informacje",
      "Liczba followersow / Dodatkowe informacje",
      "Dodatkowe informacje",
      "Followers",
    ]),
  }));
}
