export interface LeadInput {
  companyName: string;
  domain: string;
  nip?: string;
  krs?: string;
  contactName?: string;
  contactTitle?: string;
}

export type FieldStatus = "confirmed" | "inferred" | "missing" | "conflicting";
export type RiskLevel = "low" | "medium" | "high";

export interface DataField<T = string> {
  value: T | null;
  confidence: number; // 0-1
  status: FieldStatus;
  source_urls: string[];
  evidence_excerpt: string;
}

export interface CompanyProfile {
  industry: DataField;
  specialization: DataField;
  market_scope: DataField<"local" | "national" | "international">;
  founded_year: DataField<number>;
  employee_count: DataField<string>;
  company_structure: DataField;
  business_model: DataField;
  contact_address: DataField;
  website_domain_registered: DataField;
  social_links: DataField<string[]>;
  google_maps_link: DataField;
  summary: string;
}

export interface GrowthSignal {
  type: string;
  description: string;
  date: string | null;
  source_url: string;
  relevance: "high" | "medium" | "low";
}

export interface RiskSignal {
  type: string;
  description: string;
  level: RiskLevel;
  source_url: string;
}

export interface FinancialSnapshot {
  year: number;
  revenue: string | null;
  profit_loss: string | null;
  debt: string | null;
  trend: "growing" | "stable" | "declining" | "unknown";
}

export interface GrowthSection {
  signals: GrowthSignal[];
  recent_events: string[];
  open_vacancies: DataField<string[]>;
  pr_mentions: string[];
  summary: string;
}

export interface RiskSection {
  signals: RiskSignal[];
  financial: FinancialSnapshot[];
  management_changes: DataField<string[]>;
  reviews: {
    google: DataField<string>;
    clutch: DataField<string>;
    gowork: DataField<string>;
  };
  summary: string;
}

export interface DecisionStructure {
  contact_role_in_hierarchy: DataField;
  marketing_team_size: DataField<string>;
  has_sales_team: DataField<boolean>;
  sales_model: DataField;
  buying_committee_complexity: DataField<"simple" | "medium" | "complex">;
  decision_maker_type: DataField<"owner" | "director" | "manager" | "specialist">;
  summary: string;
}

export interface BuyingReadiness {
  budget_signal: DataField<"budgeted" | "ad_hoc" | "no_budget" | "unknown">;
  urgency: DataField<"immediate" | "short_term" | "long_term" | "unknown">;
  problem_awareness: DataField<"high" | "medium" | "low">;
  marketing_maturity: DataField<"high" | "medium" | "low">;
  used_similar_solution_before: DataField<boolean>;
  summary: string;
}

export interface RecommendedQuestions {
  hypotheses: string[];
  questions: string[];
  expected_objections: string[];
  sales_angles: string[];
}

export interface LeadScore {
  fit: number;       // 0-100
  readiness: number; // 0-100
  authority: number; // 0-100
  risk: number;      // 0-100 (higher = more risk)
  total: number;     // 0-100
  recommendation: "proceed" | "qualify_further" | "manual_review" | "skip";
  recommendation_reason: string;
}

export interface LeadBrief {
  input: LeadInput;
  generated_at: string;
  company_profile: CompanyProfile;
  growth: GrowthSection;
  risks: RiskSection;
  decision_structure: DecisionStructure;
  buying_readiness: BuyingReadiness;
  recommended_questions: RecommendedQuestions;
  score: LeadScore;
}

export interface BriefProgress {
  section: string;
  status: "pending" | "loading" | "done" | "error";
}
