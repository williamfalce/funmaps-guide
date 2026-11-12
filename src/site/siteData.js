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

// Destinations featured on the homepage. Each links to its city page; until
// the new map-first city pages are built, that is a search of the current site.
export const DESTINATIONS = [
  { name: "Fort Lauderdale & Wilton Manors", query: "Fort Lauderdale", tint: "#B7563C" },
  { name: "New York City", query: "New York", tint: "#4E5B8C" },
  { name: "Atlanta", query: "Atlanta", tint: "#7D3A86" },
  { name: "San Juan", query: "San Juan", tint: "#2F7F88" },
  { name: "Costa Rica", query: "Costa Rica", tint: "#5E7C4A" },
  { name: "Michigan", query: "Michigan", tint: "#9E4466" },
];

// Today's FunMaps "Fun Things To Do" themes, shown as "Browse by tribe".
export const TRIBES = [
  { name: "Bear Necessities", query: "bear" },
  { name: "Leather", query: "leather" },
  { name: "Luxury", query: "luxury" },
  { name: "Cruises", query: "cruise" },
  { name: "Weddings", query: "wedding" },
  { name: "Travel deals", query: "deals" },
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
