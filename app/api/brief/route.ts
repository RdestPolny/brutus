import { NextRequest, NextResponse } from "next/server";
import {
  searchS1Firmographics,
  searchS2Corporate,
  searchS3Events,
  searchS4Digital,
  searchS5Industry,
  searchS6Intent,
  searchLinkedInEmployees,
} from "@/lib/perplexity";
import {
  structureCompanyProfile,
  structureGrowthSection,
  structureRiskSection,
  structureDecisionStructure,
  structureBuyingReadiness,
  generateRecommendedQuestions,
  structureEmployees,
} from "@/lib/gemini";
import { fetchKrsEnrichedData, formatKrsContext } from "@/lib/krs";
import { scrapeCompanyWebsite } from "@/lib/firecrawl";
import { fetchPlaceData } from "@/lib/places";
import { preprocessLead } from "@/lib/preprocessing";
import { computeScore } from "@/lib/scoring";
import type { LeadBrief, LeadInput } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let input: LeadInput;

  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  if (!input.companyName || !input.domain) {
    return NextResponse.json(
      { error: "companyName and domain are required" },
      { status: 400 }
    );
  }

  try {
    // Stage 0: preprocessing — detect industry for S5 cache, normalize name
    const preprocess = await preprocessLead(input);

    // Stage 1: parallel — F1 (website) + F2 (KRS) + S1–S5 + S7 (LinkedIn employees)
    const [websiteResult, krsData, s1Raw, s2Raw, s3Raw, s4Raw, s5Raw, s7Raw] =
      await Promise.all([
        scrapeCompanyWebsite(input.domain),
        input.krs ? fetchKrsEnrichedData(input.krs) : Promise.resolve(null),
        searchS1Firmographics(input),
        searchS2Corporate(input),
        searchS3Events(input),
        searchS4Digital(input),
        searchS5Industry(input, preprocess.industrySlug),
        searchLinkedInEmployees(input),
      ]);

    const krsContext = krsData ? formatKrsContext(krsData) : undefined;
    const krsManagement = krsData?.basic?.management?.length
      ? krsData.basic.management.map((p) => `${p.name} — ${p.role}`).join("\n")
      : undefined;

    // Stage 2: S6 (uses S4 LinkedIn URL) + Places API (uses F1 address) — parallel
    const [s6Raw, placeData] = await Promise.all([
      searchS6Intent(input, s4Raw),
      fetchPlaceData(input.companyName, websiteResult.address),
    ]);

    // Build rich context strings for each Gemini structuring call
    const companyContext = [websiteResult.text, s1Raw, s4Raw, placeData.context]
      .filter(Boolean)
      .join("\n\n---\n\n");
    // Decision structure: corporate changes (S2) + LinkedIn employees (S7) + website
    const decisionContext = [s2Raw, s7Raw, websiteResult.text].filter(Boolean).join("\n\n---\n\n");
    const growthContext = s3Raw;
    // Risk: corporate changes (S2) + industry context (S5) + Google reviews from Places
    const riskContext = [s2Raw, s5Raw, placeData.context].filter(Boolean).join("\n\n---\n\n");
    const buyingContext = s6Raw;

    // Stage 3: Gemini structuring — parallel
    // structureEmployees gets ONLY s7Raw — dedicated call, no noise from other context
    const [company_profile, growth, risks, decision_structure, buying_readiness, employees] =
      await Promise.all([
        structureCompanyProfile(companyContext, input),
        structureGrowthSection(growthContext),
        structureRiskSection(riskContext, krsContext),
        structureDecisionStructure([s2Raw, websiteResult.text].filter(Boolean).join("\n\n---\n\n"), input, krsManagement),
        structureBuyingReadiness(buyingContext, input),
        structureEmployees(s7Raw),
      ]);

    // Override key_decision_makers with dedicated S7 structuring
    if (employees.length > 0) {
      decision_structure.key_decision_makers = {
        value: employees,
        confidence: 0.8,
        status: "inferred",
        source_urls: [],
        evidence_excerpt: `${employees.length} pracowników znalezionych na LinkedIn`,
      };
    }

    // Override social_links with Firecrawl data — authoritative (direct from website)
    if (websiteResult.socialLinks) {
      company_profile.social_links = {
        value: Object.entries(websiteResult.socialLinks).map(([k, v]) => `${k}: ${v}`),
        confidence: 0.95,
        status: "confirmed",
        source_urls: [`https://${input.domain}`],
        evidence_excerpt: "Wyciągnięte bezpośrednio ze strony firmowej przez Firecrawl",
      };
    }

    // Override google_maps_link from Places API if available
    if (placeData.mapsLink) {
      company_profile.google_maps_link = {
        value: placeData.mapsLink,
        confidence: 0.99,
        status: "confirmed",
        source_urls: [placeData.mapsLink],
        evidence_excerpt: `Google Places API: ${placeData.rating ?? "?"}/5 (${placeData.reviewCount ?? "?"} opinii)`,
      };
    }

    const context = [
      `Profil: ${company_profile.summary}`,
      `Sygnały wzrostu: ${growth.summary}`,
      `Ryzyka: ${risks.summary}`,
      `Struktura decyzyjna: ${decision_structure.summary}`,
      `Gotowość zakupowa: ${buying_readiness.summary}`,
    ].join("\n\n");

    const recommended_questions = await generateRecommendedQuestions(input, context);
    const score = computeScore(company_profile, growth, risks, decision_structure, buying_readiness);

    const brief: LeadBrief = {
      input,
      generated_at: new Date().toISOString(),
      company_profile,
      growth,
      risks,
      decision_structure,
      buying_readiness,
      recommended_questions,
      score,
    };

    const _debug = {
      preprocess,
      f1_website: websiteResult,
      krs: krsContext ?? null,
      s1: s1Raw,
      s2: s2Raw,
      s3: s3Raw,
      s4: s4Raw,
      s5: s5Raw,
      s6: s6Raw,
      s7: s7Raw,
      places: placeData,
      employees_parsed: employees,
    };

    return NextResponse.json({ ...brief, _debug });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[brief] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
