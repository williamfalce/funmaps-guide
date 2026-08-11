// Featured Partners — venues that pay or arrange to be guaranteed a spot
// in every itinerary generated for their city.
//
// HOW TO ADD ONE:
// 1. Find (or add) the city's key below — use lowercase, matching how the
//    AI is likely to name the city (e.g. "new orleans", "mexico city").
// 2. Add an object to that city's array with the fields shown in the example.
// 3. Save, then redeploy (git add / commit / push) — see README for the steps.
//
// These are shown to travelers in a clearly-labeled "Featured Partner"
// section, separate from the AI-generated recommendations, so it's always
// an honest sponsored placement rather than blended in as if organic.

export const FEATURED_VENUES = {
  // "new orleans": [
  //   {
  //     name: "Example Bar & Kitchen",
  //     category: "food", // one of: nightlife | culture | food | outdoors | community
  //     address: "123 Bourbon St, New Orleans, LA",
  //     website: "https://example.com",
  //     note: "Queer-owned kitchen serving Creole classics — mention FunMaps for a free round of beignets.",
  //   },
  // ],
};

// Looks up featured venues for a city name, matching loosely
// (case-insensitive, ignores minor punctuation/whitespace differences).
export function getFeaturedVenues(cityName) {
  if (!cityName) return [];
  const normalize = (s) => s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "");
  const target = normalize(cityName);
  for (const key of Object.keys(FEATURED_VENUES)) {
    if (normalize(key) === target || target.includes(normalize(key)) || normalize(key).includes(target)) {
      return FEATURED_VENUES[key];
    }
  }
  return [];
}
