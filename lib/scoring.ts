import type {
  CompanyProfile,
  GrowthSection,
  RiskSection,
  DecisionStructure,
  BuyingReadiness,
  LeadScore,
} from "./types";

function clamp(v: number) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function fitScore(profile: CompanyProfile, growth: GrowthSection): number {
  let score = 50;

  // Good market scope signals higher potential
  if (profile.market_scope.value === "international") score += 20;
  else if (profile.market_scope.value === "national") score += 10;

  // Active growth signals = good fit
  const highRelevanceSignals = growth.signals.filter((s) => s.relevance === "high").length;
  score += Math.min(highRelevanceSignals * 8, 24);

  // Company with established history is safer bet
  const year = profile.founded_year.value;
  if (year && year < 2015) score += 10;
  else if (year && year < 2020) score += 5;

  return clamp(score);
}

function readinessScore(readiness: BuyingReadiness, growth: GrowthSection): number {
  let score = 30;

  const budget = readiness.budget_signal.value;
  if (budget === "budgeted") score += 30;
  else if (budget === "ad_hoc") score += 15;
  else if (budget === "no_budget") score -= 20;

  const urgency = readiness.urgency.value;
  if (urgency === "immediate") score += 25;
  else if (urgency === "short_term") score += 15;
  else if (urgency === "long_term") score += 5;

  const awareness = readiness.problem_awareness.value;
  if (awareness === "high") score += 15;
  else if (awareness === "medium") score += 8;

  if (readiness.used_similar_solution_before.value) score += 10;

  // Recent events = urgency signal
  if (growth.signals.some((s) => s.relevance === "high")) score += 10;

  return clamp(score);
}

function authorityScore(decision: DecisionStructure): number {
  let score = 40;

  const dmType = decision.decision_maker_type.value;
  if (dmType === "owner") score += 40;
  else if (dmType === "director") score += 25;
  else if (dmType === "manager") score += 10;
  else if (dmType === "specialist") score -= 10;

  const complexity = decision.buying_committee_complexity.value;
  if (complexity === "simple") score += 15;
  else if (complexity === "medium") score += 5;
  else if (complexity === "complex") score -= 10;

  return clamp(score);
}

function riskScore(risks: RiskSection): number {
  let score = 0;

  for (const signal of risks.signals) {
    if (signal.level === "high") score += 25;
    else if (signal.level === "medium") score += 12;
    else if (signal.level === "low") score += 5;
  }

  // Financial trend risk
  for (const fin of risks.financial) {
    if (fin.trend === "declining") score += 20;
    else if (fin.trend === "stable") score += 0;
    else if (fin.trend === "growing") score -= 5;
  }

  const changes = risks.management_changes.value;
  if (changes && changes.length > 2) score += 15;

  return clamp(score);
}

export function computeScore(
  profile: CompanyProfile,
  growth: GrowthSection,
  risks: RiskSection,
  decision: DecisionStructure,
  readiness: BuyingReadiness
): LeadScore {
  const fit = fitScore(profile, growth);
  const ready = readinessScore(readiness, growth);
  const authority = authorityScore(decision);
  const risk = riskScore(risks);

  const total = clamp(
    0.35 * fit + 0.30 * ready + 0.20 * authority - 0.15 * risk
  );

  let recommendation: LeadScore["recommendation"];
  let recommendation_reason: string;

  if (total >= 70 && risk < 40) {
    recommendation = "proceed";
    recommendation_reason = "Wysoki score i niskie ryzyko — warto priorytetyzować ten lead.";
  } else if (total >= 50 && risk < 60) {
    recommendation = "qualify_further";
    recommendation_reason = "Potencjał jest, ale brakuje danych lub pojawiają się sygnały wymagające weryfikacji.";
  } else if (risk >= 60) {
    recommendation = "manual_review";
    recommendation_reason = "Wysoki poziom ryzyka — wymagana ręczna weryfikacja przed dalszym procesem.";
  } else {
    recommendation = "skip";
    recommendation_reason = "Niski score ogólny — prawdopodobnie nieodpowiedni moment lub klient.";
  }

  return { fit, readiness: ready, authority, risk, total, recommendation, recommendation_reason };
}
