import { NextRequest, NextResponse } from "next/server";
import {
  fetchCompanyProfile,
  fetchGrowthSignals,
  fetchRiskSignals,
  fetchDecisionStructure,
  fetchBuyingReadiness,
  fetchRecommendedQuestions,
} from "@/lib/perplexity";
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

  const [company_profile, growth, risks, decision_structure, buying_readiness] =
    await Promise.all([
      fetchCompanyProfile(input),
      fetchGrowthSignals(input),
      fetchRiskSignals(input),
      fetchDecisionStructure(input),
      fetchBuyingReadiness(input),
    ]);

  const context = [
    `Profil: ${company_profile.summary}`,
    `Sygnały wzrostu: ${growth.summary}`,
    `Ryzyka: ${risks.summary}`,
    `Struktura decyzyjna: ${decision_structure.summary}`,
    `Gotowość zakupowa: ${buying_readiness.summary}`,
  ].join("\n\n");

  const recommended_questions = await fetchRecommendedQuestions(input, context);
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
