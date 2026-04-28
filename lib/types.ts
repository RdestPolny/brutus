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
  googlePlace: GooglePlaceReport;
  debug?: {
    registryPrompt: string;
    digitalPresencePrompt: string;
    placesQuery: string;
  };
}
