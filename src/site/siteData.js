// Settings and content for the FunMaps.com website (src/site).

// Where WordPress lives. Articles are still written in WordPress; the website
// reads them through WordPress's built-in REST API. When funmaps.com switches
// to this site, WordPress moves to its own address (e.g. https://cms.funmaps.com)
// and this value changes to match.
export const WORDPRESS_URL = "https://funmaps.com";

// Links that still point at today's WordPress pages until their new versions exist.
export const LEGACY = {
  search: (q) => `${WORDPRESS_URL}/?s=${encodeURIComponent(q)}`,
  about: `${WORDPRESS_URL}/about/`,
  contact: `${WORDPRESS_URL}/contact/`,
  privacy: `${WORDPRESS_URL}/privacy-policy/`,
  newsletter: `${WORDPRESS_URL}/subscriptions/`,
};

export const COMPASS_URL = "https://compass.funmaps.com/";
export const ADVERTISE_URL = "mailto:info@funmaps.com?subject=Advertising%20on%20FunMaps";

// Destinations with a map-first city page at /destinations/<slug>.
// "cities" and "regions" decide which website listings belong to the page:
// a listing's city is stored as "City, ST" or "City, Country".
// "query" searches today's WordPress site for the matching city guide.
// "compass" is the destination name handed to Compass.
const BROWARD_GAY_AREA = ["Fort Lauderdale", "Wilton Manors", "Oakland Park"];

export const DESTINATIONS = [
  // Fort Lauderdale, Wilton Manors and Oakland Park sit side by side, so their
  // pages share the same places (BROWARD_GAY_AREA); each map stays zoomed on
  // its own city ("fitToPins: false") instead of zooming out to every pin.
  {
    slug: "fort-lauderdale", name: "Fort Lauderdale", query: "Fort Lauderdale", compass: "Fort Lauderdale, FL",
    cities: BROWARD_GAY_AREA, regions: [], center: [26.135, -80.135], zoom: 12, fitToPins: false, tint: "#B7563C",
  },
  {
    slug: "wilton-manors", name: "Wilton Manors", query: "Wilton Manors", compass: "Wilton Manors, FL",
    cities: BROWARD_GAY_AREA, regions: [], center: [26.1606, -80.1376], zoom: 15, fitToPins: false, tint: "#C2477A",
  },
  {
    slug: "oakland-park", name: "Oakland Park", query: "Oakland Park", compass: "Oakland Park, FL",
    cities: BROWARD_GAY_AREA, regions: [], center: [26.1723, -80.132], zoom: 14, fitToPins: false, tint: "#A86A2E",
  },
  {
    slug: "new-york-city", name: "New York City", query: "New York", compass: "New York, NY",
    cities: ["New York", "New York City", "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"], regions: [],
    center: [40.735, -73.99], zoom: 12, tint: "#4E5B8C",
  },
  {
    slug: "atlanta", name: "Atlanta", query: "Atlanta", compass: "Atlanta, GA",
    cities: ["Atlanta", "Decatur"], regions: [],
    center: [33.78, -84.38], zoom: 12, tint: "#7D3A86",
  },
  {
    slug: "san-juan", name: "San Juan", query: "San Juan", compass: "San Juan, Puerto Rico",
    cities: ["San Juan", "Condado", "Carolina", "Isla Verde"], regions: [],
    center: [18.45, -66.06], zoom: 12, tint: "#2F7F88",
  },
  {
    slug: "costa-rica", name: "Costa Rica", query: "Costa Rica", compass: "Costa Rica",
    cities: [], regions: ["Costa Rica"],
    center: [9.75, -84.0], zoom: 7, tint: "#5E7C4A",
  },
  {
    slug: "michigan", name: "Michigan", query: "Michigan", compass: "Michigan",
    cities: [], regions: ["MI", "Michigan"],
    center: [43.4, -85.4], zoom: 6, tint: "#9E4466",
  },
];

// Does a listing's "City, ST" / "City, Country" belong to this destination?
export function inDestination(dest, cityString) {
  const [city = "", region = ""] = String(cityString || "").split(",").map((x) => x.trim().toLowerCase());
  return dest.cities.some((c) => c.toLowerCase() === city) || dest.regions.some((r) => r.toLowerCase() === region);
}

// Travel themes on the homepage's "Browse by tribe" row (alphabetical).
// Each links to matching FunMaps articles.
export const TRIBES = [
  { name: "Cruises", query: "cruise" },
  { name: "Luxury", query: "luxury" },
  { name: "On a Budget", query: "budget" },
  { name: "Travel Deals", query: "deals" },
  { name: "Weddings", query: "wedding" },
];

export const BRAND = {
  ink: "#1A1226",
  muted: "#5E536B",
  body: "#3D3349",
  line: "#EEE8F2",
  soft: "#F7F2FA",
  magenta: "#8E2A8E",
  orange: "#E0712F",
  orangeDark: "#B84F1C",
  teal: "#0E7C84",
  tealDark: "#0B5F65",
  gold: "#F2B544",
  night: "#24152F",
};
