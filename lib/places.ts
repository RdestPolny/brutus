import type { GooglePlaceReport } from "./types";

const PLACES_API_URL = "https://places.googleapis.com/v1/places:searchText";
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
  const place = placesData?.places?.[0];
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
      reviews: (place.reviews ?? []).slice(0, 3).map(
        (review: {
          authorAttribution?: { displayName?: string };
          rating?: number;
          text?: { text?: string };
        }) => ({
          author: review.authorAttribution?.displayName ?? null,
          rating: review.rating ?? null,
          text: review.text?.text ?? "",
        })
      ),
    },
    request,
    response,
  };
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
  };
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
