import type { GooglePlaceReport } from "./types";

type PlaceReview = GooglePlaceReport["reviews"][number];

const PLACES_API_URL = "https://places.googleapis.com/v1/places:searchText";
const LEGACY_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const LEGACY_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const FIELD_MASK = [
  "places.displayName",
  "places.formattedAddress",
  "places.googleMapsLinks",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.businessStatus",
  "places.regularOpeningHours",
  "places.reviews",
].join(",");

export async function fetchGooglePlaceReport(query: string): Promise<GooglePlaceReport> {
  const lookup = await fetchGooglePlaceReportWithDebug(query);
  return lookup.report;
}

export async function fetchBestGooglePlaceReportWithDebug(
  queries: string[]
): Promise<{ report: GooglePlaceReport; request: unknown; response: unknown; selectedQuery: string | null }> {
  const uniqueQueries = uniquePlaceQueries(queries);
  if (uniqueQueries.length === 0) {
    return {
      report: emptyGooglePlaceReport(),
      request: { queries: [] },
      response: { error: "No Google Places queries provided" },
      selectedQuery: null,
    };
  }

  const lookups = await Promise.all(
    uniqueQueries.map(async (query) => {
      try {
        const lookup = await fetchGooglePlaceReportWithDebug(query);
        return { query, ...lookup };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown Google Places error";
        return {
          query,
          report: emptyGooglePlaceReport(),
          request: { query },
          response: { error: message },
        };
      }
    })
  );
  const bestLookup = lookups
    .slice()
    .sort((a, b) => comparePlaceReports(b.report, a.report))[0];

  return {
    report: bestLookup.report,
    request: {
      queries: uniqueQueries,
      selectedQuery: bestLookup.query,
      lookups: lookups.map((lookup) => ({ query: lookup.query, request: lookup.request })),
    },
    response: {
      selectedQuery: bestLookup.query,
      lookups: lookups.map((lookup) => ({
        query: lookup.query,
        reviewCount: lookup.report.reviewCount,
        rating: lookup.report.rating,
        name: lookup.report.name,
        address: lookup.report.address,
        response: lookup.response,
      })),
    },
    selectedQuery: bestLookup.query,
  };
}

export async function fetchGooglePlaceReportWithDebug(
  query: string
): Promise<{ report: GooglePlaceReport; request: unknown; response: unknown }> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const request = {
    url: PLACES_API_URL,
    method: "POST",
    fieldMask: FIELD_MASK,
    body: { textQuery: query, languageCode: "pl" },
  };

  if (!apiKey) {
    return {
      report: emptyGooglePlaceReport(),
      request,
      response: { error: "GOOGLE_MAPS_API_KEY not set" },
    };
  }

  const newPlacesLookup = await fetchNewPlaces(query, apiKey, request);
  if (newPlacesLookup.report.name || newPlacesLookup.report.mapsUrl || !isNewPlacesDisabled(newPlacesLookup.response)) {
    return newPlacesLookup;
  }

  const legacyLookup = await fetchLegacyPlaces(query, apiKey);
  return {
    report: legacyLookup.report,
    request: {
      primary: request,
      fallback: legacyLookup.request,
    },
    response: {
      primary: newPlacesLookup.response,
      fallback: legacyLookup.response,
    },
  };
}

async function fetchNewPlaces(
  query: string,
  apiKey: string,
  request: NewPlacesRequest
): Promise<{ report: GooglePlaceReport; request: unknown; response: unknown }> {
  const res = await fetch(PLACES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(15000),
  });

  const rawText = await res.text();
  const data = parseJsonOrRawText(rawText);
  const response = { status: res.status, ok: res.ok, body: data };
  const placesData = data as PlacesSearchResponse;

  if (!res.ok) return { report: emptyGooglePlaceReport(), request, response };
  const place = pickBestNewPlace(placesData?.places ?? []);
  if (!place) return { report: emptyGooglePlaceReport(), request, response };

  return {
    report: {
      name: place.displayName?.text ?? null,
      mapsUrl: place.googleMapsLinks?.placeUri ?? null,
      address: place.formattedAddress ?? null,
      rating: place.rating ?? null,
      reviewCount: place.userRatingCount ?? null,
      websiteUri: place.websiteUri ?? null,
      nationalPhoneNumber: place.nationalPhoneNumber ?? null,
      businessStatus: place.businessStatus ?? null,
      openingHours: place.regularOpeningHours?.weekdayDescriptions ?? [],
      ...splitReviews(
        (place.reviews ?? []).map(
          (review: {
            authorAttribution?: { displayName?: string };
            rating?: number;
            text?: { text?: string };
          }) => ({
            author: review.authorAttribution?.displayName ?? null,
            rating: review.rating ?? null,
            text: review.text?.text ?? "",
          })
        )
      ),
    },
    request,
    response,
  };
}

async function fetchLegacyPlaces(
  query: string,
  apiKey: string
): Promise<{ report: GooglePlaceReport; request: unknown; response: unknown }> {
  const textSearchUrl = new URL(LEGACY_TEXT_SEARCH_URL);
  textSearchUrl.search = new URLSearchParams({
    query,
    language: "pl",
    key: apiKey,
  }).toString();

  const textSearchRes = await fetch(textSearchUrl, { signal: AbortSignal.timeout(15000) });
  const textSearchRaw = await textSearchRes.text();
  const textSearchData = parseJsonOrRawText(textSearchRaw) as LegacyTextSearchResponse;
  const textSearchResponse = {
    status: textSearchRes.status,
    ok: textSearchRes.ok,
    body: textSearchData,
  };
  const textSearchPlace = pickBestLegacyTextSearchPlace(textSearchData?.results ?? []);
  const placeId = textSearchPlace?.place_id;

  if (!textSearchRes.ok || !placeId) {
    return {
      report: emptyGooglePlaceReport(),
      request: { textSearch: redactKey(textSearchUrl.toString()) },
      response: { textSearch: textSearchResponse },
    };
  }

  const detailsUrl = new URL(LEGACY_DETAILS_URL);
  detailsUrl.search = new URLSearchParams({
    place_id: placeId,
    language: "pl",
    fields:
      "name,formatted_address,url,rating,user_ratings_total,website,formatted_phone_number,business_status,opening_hours,reviews",
    key: apiKey,
  }).toString();

  const detailsRes = await fetch(detailsUrl, { signal: AbortSignal.timeout(15000) });
  const detailsRaw = await detailsRes.text();
  const detailsData = parseJsonOrRawText(detailsRaw) as LegacyDetailsResponse;
  const detailsResponse = {
    status: detailsRes.status,
    ok: detailsRes.ok,
    body: detailsData,
  };
  const place = detailsData?.result;

  if (!detailsRes.ok || !place) {
    return {
      report: emptyGooglePlaceReport(),
      request: {
        textSearch: redactKey(textSearchUrl.toString()),
        details: redactKey(detailsUrl.toString()),
      },
      response: { textSearch: textSearchResponse, details: detailsResponse },
    };
  }

  return {
    report: {
      name: place.name ?? null,
      mapsUrl: place.url ?? null,
      address: place.formatted_address ?? null,
      rating: place.rating ?? null,
      reviewCount: place.user_ratings_total ?? null,
      websiteUri: place.website ?? null,
      nationalPhoneNumber: place.formatted_phone_number ?? null,
      businessStatus: place.business_status ?? null,
      openingHours: place.opening_hours?.weekday_text ?? [],
      ...splitReviews(
        (place.reviews ?? []).map((review) => ({
          author: review.author_name ?? null,
          rating: review.rating ?? null,
          text: review.text ?? "",
        }))
      ),
    },
    request: {
      textSearch: redactKey(textSearchUrl.toString()),
      details: redactKey(detailsUrl.toString()),
    },
    response: {
      textSearch: textSearchResponse,
      details: detailsResponse,
    },
  };
}

function isNewPlacesDisabled(response: unknown): boolean {
  const body = (response as { body?: { error?: { details?: Array<{ reason?: string }> } } })?.body;
  return body?.error?.details?.some((detail) => detail.reason === "SERVICE_DISABLED") ?? false;
}

function redactKey(url: string): string {
  return url.replace(/([?&]key=)[^&]+/, "$1[redacted]");
}

function emptyGooglePlaceReport(): GooglePlaceReport {
  return {
    name: null,
    mapsUrl: null,
    address: null,
    rating: null,
    reviewCount: null,
    websiteUri: null,
    nationalPhoneNumber: null,
    businessStatus: null,
    openingHours: [],
    reviews: [],
    positiveReviews: [],
    negativeReviews: [],
  };
}

function splitReviews(reviews: PlaceReview[]): Pick<GooglePlaceReport, "reviews" | "positiveReviews" | "negativeReviews"> {
  return {
    reviews: reviews.slice(0, 3),
    positiveReviews: reviews.filter((review) => (review.rating ?? 0) >= 4).slice(0, 5),
    negativeReviews: reviews
      .filter((review) => {
        const rating = review.rating ?? 0;
        return rating >= 1 && rating <= 3;
      })
      .slice(0, 5),
  };
}

function uniquePlaceQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const query of queries) {
    const cleaned = query.replace(/\s+/g, " ").trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function comparePlaceReports(a: GooglePlaceReport, b: GooglePlaceReport): number {
  const aReviews = a.reviewCount ?? a.reviews.length;
  const bReviews = b.reviewCount ?? b.reviews.length;
  if (aReviews !== bReviews) return aReviews - bReviews;

  const aRating = a.rating ?? -1;
  const bRating = b.rating ?? -1;
  if (aRating !== bRating) return aRating - bRating;

  return Number(Boolean(a.name || a.mapsUrl || a.address)) - Number(Boolean(b.name || b.mapsUrl || b.address));
}

function pickBestNewPlace(places: NonNullable<PlacesSearchResponse["places"]>) {
  return places
    .slice()
    .sort((a, b) => (b.userRatingCount ?? -1) - (a.userRatingCount ?? -1))[0];
}

function pickBestLegacyTextSearchPlace(places: NonNullable<LegacyTextSearchResponse["results"]>) {
  return places
    .slice()
    .sort((a, b) => (b.user_ratings_total ?? -1) - (a.user_ratings_total ?? -1))[0];
}

function parseJsonOrRawText(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    return { rawText };
  }
}

interface PlacesSearchResponse {
  places?: Array<{
    displayName?: { text?: string };
    formattedAddress?: string;
    googleMapsLinks?: { placeUri?: string };
    rating?: number;
    userRatingCount?: number;
    websiteUri?: string;
    nationalPhoneNumber?: string;
    businessStatus?: string;
    regularOpeningHours?: { weekdayDescriptions?: string[] };
    reviews?: Array<{
      authorAttribution?: { displayName?: string };
      rating?: number;
      text?: { text?: string };
    }>;
  }>;
}

interface NewPlacesRequest {
  url: string;
  method: string;
  fieldMask: string;
  body: {
    textQuery: string;
    languageCode: string;
  };
}

interface LegacyTextSearchResponse {
  results?: Array<{
    place_id?: string;
    rating?: number;
    user_ratings_total?: number;
  }>;
}

interface LegacyDetailsResponse {
  result?: {
    name?: string;
    formatted_address?: string;
    url?: string;
    rating?: number;
    user_ratings_total?: number;
    website?: string;
    formatted_phone_number?: string;
    business_status?: string;
    opening_hours?: { weekday_text?: string[] };
    reviews?: Array<{
      author_name?: string;
      rating?: number;
      text?: string;
    }>;
  };
}
