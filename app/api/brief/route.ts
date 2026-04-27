import { NextRequest, NextResponse } from "next/server";
import {
  researchCorporateAndDecisionMakers,
  researchFirmographicGaps,
  researchGrowthAndBuyingSignals,
  researchIndustryAndRisks,
  type ResearchSourceContext,
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
    // Stage 0: preprocessing — detect industry for the industry research batch
    const preprocess = await preprocessLead(input);

    // Stage 1: source-first facts. These are authoritative enough that we should not ask
    // Perplexity to rediscover them.
    const [websiteResult, krsData] = await Promise.all([
      scrapeCompanyWebsite(input.domain),
      input.krs ? fetchKrsEnrichedData(input.krs) : Promise.resolve(null),
    ]);

    const krsContext = krsData ? formatKrsContext(krsData) : undefined;
    const krsManagement = krsData?.basic?.management?.length
      ? krsData.basic.management.map((p) => `${p.name} — ${p.role}`).join("\n")
      : undefined;

    const placeData = await fetchPlaceData(
      input.companyName,
      websiteResult.address ?? krsData?.basic?.address ?? null
    );

    const sourceContext: ResearchSourceContext = {
      website: websiteResult.text,
      krs: krsContext,
      places: placeData.context,
    };
    const linkedinCompanyUrl = websiteResult.socialLinks?.linkedin ?? null;

    // Stage 2: thematic research batches. Perplexity receives source context and is only
    // asked for facts that require external research.
    const [profileResearch, corporateResearch, growthBuyingResearch, industryRiskResearch] =
      await Promise.all([
        researchFirmographicGaps(input, sourceContext),
        researchCorporateAndDecisionMakers(input, sourceContext),
        researchGrowthAndBuyingSignals(input, sourceContext, linkedinCompanyUrl),
        researchIndustryAndRisks(input, preprocess.industrySlug, sourceContext),
      ]);

    // Build rich context strings for each Gemini structuring call
    const companyContext = [websiteResult.text, krsContext, placeData.context, profileResearch]
      .filter(Boolean)
      .join("\n\n---\n\n");
    const decisionContext = [krsContext, corporateResearch, websiteResult.text]
      .filter(Boolean)
      .join("\n\n---\n\n");
    const growthContext = growthBuyingResearch;
    const riskContext = [krsContext, placeData.context, corporateResearch, industryRiskResearch]
      .filter(Boolean)
      .join("\n\n---\n\n");
    const buyingContext = growthBuyingResearch;

    // Stage 3: Gemini structuring — parallel
    // structureEmployees gets the people-focused research batch only.
    const [company_profile, growth, risks, decision_structure, buying_readiness, employees] =
      await Promise.all([
        structureCompanyProfile(companyContext, input),
        structureGrowthSection(growthContext),
        structureRiskSection(riskContext, krsContext),
        structureDecisionStructure(decisionContext, input, krsManagement),
        structureBuyingReadiness(buyingContext, input),
        structureEmployees(corporateResearch),
      ]);

    // Override key_decision_makers with dedicated people structuring
    if (employees.length > 0) {
      decision_structure.key_decision_makers = {
        value: employees,
        confidence: 0.8,
        status: "inferred",
        source_urls: [],
        evidence_excerpt: `${employees.length} pracowników znalezionych na LinkedIn`,
      };
    }

    // Source-first overrides: direct source data wins over model-inferred fields.
    const sourceAddress = websiteResult.address ?? placeData.formattedAddress ?? krsData?.basic?.address;
    if (sourceAddress) {
      const addressSourceUrl = websiteResult.address
        ? `https://${input.domain}`
        : placeData.mapsLink ?? (input.krs ? "https://api-krs.ms.gov.pl" : "");
      company_profile.contact_address = {
        value: sourceAddress,
        confidence: 0.95,
        status: "confirmed",
        source_urls: [addressSourceUrl].filter(Boolean),
        evidence_excerpt: websiteResult.address
          ? "Adres wyciągnięty bezpośrednio ze strony firmowej przez Firecrawl"
          : "Adres pobrany ze źródła urzędowego lub Google Places",
      };
    }

    if (krsData?.basic?.registrationDate) {
      const year = Number(krsData.basic.registrationDate.slice(0, 4));
      if (Number.isFinite(year)) {
        company_profile.founded_year = {
          value: year,
          confidence: 0.95,
          status: "confirmed",
          source_urls: ["https://api-krs.ms.gov.pl"],
          evidence_excerpt: `Data rejestracji w KRS: ${krsData.basic.registrationDate}`,
        };
      }
    }

    if (krsData?.basic?.legalForm) {
      company_profile.company_structure = {
        value: krsData.basic.legalForm,
        confidence: 0.95,
        status: "confirmed",
        source_urls: ["https://api-krs.ms.gov.pl"],
        evidence_excerpt: "Forma prawna pobrana z KRS",
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

    if (linkedinCompanyUrl) {
      decision_structure.linkedin_company_url = {
        value: linkedinCompanyUrl,
        confidence: 0.95,
        status: "confirmed",
        source_urls: [`https://${input.domain}`],
        evidence_excerpt: "Link do LinkedIn znaleziony bezpośrednio na stronie firmowej przez Firecrawl",
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
      places: placeData,
      source_context: sourceContext,
      r1_profile_gaps: profileResearch,
      r2_corporate_decision: corporateResearch,
      r3_growth_buying: growthBuyingResearch,
      r4_industry_risks: industryRiskResearch,
      employees_parsed: employees,
    };

    return NextResponse.json({ ...brief, _debug });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[brief] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
