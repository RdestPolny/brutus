export interface ReportInput {
  nip: string;
}

export interface CompanyRegistryRow {
  name: string;
  krs: string;
  address: string;
  legalForm: string;
  shareCapital: string;
  registrationDate: string;
  mainActivity: string;
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
  googlePlace: GooglePlaceReport;
  debug?: {
    registryPrompt: string;
    registryResponse: string;
    registryRawResponse: unknown;
    websiteFactsPerplexityPrompt: string;
    websiteFactsPerplexityResponse: string;
    websiteFactsPerplexityRawResponse: unknown;
    websiteFactsRawResponse: unknown;
    websiteFactsValidationRawResponse: unknown;
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
