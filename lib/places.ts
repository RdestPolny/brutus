const PLACES_API_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.id,places.displayName,places.rating,places.userRatingCount,places.googleMapsLinks,places.formattedAddress,places.reviews";

export interface PlaceData {
  mapsLink: string | null;
  rating: number | null;
  reviewCount: number | null;
  formattedAddress: string | null;
  topReviews: string[]; // max 3 excerpts
  context: string; // formatted for Gemini prompt
}

export async function fetchPlaceData(
  companyName: string,
  address: string | null
): Promise<PlaceData> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return emptyPlaceData();

  const query = address ? `${companyName} ${address}` : companyName;

  try {
    const res = await fetch(PLACES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, languageCode: "pl" }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return emptyPlaceData();

    const data = await res.json();
    const place = data?.places?.[0];
    if (!place) return emptyPlaceData();

    const topReviews = (place.reviews ?? [])
      .slice(0, 3)
      .map((r: { text?: { text?: string }; rating?: number }) =>
        [r.rating && `${r.rating}/5`, r.text?.text].filter(Boolean).join(": ")
      )
      .filter(Boolean) as string[];

    const mapsLink = place.googleMapsLinks?.placeUri ?? null;
    const rating = place.rating ?? null;
    const reviewCount = place.userRatingCount ?? null;
    const formattedAddress = place.formattedAddress ?? null;

    const parts: string[] = ["=== GOOGLE MAPS / PLACES API ==="];
    if (mapsLink) parts.push(`Wizytówka Google Maps: ${mapsLink}`);
    if (rating !== null) parts.push(`Ocena: ${rating}/5 (${reviewCount ?? "?"} opinii)`);
    if (formattedAddress) parts.push(`Adres (Google): ${formattedAddress}`);
    if (topReviews.length > 0) parts.push(`Przykładowe opinie:\n${topReviews.join("\n")}`);

    return { mapsLink, rating, reviewCount, formattedAddress, topReviews, context: parts.join("\n") };
  } catch {
    return emptyPlaceData();
  }
}

function emptyPlaceData(): PlaceData {
  return { mapsLink: null, rating: null, reviewCount: null, formattedAddress: null, topReviews: [], context: "" };
}
