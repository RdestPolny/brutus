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
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return emptyGooglePlaceReport();

  const res = await fetch(PLACES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, languageCode: "pl" }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return emptyGooglePlaceReport();

  const data = await res.json();
  const place = data?.places?.[0];
  if (!place) return emptyGooglePlaceReport();

  return {
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
