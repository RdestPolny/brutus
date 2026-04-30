export interface ReportInput {
  nip: string;
  companyName?: string;
}

export interface CompanyRegistryRow {
  name: string;
  nip: string;
  regon: string;
  krs: string;
  address: string;
  legalForm: string;
  shareCapital: string;
  registrationDate: string;
  mainActivity: string;
  revenue: string;
  opinions: string;
}

export interface DigitalPresenceRow {
  platform: string;
  address: string;
  details: string;
}

export interface PerplexityFactRow {
  category: string;
  value: string;
  source: string;
}

export interface WebsiteFact {
  category: string;
  label: string;
  value: string;
  sourceQuote: string;
  confidence: "high" | "medium" | "low";
}

export interface WebsiteFactsValidation {
  summary: string;
  validatedFacts: Array<{
    category: string;
    value: string;
    status: "confirmed" | "conflict" | "website_only" | "perplexity_only" | "unclear";
    note: string;
  }>;
  conflicts: Array<{
    field: string;
    websiteValue: string;
    perplexityValue: string;
    note: string;
  }>;
  missingOnWebsite: string[];
  missingInPerplexity: string[];
}

export interface WebsiteFactsReport {
  url: string | null;
  textLength: number;
  facts: WebsiteFact[];
  summary: string;
  validation: WebsiteFactsValidation | null;
}

export interface GoWorkRow {
  category: string;
  label: string;
  value: string;
  sourceQuote: string;
}

export interface GoWorkReview {
  author: string;
  date: string;
  type: string;
  sentiment: "positive" | "negative" | "neutral" | "unknown";
  text: string;
  reactionCount: string;
  companyReply: string;
}

export interface GoWorkFinancialRow {
  year: string;
  revenue: string;
  grossProfit: string;
}

export interface GoWorkPageReport {
  title: string;
  url: string;
  rows: GoWorkRow[];
  reviews: GoWorkReview[];
  financials: GoWorkFinancialRow[];
}

export interface GoWorkReport {
  profileUrl: string | null;
  searchRawMarkdown: string;
  pages: GoWorkPageReport[];
}

export interface KrsFact {
  category: string;
  label: string;
  value: string;
  source: string;
}

export interface KrsPerson {
  role: string;
  name: string;
  function: string;
  suspended: boolean | null;
}

export interface KrsActivity {
  code: string;
  description: string;
  isMain: boolean;
}

export interface KrsFiling {
  type: string;
  filedAt: string;
  period: string;
}

export interface KrsReport {
  krs: string | null;
  sourceUrl: string | null;
  fullSourceUrl: string | null;
  status: "found" | "not_found" | "skipped" | "error";
  message: string | null;
  facts: KrsFact[];
  boardMembers: KrsPerson[];
  supervisoryBoardMembers: KrsPerson[];
  shareholders: KrsFact[];
  activities: KrsActivity[];
  branches: KrsFact[];
  filings: KrsFiling[];
  transformations: KrsFact[];
  recentChanges: KrsFact[];
}

export interface GooglePlaceReport {
  name: string | null;
  mapsUrl: string | null;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  websiteUri: string | null;
  nationalPhoneNumber: string | null;
  businessStatus: string | null;
  openingHours: string[];
  reviews: Array<{
    author: string | null;
    rating: number | null;
    text: string;
  }>;
  positiveReviews: Array<{
    author: string | null;
    rating: number | null;
    text: string;
  }>;
  negativeReviews: Array<{
    author: string | null;
    rating: number | null;
    text: string;
  }>;
}

export interface ApiDebugStep {
  name: string;
  request: unknown;
  response: unknown;
}

export interface CompanyReport {
  input: ReportInput;
  generatedAt: string;
  registry: {
    rawMarkdown: string;
    rows: CompanyRegistryRow[];
  };
  digitalPresence: {
    rawMarkdown: string;
    rows: DigitalPresenceRow[];
  };
  perplexityFacts: {
    rawMarkdown: string;
    rows: PerplexityFactRow[];
  };
  websiteFacts: WebsiteFactsReport;
  goWork: GoWorkReport;
  krs: KrsReport;
  googlePlace: GooglePlaceReport;
  debug?: {
    registryPrompt?: string;
    registryResponse?: string;
    registryRawResponse?: unknown;
    websiteFactsPerplexityPrompt?: string;
    websiteFactsPerplexityResponse?: string;
    websiteFactsPerplexityRawResponse?: unknown;
    websiteFactsRawResponse: unknown;
    websiteFactsValidationRawResponse?: unknown;
    goWorkRawResponse: unknown;
    krsRawResponse: unknown;
    digitalPresencePrompt: string;
    digitalPresenceResponse: string;
    digitalPresenceRawResponse: unknown;
    websitePresenceRawResponse: unknown;
    placesQuery: string;
    placesRawResponse: unknown;
    officialWebsite: string | null;
    resolvedWebsite: string | null;
    steps: ApiDebugStep[];
  };
}
