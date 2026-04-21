import { NextRequest, NextResponse } from "next/server";
import {
  searchCompanyPeopleAndSocial,
  searchGrowthAndRisks,
  searchMarketingReadiness,
} from "@/lib/perplexity";
import {
  structureCompanyProfile,
  structureGrowthSection,
  structureRiskSection,
  structureDecisionStructure,
  structureBuyingReadiness,
  generateRecommendedQuestions,
} from "@/lib/gemini";
import { fetchKrsEnrichedData, formatKrsContext } from "@/lib/krs";
import { computeScore } from "@/lib/scoring";
import type { LeadBrief, LeadInput } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const input: LeadInput = await req.json();

  if (!input.companyName || !input.domain) {
    return NextResponse.json(
      { error: "companyName and domain are required" },
      { status: 400 }
    );
  }

  // Parallel: KRS fetch + 3 bulk Perplexity searches
  const [krsData, companyRaw, growthRisksRaw, marketingRaw] = await Promise.all([
    input.krs ? fetchKrsEnrichedData(input.krs) : Promise.resolve(null),
    searchCompanyPeopleAndSocial(input),
    searchGrowthAndRisks(input),
    searchMarketingReadiness(input),
  ]);

  const krsContext = krsData ? formatKrsContext(krsData) : undefined;
  const krsManagement = krsData?.basic?.management?.length
    ? krsData.basic.management.map((p) => `${p.name} — ${p.role}`).join("\n")
    : undefined;

  // Pass raw Perplexity text to Gemini for structuring — parallel
  const [company_profile, growth, risks, decision_structure, buying_readiness] =
    await Promise.all([
      structureCompanyProfile(companyRaw, input),
      structureGrowthSection(growthRisksRaw),
      structureRiskSection(growthRisksRaw, krsContext),
      structureDecisionStructure(companyRaw, input, krsManagement),
      structureBuyingReadiness(marketingRaw, input),
    ]);

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

  return NextResponse.json(brief);
}
