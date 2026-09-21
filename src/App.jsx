import { useState, useRef, useEffect, Component } from "react";
import { Compass, MapPin, Sparkles, Shield, Calendar, Hotel, Send, Loader2, Heart, Sun, Moon, Utensils, Save, Printer, FolderOpen, X, Trash2, Plane, Bus, DollarSign, Stethoscope, CloudSun, Globe, Navigation, BadgeCheck, Camera, Smile, ArrowRight, Share2, Download, Phone, Ticket, ShoppingBag, Info } from "lucide-react";
import funmapsLogo from "./assets/funmaps-logo.png";
import vintageCompass from "./assets/vintage-compass.png";
async function getBanners(cityName) {
  try {
    const res = await fetch(`/api/banners?city=${encodeURIComponent(cityName)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.banners || [];
  } catch {
    return []; // fails quietly — itinerary still works fine without banner ads
  }
}

async function getAllActivePartners() {
  // Fetched unfiltered (no ?city=) since at prompt-build time we don't yet know
  // exactly how the AI will format the destination ("Miami" vs "Miami, FL").
  // The AI does its own city-matching using its own geographic judgment,
  // which is more robust here than our exact-string matching.
  try {
    const res = await fetch(`/api/banners`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.banners || []).filter((b) => b.active !== false);
  } catch {
    return [];
  }
}

function sortPartners(partners) {
  return [...partners].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "premium" ? -1 : 1;
    return (a.businessName || "").localeCompare(b.businessName || "");
  });
}

function buildPartnerPromptSection(partners) {
  if (!partners.length) return "";
  const accommodations = partners.filter((p) => p.category === "Accommodations");
  const others = partners.filter((p) => p.category !== "Accommodations");
  let section = "";
  if (accommodations.length > 0) {
    section += `\n\nACCOMMODATIONS PARTNERS — we have a paid partnership with these specific properties: ${accommodations
      .map((p) => `"${p.businessName}" in ${p.city}`)
      .join(
        "; "
      )}. If the traveler's destination matches one of these cities (use your own judgment on the match, e.g. "Miami" matches "Miami, FL"), do NOT write a specific hotel check-in/accommodations activity for that city at all — we display the actual partner separately, at the top of that city's section. Just move straight into other Day 1 activities (arrival logistics, food, sightseeing) without naming or suggesting any hotel for that city.`;
  }
  if (others.length > 0) {
    section += `\n\nOTHER CATEGORY PARTNERS — we have paid partnerships with these specific businesses: ${others
      .map((p) => `"${p.businessName}" (${p.category}) in ${p.city}`)
      .join(
        "; "
      )}. If the traveler's destination matches one of these cities, avoid recommending a DIRECTLY COMPETING business in that same category for that city (e.g. don't suggest a different nightlife venue if we have a Bars&Clubs partner there). You may mention our partner by name once in a relevant activity if it fits naturally, but it's not required — the main thing is just avoiding direct competition with it.`;
  }
  return section;
}

function trackBannerClick(bannerId) {
  // fire-and-forget — never block or delay the user's click-through
  fetch("/api/banner-click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: bannerId }),
  }).catch(() => {});
}

async function getSponsorships(cityName) {
  try {
    const res = await fetch(`/api/sponsorships?city=${encodeURIComponent(cityName)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.sponsorships || [];
  } catch {
    return []; // fails quietly — itinerary still works fine without a sponsor
  }
}

function trackSponsorshipClick(sponsorId) {
  fetch("/api/sponsorship-click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: sponsorId }),
  }).catch(() => {});
}

const CATEGORY_META = {
  nightlife: { icon: Moon, color: "#B23A72" },
  culture: { icon: Compass, color: "#9B2FA0" },
  food: { icon: Utensils, color: "#F2984A" },
  outdoors: { icon: Sun, color: "#1C9C9C" },
  community: { icon: Heart, color: "#D9662E" },
};

// Business partner categories — separate from the AI's activity-tagging categories
// above. These are what shows in the admin dropdown for Featured Partners and
// Banner Ads, since partners are real businesses, not itinerary activities.
const PARTNER_CATEGORIES = ["Accommodations", "Arts&Entertainment", "Attractions", "Bars&Clubs", "Events", "Resources", "Restaurants", "Shopping&Services", "Weddings"];

const PARTNER_CATEGORY_META = {
  "Accommodations": { icon: Hotel, color: "#9B2FA0" },
  "Arts&Entertainment": { icon: Ticket, color: "#B23A72" },
  "Attractions": { icon: Camera, color: "#F2984A" },
  "Bars&Clubs": { icon: Moon, color: "#8C3AA8" },
  "Events": { icon: Calendar, color: "#1C9C9C" },
  "Resources": { icon: Info, color: "#6B8FA3" },
  "Restaurants": { icon: Utensils, color: "#D9662E" },
  "Shopping&Services": { icon: ShoppingBag, color: "#C77D2E" },
  "Weddings": { icon: Heart, color: "#C2477A" },
};

// Maps a partner category to the AI's activity category, so a "Bars&Clubs" banner
// still correctly slots in after nightlife activities, etc. Categories with no
// natural day-by-day match (Accommodations, Resources, Weddings) return null —
// those use their own dedicated placement instead (see banner placement logic).
const PARTNER_TO_ACTIVITY_CATEGORY = {
  "Bars&Clubs": "nightlife",
  "Restaurants": "food",
  "Arts&Entertainment": "culture",
  "Attractions": "culture",
  "Events": "community",
  "Shopping&Services": "culture",
  "Accommodations": null,
  "Resources": null,
  "Weddings": null,
};

function WaveText({ text }) {
  return (
    <span>
      {text.split("").map((ch, i) => (
        <span
          key={i}
          style={{ display: "inline-block", animation: "qc-letterwave 1.6s ease-in-out infinite", animationDelay: `${i * 0.035}s` }}
        >
          {ch === " " ? "\u00A0" : ch}
        </span>
      ))}
    </span>
  );
}

function SponsorshipBanner({ sponsor, cityName }) {
  if (!sponsor) return null;
  return (
    <div
      className="no-print"
      style={{
        position: "relative",
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 16,
        height: 160,
      }}
    >
      <img src={sponsor.imageUrl} alt={sponsor.businessName} style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, #1B1030ee 30%, #1B103099 60%, transparent)" }} />
      <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 20px", maxWidth: "75%" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: "#F5EFE699" }}>CITY SPONSOR</span>
        <span style={{ fontWeight: 700, fontSize: 19, color: "#F5EFE6", marginTop: 2 }}>{sponsor.businessName}</span>
        {sponsor.tagline && <span style={{ fontSize: 13.5, color: "#F5EFE6cc", marginTop: 4 }}>{sponsor.tagline}</span>}
        {(sponsor.address || sponsor.phone) && (
          <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 6 }}>
            {sponsor.address && (
              <a href={directionsUrl(sponsor.address, cityName || sponsor.city)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1" style={{ color: "#F5EFE6cc", fontSize: 11.5, textDecoration: "none" }}>
                <Navigation size={10} /> {sponsor.address}
              </a>
            )}
            {sponsor.phone && (
              <a href={`tel:${sponsor.phone.replace(/[^0-9+]/g, "")}`} className="flex items-center gap-1" style={{ color: "#F5EFE6cc", fontSize: 11.5, textDecoration: "none" }}>
                <Phone size={10} /> {sponsor.phone}
              </a>
            )}
          </div>
        )}
        <a
          href={normalizeUrl(sponsor.ctaLink) || "#"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackSponsorshipClick(sponsor.id)}
          style={{ fontSize: 12.5, color: "#D9662E", fontWeight: 700, marginTop: 8, textDecoration: "none", display: "inline-block" }}
        >
          {sponsor.ctaText || "Learn More"} →
        </a>
      </div>
    </div>
  );
}

function BannerAd({ banner, cityName }) {
  if (!banner) return null;
  const isPremium = banner.tier === "premium";
  return (
    <div
      className="no-print"
      style={{
        background: "#241640",
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        border: isPremium ? "2px solid #F5EFE6" : "none",
      }}
    >
      {isPremium && banner.imageUrl && (
        <img src={banner.imageUrl} alt={banner.businessName} style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 10, marginBottom: 12 }} />
      )}
      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 4 }}>
        {!isPremium && <PartnerIcon category={banner.category} />}
        <span style={{ fontWeight: 700, fontSize: 15.5, color: "#F5EFE6" }}>{banner.businessName}</span>
        {isPremium ? (
          <span style={{ background: "#F5EFE6", color: "#1B1030", fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>★ RECOMMENDED PARTNER</span>
        ) : (
          <span style={{ background: "#1C9C9C22", color: "#1C9C9C", fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>FEATURED PARTNER</span>
        )}
        <PriceBadge level={banner.priceTier} />
      </div>

      {banner.tagline && <p style={{ fontSize: 13.5, color: "#F5EFE6aa", marginBottom: 8 }}>{banner.tagline}</p>}

      {(banner.address || banner.phone || banner.ctaLink || banner.bookingLink) && (
        <div className="flex flex-wrap items-center gap-3 mb-2">
          {banner.address && (
            <a href={directionsUrl(banner.address, cityName || banner.city)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1" style={{ color: "#F5EFE688", fontSize: 12, textDecoration: "none" }}>
              <Navigation size={11} /> {banner.address}
            </a>
          )}
          {banner.phone && (
            <a href={`tel:${banner.phone.replace(/[^0-9+]/g, "")}`} className="flex items-center gap-1" style={{ color: "#F5EFE688", fontSize: 12, textDecoration: "none" }}>
              <Phone size={11} /> {banner.phone}
            </a>
          )}
          {banner.ctaLink && (
            <a href={normalizeUrl(banner.ctaLink)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1" style={{ color: "#1C9C9C", fontSize: 12, textDecoration: "none" }}>
              <Globe size={11} /> Website
            </a>
          )}
          {banner.bookingLink && (
            <a href={normalizeUrl(banner.bookingLink)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1" style={{ color: "#D9662E", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
              <Calendar size={11} /> Book Now
            </a>
          )}
        </div>
      )}

      {banner.promoCode && (
        <div style={{ background: "#1B1030", border: "1px dashed #D9662E80", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
          {banner.promoIncentive && <p style={{ fontSize: 12.5, color: "#F5EFE6cc", marginBottom: 3 }}>{banner.promoIncentive}</p>}
          <span style={{ fontSize: 12, fontWeight: 700, color: "#D9662E", letterSpacing: 0.3 }}>USE CODE: {banner.promoCode}</span>
        </div>
      )}

      <a
        href={normalizeUrl(banner.ctaLink) || "#"}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackBannerClick(banner.id)}
        style={{ display: "inline-block", fontSize: 12.5, color: "#D9662E", fontWeight: 700, textDecoration: "none" }}
      >
        {banner.ctaText || "Learn More"} →
      </a>
    </div>
  );
}

function VibeDot({ category }) {
  const meta = CATEGORY_META[category] || CATEGORY_META.culture;
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ width: 26, height: 26, background: `${meta.color}22`, color: meta.color }}
    >
      <Icon size={14} />
    </span>
  );
}

function PartnerIcon({ category }) {
  const meta = PARTNER_CATEGORY_META[category] || PARTNER_CATEGORY_META["Attractions"];
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ width: 26, height: 26, background: `${meta.color}22`, color: meta.color }}
    >
      <Icon size={14} />
    </span>
  );
}

function normalizeUrl(url) {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function directionsUrl(address, cityName) {
  const q = encodeURIComponent(`${address}, ${cityName}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

function FriendlyBadge({ level }) {
  if (level === "verified") {
    return (
      <span className="inline-flex items-center gap-1" style={{ background: "#9B2FA022", color: "#9B2FA0", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999 }}>
        <BadgeCheck size={11} /> LGBTQ+ verified
      </span>
    );
  }
  if (level === "welcoming") {
    return (
      <span style={{ background: "#1C9C9C22", color: "#1C9C9C", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999 }}>
        Welcoming
      </span>
    );
  }
  return null;
}

function PriceBadge({ level }) {
  if (!level) return null;
  return (
    <span style={{ background: "#E8B84B22", color: "#E8B84B", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{level}</span>
  );
}

// Calls our own serverless proxy (/api/claude) instead of Anthropic directly —
// the API key lives on the server, never in the browser.
async function callClaude(messages, system, max_tokens) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages, max_tokens }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return (data.content || []).map((b) => b.text || "").join("\n");
}

// Booking.com affiliate link, routed through CJ (Commission Junction).
// PID/AID identify your CJ account + this specific Booking.com program.
// Format confirmed working: base click-tracking link + ?url=<destination>&sid=<label>
const CJ_PID = import.meta.env.VITE_CJ_PID || "101859204";
const CJ_AID = import.meta.env.VITE_CJ_AID || "17323532";

function bookingUrl(cityName, checkIn, checkOut) {
  const params = new URLSearchParams({ ss: cityName });
  if (checkIn) params.set("checkin", checkIn);
  if (checkOut) params.set("checkout", checkOut);
  const destination = `https://www.booking.com/searchresults.html?${params.toString()}`;
  if (!CJ_PID || !CJ_AID) return destination; // fallback if not configured
  const label = `compass-${cityName.toLowerCase().replace(/\s+/g, "-")}`;
  return `http://www.jdoqocy.com/click-${CJ_PID}-${CJ_AID}?url=${encodeURIComponent(destination)}&sid=${encodeURIComponent(label)}`;
}

function cjWrap(destination, label) {
  if (!CJ_PID || !CJ_AID) return destination; // fallback if not configured
  return `http://www.jdoqocy.com/click-${CJ_PID}-${CJ_AID}?url=${encodeURIComponent(destination)}&sid=${encodeURIComponent(label)}`;
}

function flightsUrl() {
  return cjWrap("https://www.booking.com/flights/index.html", "compass-flights");
}

// Booking.com's Attractions pages need an exact country code + URL slug per city
// (unlike Hotels, which accepts any free-text city name). Add confirmed real
// entries here as you verify them — anything not listed falls back to the
// safe generic Attractions landing page instead of risking a broken link.
const ATTRACTIONS_CITY_SLUGS = {
  miami: { country: "us", slug: "miami" },
  "fort lauderdale": { country: "us", slug: "fort-lauderdale" },
  "new york": { country: "us", slug: "new-york" },
  atlanta: { country: "us", slug: "atlanta" },
  "wilton manors": { country: "us", slug: "fort-lauderdale" }, // Wilton Manors doesn't have a confirmed dedicated Attractions page; routed to Fort Lauderdale since it's part of that metro area
};

function attractionsUrl(cityName) {
  const label = `compass-attractions-${cityName.toLowerCase().replace(/\s+/g, "-")}`;
  const match = ATTRACTIONS_CITY_SLUGS[cityName.toLowerCase().trim()];
  const destination = match
    ? `https://www.booking.com/attractions/city/${match.country}/${match.slug}.html`
    : "https://www.booking.com/attractions/index.html";
  return cjWrap(destination, label);
}

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const d1 = new Date(checkIn + "T00:00:00");
  const d2 = new Date(checkOut + "T00:00:00");
  const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : null;
}

function safeDestroyAllMaps(mapInstancesRef, mapResizeObserversRef) {
  Object.values(mapResizeObserversRef.current).forEach((observer) => {
    try {
      observer.disconnect();
    } catch (e) {
      console.error("Observer cleanup failed (non-fatal):", e);
    }
  });
  mapResizeObserversRef.current = {};
  Object.values(mapInstancesRef.current).forEach((map) => {
    try {
      map.remove();
    } catch (e) {
      console.error("Map cleanup failed (non-fatal):", e);
    }
  });
  mapInstancesRef.current = {};
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const MAX_TRIP_DAYS = 10; // longer trips produce more content than fits in one response reliably

function maxCheckoutISO(checkInDate) {
  const base = checkInDate ? new Date(checkInDate + "T00:00:00") : new Date();
  base.setDate(base.getDate() + MAX_TRIP_DAYS);
  return base.toISOString().slice(0, 10);
}

// Known clusters of small, closely-adjacent cities that should always be
// combined into ONE itinerary entry (one map, one section) rather than split
// apart or forced into separate structural entries — the AI reliably treats
// these as one practical area anyway, so this leans into that instead of
// fighting it. Add more clusters here if other adjacent-city groups show the
// same behavior.
const CITY_CLUSTERS = [
  {
    label: "Wilton Manors / Oakland Park / Fort Lauderdale, FL",
    members: ["Wilton Manors", "Oakland Park", "Fort Lauderdale"],
    // The combined label above isn't a real, geocodable place — no mapping
    // service can make sense of three city names slashed together. This is
    // a genuine, individually-geocodable anchor point used only for centering
    // the map, never shown to the traveler.
    geocodeAs: "Fort Lauderdale, FL",
  },
];

function detectCityCluster(destText) {
  const lower = (destText || "").toLowerCase();
  return CITY_CLUSTERS.find((cluster) => cluster.members.some((m) => lower.includes(m.toLowerCase())));
}

function geocodableCityQuery(cityName) {
  const cluster = CITY_CLUSTERS.find((c) => c.label === cityName);
  return cluster ? cluster.geocodeAs : cityName;
}

function collapseClusteredDestinations(destArray) {
  const result = [];
  const usedClusterLabels = new Set();
  destArray.forEach((d) => {
    const cluster = detectCityCluster(d);
    if (cluster) {
      if (!usedClusterLabels.has(cluster.label)) {
        usedClusterLabels.add(cluster.label);
        result.push(cluster.label);
      }
    } else {
      result.push(d);
    }
  });
  return result;
}

function trackEvent(name, params) {
  // Fails silently if GA hasn't loaded yet, is blocked by an ad blocker, or
  // hasn't been configured — never let analytics break the actual app.
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", name, params || {});
    }
  } catch {
    // ignore
  }
}

function normalizeDestinationCasing(destString) {
  // Defensive normalization — capitalizes each word so casing can never be a
  // factor in how reliably the AI generates a response, regardless of how a
  // traveler happens to type it (e.g. "new york" -> "New York").
  return (destString || "").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseExpectedDestinations(destString) {
  // Splits on "then" or commas — matches how the AI is instructed to interpret
  // multi-destination input (e.g. "Bangkok then Chiang Mai" or "Mexico City, Oaxaca").
  return (destString || "")
    .split(/\bthen\b|,/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractItineraryJson(text) {
  let clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  clean = clean.slice(start, end + 1);
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

const ITINERARY_JSON_SCHEMA = `{
  "tripLength": number,
  "summary": string (2-3 sentences covering the whole trip),
  "cities": [
    {
      "name": string (ALWAYS include the state or country for disambiguation, formatted exactly as "City, ST" for US cities using the 2-letter state abbreviation, e.g. "Oakland Park, FL", or "City, Country" for international cities, e.g. "Paris, France" — never just a bare city name, since many city names are duplicated worldwide and this is the only reliable way to distinguish them),
      "days": number,
      "airport": string (nearest major airport, name + code, one short sentence on getting into the city from it),
      "currency": string (currency name/code, and one short sentence on cards vs cash, ATM availability),
      "transportation": string (2-3 sentences on getting around: public transit, whether Uber/rideshare/taxis are reliable, walkability),
      "weather": string (1-2 sentences on typical/seasonal climate a visitor should expect and pack for — general guidance, not a live forecast),
      "safetyOverview": string (2-3 sentences: legal climate for LGBTQ+ travelers, general welcome level, anything to be mindful of),
      "healthTips": string (1-2 sentences: tap water safety, sun/altitude/climate precautions, routine travel health basics),
      "vaccinesNote": string (1-2 sentences: routine/recommended vaccines or health precautions for this destination, especially relevant for travelers with children — say plainly if nothing special is needed),
      "neighborhoods": [ { "name": string, "vibe": string } ] (2-4 items),
      "itinerary": [
        {
          "day": number (local day number within this city, starting at 1),
          "title": string,
          "activities": [
            {
              "time": string,
              "name": string,
              "description": string,
              "category": "nightlife"|"culture"|"food"|"outdoors"|"community",
              "address": string (a real, specific address or at minimum a neighborhood/area if unsure of the exact street number — never invent a precise address you're not confident in),
              "website": string (a real website URL if you're reasonably confident one exists, otherwise an empty string — never invent a URL),
              "lgbtqFriendly": "verified" | "welcoming" | "unconfirmed" ("verified" = explicitly queer-owned/queer space, "welcoming" = generally inclusive though not queer-specific, "unconfirmed" = no specific info either way),
              "priceLevel": "$" | "$$" | "$$$" (a general budget category for this type of place — "$" budget/inexpensive, "$$" mid-range, "$$$" upscale/luxury — base this on typical costs for this kind of venue, never a specific dollar figure you can't verify)
            }
          ]
        }
      ]
    }
  ]
}`;

const ITINERARY_SYSTEM = `You are Compass, an expert LGBTQ+ travel concierge for FunMaps. The traveler may give ONE destination or MULTIPLE (comma or "then" separated, e.g. "Bangkok then Chiang Mai" or "Mexico City, Oaxaca"). Split trip length sensibly across cities if multiple. Return ONLY valid JSON (no markdown fences, no preamble) matching exactly this schema:
${ITINERARY_JSON_SCHEMA}
Keep activities realistic and specific to each real destination. Prioritize queer-owned or queer-friendly spots and genuinely relevant community spaces. When unsure of a specific business name, address, or website, describe the type of place and use a neighborhood-level location instead of inventing details.

CRITICAL — one "cities" array entry per distinct destination the traveler named, even if they're small and geographically adjacent: if the traveler asks for multiple specific destinations (e.g. "Wilton Manors then Oakland Park then Fort Lauderdale"), you MUST create a SEPARATE top-level entry in the "cities" array for EACH one they named — do not merge two or more of them into a single combined entry just because they're neighboring towns, part of the same metro area, or geographically close together. Wilton Manors, Oakland Park, and Fort Lauderdale, FL are three distinct municipalities that sit right next to each other — each one the traveler explicitly names must get its own "cities" entry with its own name, its own days count, and its own itinerary, never folded into a neighboring city's entry.

CRITICAL — activity placement in multi-city trips, especially closely-clustered neighboring cities/suburbs (e.g. Wilton Manors, Oakland Park, and Fort Lauderdale, FL, which sit right next to each other): every activity's "address" MUST genuinely be located within the city object it's nested under in the JSON. Double-check each activity's actual city before placing it — do not place a Wilton Manors venue under Oakland Park's "cities" entry (or vice versa) just because they're close together or you're unsure. If a venue's exact city is ambiguous, either verify it belongs to the city you're currently building, or place it under the correct neighboring city's own entry instead — never guess and misfile it.

CRITICAL — do not confidently assert that a destination lacks LGBTQ+ nightlife, community spaces, or a queer scene just because you don't have detailed information about it. Absence of information is not evidence of absence, especially for smaller or less-documented cities. If you're not confident about specific venues in a destination, say so honestly (e.g. "specific venues are hard to confirm from here — local LGBTQ+ community groups, apps, or asking at your accommodation are the most reliable way to find current spots") rather than stating outright that nothing exists. Never write a safetyOverview or activity list that flatly claims "no gay nightlife" or equivalent — that claim requires real confidence, not just a gap in your knowledge.

BUDGET PREFERENCE: if the traveler specified a budget preference (Budget $, Mid-Range $$, and/or Luxury $$$), weight your activity selections toward those price levels — if they picked only "$", favor genuinely affordable options; if they picked "$$$", favor upscale ones; if they picked more than one tier, mix across those tiers. If no budget preference is given, use a natural, varied mix. Regardless of preference, every single activity still needs an honest "priceLevel" tag reflecting what it actually typically costs — never mislabel a place's real price level just to match what the traveler asked for.`;

const ITINERARY_MODIFY_SYSTEM = `You are Compass, an expert LGBTQ+ travel concierge for FunMaps, helping a traveler modify an itinerary they already have. You will be given the current itinerary as JSON, plus a request describing the change they want (e.g. "add another day," "swap day 2 for something more low-key," "add more nightlife to Miami").

Apply the requested change and return the COMPLETE UPDATED itinerary as JSON, matching exactly this schema:
${ITINERARY_JSON_SCHEMA}

Keep everything unrelated to the request unchanged. If adding a day, continue numbering from the highest existing day number for that city and update that city's "days" count and the overall "tripLength" to match. Return ONLY the JSON — no markdown fences, no preamble, no explanation text outside the JSON. Follow the same realism and honesty standards as the original itinerary: don't invent addresses/websites you're not confident about, and never confidently claim a destination lacks LGBTQ+ spaces just from a knowledge gap.`;

const INTEREST_OPTIONS = [
  "LGBTQ+ nightlife",
  "Queer-owned restaurants",
  "Gay-friendly neighborhoods to stay",
  "Pride events & community spaces",
  "Museums & culture",
  "Beaches & outdoors",
  "Low-key & relaxed pace",
  "Party-heavy pace",
  "Traveling with children",
];

const BUDGET_OPTIONS = [
  { value: "$", label: "Budget" },
  { value: "$$", label: "Mid-Range" },
  { value: "$$$", label: "Luxury" },
];

const LOCAL_KEY = "compass-trips";

function readLocalTrips() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocalTrips(trips) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(trips));
  } catch {}
}

function CompassApp() {
  const [destination, setDestination] = useState("");
  const [arrivedPreFilled, setArrivedPreFilled] = useState(false);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [selectedBudgetTiers, setSelectedBudgetTiers] = useState([]);
  const [extraNotes, setExtraNotes] = useState("");

  // --- PWA install prompt ---
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [showIOSInstallHint, setShowIOSInstallHint] = useState(false);
  const [showIOSNonSafariHint, setShowIOSNonSafariHint] = useState(false);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (isStandalone) return; // already installed — never show the prompt

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    if (isIOS) {
      // Chrome, Firefox, and Edge on iOS all inject their own token into the
      // user agent even though they run on Safari's underlying engine — and
      // their "Add to Home Screen" support (if any) lives in a different spot
      // than Safari's, and only works reliably on iOS 16.4+. Rather than
      // chasing that inconsistency, just point non-Safari users to Safari.
      const isNonSafariBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
      if (isNonSafariBrowser) {
        setShowIOSNonSafariHint(true);
      } else {
        setShowIOSInstallHint(true);
      }
      return;
    }

    function handleBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  async function handleInstallClick() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    setDeferredInstallPrompt(null);
  }

  function toggleInterest(tag) {
    setSelectedInterests((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }
  function toggleBudgetTier(value) {
    setSelectedBudgetTiers((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }
  const [loading, setLoading] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  // Rotating, staged loading messages — the AI genuinely does all this work as
  // part of one generation, but showing it as visible "stages" makes a long
  // wait feel far more tolerable than one static, unchanging message. People
  // are much more patient when they can see progress happening, even when the
  // actual total wait time hasn't changed at all.
  const loadingMessages = destination
    ? [
        `Finding LGBTQ+-friendly spots in ${destination}...`,
        "Checking safety and community info...",
        "Matching recommendations to your interests...",
        "Building your day-by-day itinerary...",
        "Adding maps and booking links...",
        "Almost there — putting the final touches on your trip...",
      ]
    : [
        "Finding LGBTQ+-friendly spots...",
        "Checking safety and community info...",
        "Matching recommendations to your interests...",
        "Building your day-by-day itinerary...",
        "Adding maps and booking links...",
        "Almost there — putting the final touches on your trip...",
      ];

  useEffect(() => {
    if (!loading) {
      setLoadingMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingMessageIndex((i) => Math.min(i + 1, loadingMessages.length - 1));
    }, 3200);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  const [error, setError] = useState("");
  const [itinerary, setItinerary] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  const [showTrips, setShowTrips] = useState(false);
  const [savedTrips, setSavedTrips] = useState([]);
  const [saveStatus, setSaveStatus] = useState("");
  const [segmentNumber, setSegmentNumber] = useState(1);
  const [plannedDates, setPlannedDates] = useState({ checkIn: "", checkOut: "" });
  const [pendingAvoidVenues, setPendingAvoidVenues] = useState([]);
  const [tripLoadId, setTripLoadId] = useState(0);
  const [cityImages, setCityImages] = useState({});
  const [cityBanners, setCityBanners] = useState({});
  const [citySponsors, setCitySponsors] = useState({});
  const [mapPins, setMapPins] = useState([]);
  const [geocodingProgress, setGeocodingProgress] = useState({});
  const mapContainerRefs = useRef({});
  const mapInstancesRef = useRef({});
  const mapResizeObserversRef = useRef({});
  const resultsTopRef = useRef(null);

  // Deep-linking: /?destination=Fort%20Lauderdale&checkin=2026-11-10&checkout=2026-11-14&interests=LGBTQ%2B%20nightlife,Museums%20%26%20culture
  // Also still supports the older ?days=4 format (without dates) for any existing links already out there.
  // Pre-fills the form so buttons on other FunMaps pages can link straight into
  // a ready-to-go trip for that city — but deliberately does NOT auto-generate.
  // A traveler arriving this way still hasn't had a chance to set Budget tier
  // or add their own notes, so we let them review and click "Plan my trip"
  // themselves once they're happy with everything, rather than skipping
  // straight past those choices.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlDestination = params.get("destination");
    if (!urlDestination) return;
    const urlCheckIn = params.get("checkin") || "";
    const urlCheckOut = params.get("checkout") || "";
    const urlInterests = params.get("interests") ? params.get("interests").split(",").map((s) => s.trim()).filter(Boolean) : [];
    setDestination(urlDestination);
    if (urlCheckIn) setCheckIn(urlCheckIn);
    if (urlCheckOut) setCheckOut(urlCheckOut);
    if (urlInterests.length) setSelectedInterests(urlInterests);
    setArrivedPreFilled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (itinerary) resultsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [itinerary]);

  useEffect(() => {
    if (chat.length > 0) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  useEffect(() => {
    if (!itinerary?.cities) return;
    setCityImages({});
    itinerary.cities.forEach(async (city) => {
      try {
        const res = await fetch(`/api/unsplash?query=${encodeURIComponent(city.name + " travel")}`);
        if (!res.ok) return; // fails quietly — image section just won't render for this city
        const data = await res.json();
        setCityImages((prev) => ({ ...prev, [city.name]: data }));
      } catch {
        // ignore — no image is a fine fallback
      }
    });
  }, [itinerary]);

  useEffect(() => {
    if (!itinerary?.cities) return;
    setCityBanners({});
    itinerary.cities.forEach(async (city) => {
      const banners = await getBanners(city.name);
      if (banners.length) setCityBanners((prev) => ({ ...prev, [city.name]: banners }));
    });
  }, [itinerary]);

  useEffect(() => {
    if (!itinerary?.cities) return;
    setCitySponsors({});
    itinerary.cities.forEach(async (city) => {
      const sponsors = await getSponsorships(city.name);
      if (sponsors.length) {
        // Multiple sponsors for the same city rotate — pick one at random each time.
        const chosen = sponsors[Math.floor(Math.random() * sponsors.length)];
        setCitySponsors((prev) => ({ ...prev, [city.name]: chosen }));
      }
    });
  }, [itinerary]);

  useEffect(() => {
    if (!itinerary?.cities) return;
    setMapPins([]);
    let cancelled = false;

    async function geocode(query) {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    }

    function buildGeocodeQuery(address, cityName) {
      // Normalize en-dashes/em-dashes (common in address ranges like "1035–1037")
      // to plain hyphens, since some geocoders handle these poorly.
      const cleaned = address.replace(/[\u2013\u2014]/g, "-");
      // For a combined cluster label (e.g. "Wilton Manors / Oakland Park / Fort
      // Lauderdale, FL"), use the real, geocodable anchor city instead — no
      // mapping service can parse three slash-separated city names, and a real
      // street address would never literally contain that full combined string,
      // so without this every single activity in a cluster city would fail to
      // geocode, not just the city-center pin.
      const geocodableCity = geocodableCityQuery(cityName);
      // If the address already contains the city name (admins sometimes enter a
      // full address including city/state/zip), don't append it again — a
      // duplicated city string can confuse the geocoder into a bad, low-confidence match.
      const cityCore = (geocodableCity || "").split(",")[0].trim().toLowerCase();
      if (cityCore && cleaned.toLowerCase().includes(cityCore)) return cleaned;
      return `${cleaned}, ${geocodableCity}`;
    }

    // Self-correction for closely-clustered neighboring cities (e.g. Wilton Manors
    // vs Oakland Park vs Fort Lauderdale): if an address explicitly names a
    // DIFFERENT city from this trip than the one it's nested under, trust the
    // address and route its pin to that city's map instead — safer than trusting
    // which city section the AI happened to file it under.
    const allCityNames = itinerary.cities.map((c) => c.name);
    function resolveActualCity(address, fallbackCityName) {
      const addressLower = address.toLowerCase();
      for (const cn of allCityNames) {
        const core = cn.split(",")[0].trim().toLowerCase();
        if (core && core !== fallbackCityName.split(",")[0].trim().toLowerCase() && addressLower.includes(core)) {
          return cn;
        }
      }
      return fallbackCityName;
    }

    async function run() {
      // Build the full list of things to pin: city center + every activity with an
      // address + every partner (Featured/Recommended/Banner) with an address, tagged by city.
      // Partner addresses are fetched directly here (not read from the separate
      // cityBanners state) to avoid a timing race — that state fetches independently
      // and might not have resolved yet when this effect starts building targets.
      const targets = [];
      for (const city of itinerary.cities) {
        targets.push({ query: geocodableCityQuery(city.name), name: city.name, category: "city", cityName: city.name });
        city.itinerary?.forEach((d) => {
          d.activities?.forEach((a) => {
            if (a.address) {
              const actualCity = resolveActualCity(a.address, city.name);
              targets.push({ query: buildGeocodeQuery(a.address, actualCity), name: a.name, category: a.category, cityName: actualCity });
            }
          });
        });
        const partners = await getBanners(city.name);
        partners.forEach((p) => {
          if (p.address) {
            const actualCity = resolveActualCity(p.address, city.name);
            targets.push({ query: buildGeocodeQuery(p.address, actualCity), name: p.businessName, category: "partner", cityName: actualCity });
          }
        });
        const sponsors = await getSponsorships(city.name);
        sponsors.forEach((s) => {
          if (s.address) {
            const actualCity = resolveActualCity(s.address, city.name);
            targets.push({ query: buildGeocodeQuery(s.address, actualCity), name: s.businessName, category: "partner", cityName: actualCity });
          }
        });
      }

      const totalsByCity = {};
      targets.forEach((t) => {
        totalsByCity[t.cityName] = (totalsByCity[t.cityName] || 0) + 1;
      });
      const progress = {};
      Object.keys(totalsByCity).forEach((c) => (progress[c] = { done: 0, total: totalsByCity[c] }));
      setGeocodingProgress(progress);

      for (let i = 0; i < targets.length; i++) {
        if (cancelled) return;
        const t = targets[i];
        const coords = await geocode(t.query);
        if (coords && !cancelled) {
          setMapPins((prev) => [...prev, { ...t, ...coords }]);
        }
        setGeocodingProgress((prev) => ({ ...prev, [t.cityName]: { done: (prev[t.cityName]?.done || 0) + 1, total: totalsByCity[t.cityName] } }));
        if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 1100)); // respect Nominatim's ~1req/sec policy
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [itinerary]);

  useEffect(() => {
    if (!window.L) return;
    const pinsByCity = {};
    mapPins.forEach((pin) => {
      (pinsByCity[pin.cityName] = pinsByCity[pin.cityName] || []).push(pin);
    });

    Object.keys(pinsByCity).forEach((cityName) => {
      try {
        const container = mapContainerRefs.current[cityName];
        const pins = pinsByCity[cityName];
        if (!container || !container.isConnected || pins.length === 0) return;

        if (!mapInstancesRef.current[cityName]) {
          const map = window.L.map(container);
          window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          }).addTo(map);
          map._markersLayer = window.L.layerGroup().addTo(map);
          mapInstancesRef.current[cityName] = map;

          // Keep the map correctly sized even if the layout shifts later
          // (e.g. the city photo above it finishing loading) — Leaflet
          // otherwise caches the container size from the moment of creation
          // and tiles can render blank/misaligned after any later resize.
          if (typeof ResizeObserver !== "undefined") {
            try {
              const observer = new ResizeObserver(() => {
                try {
                  map.invalidateSize();
                } catch (e) {
                  // ignore — map may have just been destroyed
                }
              });
              observer.observe(container);
              mapResizeObserversRef.current[cityName] = observer;
            } catch (e) {
              console.error("Could not attach map ResizeObserver (non-fatal):", e);
            }
          }
        }

        const map = mapInstancesRef.current[cityName];
        map._markersLayer.clearLayers();

        pins.forEach((pin) => {
          const isCity = pin.category === "city";
          const isPartner = pin.category === "partner";
          const color = isCity ? "#9B2FA0" : isPartner ? "#D9662E" : (CATEGORY_META[pin.category] || CATEGORY_META.culture).color;
          const size = isCity ? 32 : isPartner ? 30 : 24;
          const html = isPartner
            ? `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 0 8px rgba(217,102,46,0.8);display:flex;align-items:center;justify-content:center;color:white;font-size:${size * 0.55}px;line-height:1;">★</div>`
            : `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 0 6px rgba(0,0,0,0.5);"></div>`;
          const icon = window.L.divIcon({ className: "", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
          const label = isPartner ? `★ ${pin.name} (Partner)` : pin.name;
          window.L.marker([pin.lat, pin.lon], { icon }).bindPopup(`<strong>${label}</strong>`).addTo(map._markersLayer);
        });

        const bounds = window.L.latLngBounds(pins.map((p) => [p.lat, p.lon]));
        map.fitBounds(bounds, { padding: [30, 30] });
        setTimeout(() => map.invalidateSize(), 0);
      } catch (e) {
        console.error(`Map render failed for ${cityName} (non-fatal):`, e);
      }
    });
  }, [mapPins]);

  function continueTrip(city) {
    const nextCheckInDate = new Date(checkOut + "T00:00:00"); // checkout day becomes next check-in
    const nextCheckIn = nextCheckInDate.toISOString().slice(0, 10);

    const avoidVenues = [];
    city.itinerary?.forEach((d) => d.activities?.forEach((a) => a.name && avoidVenues.push(a.name)));

    setDestination(city.name);
    setCheckIn(nextCheckIn);
    setCheckOut(""); // left blank — traveler picks how many more days they want
    setPendingAvoidVenues(avoidVenues);
    window.scrollTo({ top: 0, behavior: "smooth" }); // bring them back to the form to pick check-out
  }

  function openTripsPanel() {
    setSavedTrips(readLocalTrips().sort((a, b) => b.savedAt - a.savedAt));
    setShowTrips(true);
  }

  async function planTrip(destOverride, checkInOverride, checkOutOverride, interestsOverride, legacyDaysOverride, avoidVenues) {
    const dest = destOverride !== undefined ? destOverride : destination;
    const ci = checkInOverride !== undefined ? checkInOverride : checkIn;
    const co = checkOutOverride !== undefined ? checkOutOverride : checkOut;
    const interestsList = interestsOverride !== undefined ? interestsOverride : selectedInterests;
    const legacyDays = legacyDaysOverride !== undefined ? legacyDaysOverride : null;

    if (!dest.trim()) {
      setError("Tell me where you're headed first.");
      return;
    }
    const nights = nightsBetween(ci, co);
    if (!nights && !legacyDays) {
      setError("Pick your check-in and check-out dates.");
      return;
    }
    if (nights && nights > MAX_TRIP_DAYS) {
      setError(`Trips longer than ${MAX_TRIP_DAYS} days can take too long to generate reliably — try splitting it into shorter date ranges.`);
      return;
    }
    setError("");
    setLoading(true);
    setItinerary(null);
    safeDestroyAllMaps(mapInstancesRef, mapResizeObserversRef);
    setSaveStatus("");
    try {
      const dayCount = nights || legacyDays;
      const interestsStr = [interestsList.join(", "), extraNotes.trim()].filter(Boolean).join("; ") || "open to anything, surprise me";
      const budgetLine =
        selectedBudgetTiers.length > 0
          ? `\nBudget preference: ${selectedBudgetTiers.map((v) => BUDGET_OPTIONS.find((o) => o.value === v)?.label || v).join(", ")}.`
          : "";
      const dateLine = nights
        ? `Travel dates: ${ci} to ${co} (${nights} day${nights === 1 ? "" : "s"}) — use these actual dates for seasonal/weather guidance.`
        : `Total trip length: ${dayCount} days (no specific dates given).`;
      const avoidLine =
        avoidVenues && avoidVenues.length > 0
          ? `\nThis is a continuation of an earlier trip to the same destination. Do NOT repeat any of these places already visited — suggest different options instead: ${avoidVenues.join(", ")}.`
          : "";
      const allPartners = await getAllActivePartners();
      const partnerLine = buildPartnerPromptSection(allPartners);
      const matchedCluster = detectCityCluster(dest);
      const clusterLine = matchedCluster
        ? `\n\nCITY CLUSTER INSTRUCTION: The traveler's destination includes one or more of these closely-clustered adjacent cities: ${matchedCluster.members.join(
            ", "
          )}, FL. Treat ALL of these as ONE SINGLE combined "cities" array entry named exactly "${matchedCluster.label}" — do NOT create separate entries for each one. Within that one combined entry's day-by-day itinerary, include a genuinely BALANCED mix of venues from all of ${matchedCluster.members.join(
            ", "
          )} — not mostly from just one of them. If the traveler also named other unrelated destinations outside this cluster, still create separate normal entries for those.`
        : "";
      const normalizedDest = normalizeDestinationCasing(dest);
      const prompt = `Destination(s): ${normalizedDest}\n${dateLine}\nInterests / notes: ${interestsStr}${budgetLine}${avoidLine}${partnerLine}${clusterLine}`;
      const text = await callClaude([{ role: "user", content: prompt }], ITINERARY_SYSTEM, 8000);
      let parsed = extractItineraryJson(text);

      // Safety net: an occasional AI response can come back malformed or cut off
      // before valid JSON completes — this is a normal, known category of LLM
      // variability, not something specific to any particular input. Rather than
      // showing the traveler a scary error on the very first hiccup, retry once
      // silently before giving up.
      if (!parsed) {
        console.error("First itinerary attempt didn't return valid JSON — retrying once.");
        try {
          const retryText = await callClaude([{ role: "user", content: prompt }], ITINERARY_SYSTEM, 8000);
          parsed = extractItineraryJson(retryText);
        } catch {
          // retry itself failed — parsed stays null, falls through to the error below
        }
      }
      if (!parsed) throw new Error("Response was not valid JSON, likely cut off before it could finish.");

      // Safety net: if the traveler named more destinations than the AI actually
      // returned as separate cities (e.g. it merged two adjacent small towns into
      // one), retry once with an explicit, forceful correction — prompting alone
      // doesn't always reliably prevent this for closely-clustered cities.
      // A recognized cluster collapses to ONE expected destination, since that's
      // now the intentional behavior for those specific cities.
      const expectedDestinations = collapseClusteredDestinations(parseExpectedDestinations(dest));
      if (expectedDestinations.length > 1 && (parsed.cities?.length || 0) < expectedDestinations.length) {
        console.error(`City count mismatch: expected ${expectedDestinations.length} (${expectedDestinations.join(", ")}), got ${parsed.cities?.length || 0}. Retrying once.`);
        const retryPrompt = `${prompt}\n\nIMPORTANT CORRECTION: your previous attempt merged some of these destinations together into fewer cities than requested. The traveler named these ${expectedDestinations.length} SEPARATE destinations: ${expectedDestinations.join(", ")}. You MUST return exactly ${expectedDestinations.length} separate entries in the "cities" array, one for each — even if some are small towns right next to each other. Do not merge any of them.`;
        try {
          const retryText = await callClaude([{ role: "user", content: retryPrompt }], ITINERARY_SYSTEM, 8000);
          const retryParsed = extractItineraryJson(retryText);
          if (retryParsed && (retryParsed.cities?.length || 0) >= (parsed.cities?.length || 0)) {
            parsed = retryParsed;
          }
        } catch {
          // retry failed — fall back to the original (merged) result rather than losing the trip entirely
        }
      }

      setItinerary(parsed);
      setTripLoadId((id) => id + 1);
      setChat([]);
      setPlannedDates({ checkIn: ci, checkOut: co });
      trackEvent(avoidVenues && avoidVenues.length > 0 ? "continue_trip" : "itinerary_generated", {
        destination: normalizedDest,
        num_cities: parsed.cities?.length || 0,
      });
      setSegmentNumber(avoidVenues && avoidVenues.length > 0 ? segmentNumber + 1 : 1);
    } catch (e) {
      console.error("planTrip failed:", e); // check browser console (F12) for the real underlying error if this keeps happening
      setError(
        e.message?.includes("cut off")
          ? "That itinerary got too long to finish generating — try fewer days, fewer cities, or fewer interest tags at once."
          : "Couldn't build that itinerary — try rephrasing the destination(s) or interests."
      );
    } finally {
      setLoading(false);
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || !itinerary) return;
    const userMsg = chatInput.trim();
    const nextChat = [...chat, { role: "user", content: userMsg }];
    setChat(nextChat);
    setChatInput("");
    setChatLoading(true);
    try {
      const allPartners = await getAllActivePartners();
      const partnerLine = buildPartnerPromptSection(allPartners);
      const existingCityNames = (itinerary.cities || []).map((c) => c.name).join(", ");
      const matchedCluster = detectCityCluster(existingCityNames);
      const clusterLine = matchedCluster
        ? `\n\nCITY CLUSTER INSTRUCTION: this itinerary includes the combined "${matchedCluster.label}" entry, covering ${matchedCluster.members.join(", ")}, FL together. Keep it as ONE combined entry — do not split it into separate cities when making this edit.`
        : "";
      const contextPrompt = `Current itinerary JSON:\n${JSON.stringify(itinerary)}\n\nTraveler's requested change: ${userMsg}${partnerLine}${clusterLine}`;
      const text = await callClaude([{ role: "user", content: contextPrompt }], ITINERARY_MODIFY_SYSTEM, 8000);
      const updated = extractItineraryJson(text);
      if (updated && updated.cities) {
        safeDestroyAllMaps(mapInstancesRef, mapResizeObserversRef);
        setMapPins([]);
        setItinerary(updated);
        setTripLoadId((id) => id + 1);
        setChat([...nextChat, { role: "assistant", content: "Done — updated your itinerary above with that change." }]);
      } else {
        // Fall back to a plain conversational reply if the structured update didn't come back cleanly
        const fallbackText = await callClaude(
          [{ role: "user", content: `${contextPrompt}\n\nRespond conversationally, plain text, 2-5 sentences, since I couldn't apply this as a direct edit.` }],
          "You are Compass, a warm, knowledgeable LGBTQ+ travel concierge helping refine an existing itinerary."
        );
        setChat([...nextChat, { role: "assistant", content: fallbackText }]);
      }
    } catch (e) {
      setChat([...nextChat, { role: "assistant", content: "Hmm, I lost my signal there — mind trying that again?" }]);
    } finally {
      setChatLoading(false);
    }
  }

  function saveTrip() {
    if (!itinerary) return;
    const cityLabel = itinerary.cities?.map((c) => c.name).join(" + ") || destination;
    const dateLabel = plannedDates.checkIn && plannedDates.checkOut ? ` (${formatDate(plannedDates.checkIn)} – ${formatDate(plannedDates.checkOut)})` : "";
    const label = `${cityLabel}${dateLabel}`;
    const trips = readLocalTrips();
    trips.push({ id: `${Date.now()}`, label, savedAt: Date.now(), itinerary, chat, destination, plannedDates, segmentNumber });
    writeLocalTrips(trips);
    setSaveStatus("saved");
    trackEvent("save_trip", { destination: cityLabel });
  }

  function printTrip() {
    trackEvent("print_trip", {});
    window.print();
  }

  function buildShareText() {
    if (!itinerary) return "";
    const lines = [];
    const cityNames = itinerary.cities?.map((c) => c.name).join(" → ") || destination;
    lines.push(`✈️ ${cityNames} — Queer Compass Travel Guide`);
    if (plannedDates.checkIn && plannedDates.checkOut) {
      lines.push(`${segmentNumber > 1 ? `Segment ${segmentNumber}: ` : ""}${formatDate(plannedDates.checkIn)} – ${formatDate(plannedDates.checkOut)}`);
    }
    lines.push("");
    lines.push(itinerary.summary || "");
    itinerary.cities?.forEach((city) => {
      lines.push("");
      lines.push(`📍 ${city.name} (${city.days} day${city.days === 1 ? "" : "s"})`);
      city.itinerary?.forEach((d) => {
        lines.push(`Day ${d.day} — ${d.title}`);
        d.activities?.forEach((a) => {
          lines.push(`  ${a.time} · ${a.name}`);
        });
      });
    });
    lines.push("");
    lines.push("Plan your own trip: https://funmaps-guide-lemon.vercel.app/");
    return lines.join("\n");
  }

  async function shareTrip() {
    const text = buildShareText();
    trackEvent("share_trip", {});
    try {
      await navigator.share({
        title: `${itinerary.cities?.map((c) => c.name).join(" + ")} — Queer Compass Trip`,
        text,
      });
    } catch (e) {
      // AbortError just means the person closed the share sheet without picking anything — not a real error
      if (e.name !== "AbortError") console.error("Share failed:", e);
    }
  }

  function downloadTrip() {
    const text = buildShareText();
    trackEvent("download_trip", {});
    const cityLabel = itinerary.cities?.map((c) => c.name).join("-").toLowerCase().replace(/\s+/g, "-") || "trip";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cityLabel}-itinerary.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function loadTrip(id) {
    const trips = readLocalTrips();
    const found = trips.find((t) => t.id === id);
    if (!found) return;
    const itin = found.itinerary;
    safeDestroyAllMaps(mapInstancesRef, mapResizeObserversRef);
    setMapPins([]);
    setItinerary(itin);
    setTripLoadId((id) => id + 1);
    setChat(found.chat || []);
    setDestination(found.destination || "");
    setPlannedDates(found.plannedDates || { checkIn: "", checkOut: "" });
    setSegmentNumber(found.segmentNumber || 1);
    setShowTrips(false);
    setSaveStatus("");
  }

  function deleteTrip(id) {
    const trips = readLocalTrips().filter((t) => t.id !== id);
    writeLocalTrips(trips);
    setSavedTrips(trips.sort((a, b) => b.savedAt - a.savedAt));
  }

  return (
    <div style={{ background: "#1B1030", minHeight: "100vh", fontFamily: "Inter, sans-serif", color: "#F5EFE6" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap');
        .display { font-family: 'Fraunces', serif; }
        input, textarea { font-family: 'Inter', sans-serif; }
        ::placeholder { color: #6B6B6B !important; opacity: 1 !important; }

        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-only-logo { display: inline-flex !important; }
          * { background: transparent !important; color: #1B1030 !important; box-shadow: none !important; border-color: #ddd !important; }
          body { background: #ffffff !important; }
        }

        .qc-btn-dark:hover { background: #2A1B47 !important; }
        .qc-btn-booking:hover { background: #00265E !important; }
        .qc-btn-send:hover:not(:disabled) { background: #17847F !important; }
        .qc-btn-orange:hover:not(:disabled) { background: #C1571F !important; }

        @media (max-width: 480px) {
          .qc-header-logo { height: 44px !important; }
          .qc-trip-grid { grid-template-columns: 1fr !important; }
          .qc-info-grid { grid-template-columns: 1fr !important; }
        }

        @media (min-width: 481px) and (max-width: 700px) {
          .qc-info-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }

        @media (max-width: 900px) {
          .qc-itin-header { flex-direction: column !important; align-items: flex-start !important; }
          .qc-itin-actions { width: 100% !important; }
        }

        .qc-input-field:hover { background: #D6BFD4 !important; }
        .qc-input-field:focus-within { background: #D6BFD4 !important; }

        @keyframes qc-letterwave {
          0%, 100% { color: #1B1030; }
          50% { color: #FFFFFF; }
        }
        @keyframes qc-progress-fill {
          0% { width: 4%; }
          100% { width: 92%; }
        }
      `}</style>

      {!installBannerDismissed && (deferredInstallPrompt || showIOSInstallHint || showIOSNonSafariHint) && (
        <div
          className="no-print"
          style={{
            background: "#241640",
            borderBottom: "1px solid #D9662E40",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            flexWrap: "wrap",
            textAlign: "center",
            fontSize: 13,
          }}
        >
          {deferredInstallPrompt ? (
            <>
              <span>Want quicker access next time? You can install Compass to your home screen (totally optional).</span>
              <button
                onClick={handleInstallClick}
                style={{ background: "#D9662E", color: "#1B1030", fontWeight: 700, padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5 }}
              >
                Install App
              </button>
            </>
          ) : showIOSNonSafariHint ? (
            <span>
              If you'd like quicker access next time (totally optional), copy this page's link and open it in the <strong>Safari</strong> app — Chrome on iOS doesn't support installing apps as reliably.
            </span>
          ) : (
            <span>
              Want quicker access next time? You can optionally add Compass to your home screen: tap <strong>Share</strong> below, then <strong>"Add to Home Screen."</strong>
            </span>
          )}
          <button
            onClick={() => setInstallBannerDismissed(true)}
            aria-label="Dismiss"
            style={{ background: "none", border: "none", color: "#F5EFE688", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 24px 0" }} className="no-print">
        <div className="flex items-center justify-between">
          <div>
            <span style={{ display: "inline-flex", alignItems: "flex-end" }}>
              <img src={funmapsLogo} alt="FunMaps" className="qc-header-logo" style={{ height: 70, width: "auto", maxWidth: "100%" }} />
              <span style={{ fontSize: 16, color: "#F5EFE699", marginLeft: -6, marginBottom: 4 }}>™</span>
            </span>
          </div>
          <button
            onClick={openTripsPanel}
            className="flex items-center gap-1.5"
            style={{ background: "#241640", color: "#F5EFE6", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
          >
            <FolderOpen size={14} /> My Trips
          </button>
        </div>
      </div>

      <div style={{ padding: "4px 24px 32px", maxWidth: 880, margin: "0 auto" }} className="no-print">
        <div className="flex items-center gap-6 flex-wrap" style={{ marginBottom: 24 }}>
          <img src={vintageCompass} alt="FunMaps Compass" style={{ width: 140, height: "auto", flexShrink: 0 }} />
          <div style={{ flex: "1 1 320px" }}>
            <h1 className="display" style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.2, marginBottom: 14 }}>
              <span style={{ color: "#E8B84B" }}>FunMaps Compass,</span>
              <sup style={{ fontSize: "0.4em", color: "#E8B84B" }}>™</sup>
              <br />
              <span style={{ color: "#F5EFE6", fontSize: 22 }}>Your Guide to </span>
              <span style={{ color: "#1C9C9C", fontSize: 22 }}>LGBTQ+ Friendly Adventures.</span>
            </h1>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <span className="flex items-center gap-2" style={{ fontSize: 14.5, color: "#F5EFE6" }}>
                <Camera size={17} color="#D9662E" /> <strong>Discover</strong>&nbsp;Amazing Places
              </span>
              <span className="flex items-center gap-2" style={{ fontSize: 14.5, color: "#F5EFE6" }}>
                <Globe size={17} color="#1C9C9C" /> <strong>Book</strong>&nbsp;Everything Online
              </span>
              <span className="flex items-center gap-2" style={{ fontSize: 14.5, color: "#F5EFE6" }}>
                <Smile size={17} color="#E8B84B" /> <strong>Experience</strong>&nbsp;Like a Local
              </span>
            </div>
          </div>
        </div>

        {arrivedPreFilled && (
          <div
            className="no-print"
            style={{ background: "#1C9C9C22", border: "1px solid #1C9C9C60", borderRadius: 10, padding: "10px 16px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}
          >
            <span style={{ fontSize: 13, color: "#F5EFE6" }}>
              We've filled in what you told us on the homepage — feel free to adjust anything below, including interests and budget, then hit <strong>Plan my trip</strong> when you're ready.
            </span>
            <button
              onClick={() => setArrivedPreFilled(false)}
              aria-label="Dismiss"
              style={{ background: "none", border: "none", color: "#F5EFE688", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        )}

        <div style={{ background: "#241640", borderRadius: 16, padding: 24, border: "1px solid #B23A7220" }} className="no-print">
          <div className="qc-trip-grid grid gap-4" style={{ gridTemplateColumns: "1.6fr 1fr 1fr", display: "grid" }}>
            <div>
              <label style={{ fontSize: 12, color: "#D9662E", fontWeight: 600 }}>DESTINATION(S)</label>
              <div className="qc-input-field flex items-center gap-2 mt-1" style={{ background: "#C9AEC7", border: "1px solid #1B103015", borderRadius: 10, padding: "10px 14px", transition: "background 0.15s ease" }}>
                <MapPin size={16} color="#B23A72" />
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Wilton Manors then Miami"
                  style={{ background: "transparent", border: "none", outline: "none", color: "#1B1030", width: "100%" }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#D9662E", fontWeight: 600 }}>CHECK-IN</label>
              <div className="qc-input-field flex items-center gap-2 mt-1" style={{ background: "#C9AEC7", border: "1px solid #1B103015", borderRadius: 10, padding: "10px 14px", transition: "background 0.15s ease" }}>
                <Calendar size={16} color="#1C9C9C" />
                <input
                  type="date"
                  value={checkIn}
                  min={todayISO()}
                  onChange={(e) => setCheckIn(e.target.value)}
                  style={{ background: "transparent", border: "none", outline: "none", color: checkIn ? "#1B1030" : "#6B6B6B", width: "100%", colorScheme: "light" }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#D9662E", fontWeight: 600 }}>CHECK-OUT</label>
              <div className="qc-input-field flex items-center gap-2 mt-1" style={{ background: "#C9AEC7", border: "1px solid #1B103015", borderRadius: 10, padding: "10px 14px", transition: "background 0.15s ease" }}>
                <Calendar size={16} color="#1C9C9C" />
                <input
                  type="date"
                  value={checkOut}
                  min={checkIn || todayISO()}
                  max={maxCheckoutISO(checkIn)}
                  onChange={(e) => setCheckOut(e.target.value)}
                  style={{ background: "transparent", border: "none", outline: "none", color: checkOut ? "#1B1030" : "#6B6B6B", width: "100%", colorScheme: "light" }}
                />
              </div>
            </div>
          </div>
          {pendingAvoidVenues.length > 0 && (
            <p style={{ fontSize: 12.5, color: "#D9662E", fontWeight: 600, marginTop: 8 }}>
              Continuing your trip — check-in is set to right after your last stretch. Pick a check-out date for how many more days you want, then hit Plan my trip.
            </p>
          )}
          {nightsBetween(checkIn, checkOut) && (
            <p style={{ fontSize: 12.5, color: "#F5EFE699", marginTop: 8 }}>
              {nightsBetween(checkIn, checkOut)} day{nightsBetween(checkIn, checkOut) === 1 ? "" : "s"} trip
            </p>
          )}
          <p style={{ fontSize: 12, color: "#F5EFE688", marginTop: 4 }}>
            Planning something longer than {MAX_TRIP_DAYS} days? Plan it in {MAX_TRIP_DAYS}-day stretches — e.g. days 1–{MAX_TRIP_DAYS} first, then start a new plan for the days after that.
          </p>
          <div className="mt-4">
            <label style={{ fontSize: 12, color: "#D9662E", fontWeight: 600 }}>WHAT ARE YOU INTO? (optional, pick any)</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {INTEREST_OPTIONS.map((tag) => {
                const active = selectedInterests.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleInterest(tag)}
                    style={{
                      background: active ? "#D9662E" : "#1B1030",
                      color: active ? "#1B1030" : "#F5EFE6cc",
                      border: active ? "1px solid #D9662E" : "1px solid #F5EFE620",
                      borderRadius: 999,
                      padding: "7px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3">
            <label style={{ fontSize: 12, color: "#D9662E", fontWeight: 600 }}>BUDGET? (optional, pick any)</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {BUDGET_OPTIONS.map((opt) => {
                const active = selectedBudgetTiers.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleBudgetTier(opt.value)}
                    style={{
                      background: active ? "#D9662E" : "#1B1030",
                      color: active ? "#1B1030" : "#F5EFE6cc",
                      border: active ? "1px solid #D9662E" : "1px solid #F5EFE620",
                      borderRadius: 999,
                      padding: "7px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {opt.value} {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-3">
            <label style={{ fontSize: 12, color: "#D9662E", fontWeight: 600 }}>ANYTHING ELSE? (optional)</label>
            <textarea
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              placeholder="going with my partner, celebrating a birthday, prefer walkable areas..."
              rows={2}
              className="qc-input-field mt-1"
              style={{ width: "100%", background: "#C9AEC7", border: "1px solid #1B103015", borderRadius: 10, padding: "10px 14px", outline: "none", color: "#1B1030", resize: "none", transition: "background 0.15s ease" }}
            />
          </div>
          {error && <p style={{ color: "#F5EFE6", fontSize: 13, marginTop: 10 }}>{error}</p>}
          <button
            onClick={() => {
              planTrip(undefined, undefined, undefined, undefined, undefined, pendingAvoidVenues);
              setPendingAvoidVenues([]);
            }}
            disabled={loading}
            className="qc-btn-orange mt-4 flex items-center justify-center gap-2"
            style={{ width: "100%", background: loading ? "#D9662E88" : "#D9662E", color: "#1B1030", fontWeight: 600, padding: "12px 0", borderRadius: 10, border: "none", cursor: loading ? "default" : "pointer", transition: "background 0.15s ease" }}
          >
            {!loading && <Sparkles size={18} />}
            {loading ? <WaveText text={loadingMessages[loadingMessageIndex]} /> : "Plan my trip"}
          </button>
          {loading && (
            <div className="no-print" style={{ width: "100%", height: 5, background: "#1B103022", borderRadius: 999, marginTop: 10, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  background: "linear-gradient(90deg, #D9662E, #B23A72, #9B2FA0)",
                  borderRadius: 999,
                  animation: "qc-progress-fill 28s ease-out forwards",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {itinerary && (
        <div ref={resultsTopRef} style={{ maxWidth: 880, margin: "0 auto", padding: "0 24px 64px" }}>
          <SponsorshipBanner sponsor={citySponsors[itinerary.cities?.[0]?.name]} cityName={itinerary.cities?.[0]?.name} />
          <span className="print-only-logo" style={{ display: "none", alignItems: "flex-end", marginBottom: 16 }}>
            <img src={funmapsLogo} alt="FunMaps" style={{ height: 55, maxWidth: "100%" }} />
            <span style={{ fontSize: 9, color: "#1B1030aa", marginLeft: -3, marginBottom: 2 }}>™</span>
          </span>
          <div style={{ background: "#241640", borderRadius: 16, padding: 24, marginBottom: 20 }}>
            <div className="qc-itin-header flex items-center justify-between gap-3 mb-2">
              <div>
                <h2 className="display" style={{ fontSize: 24 }}>
                  {itinerary.cities?.map((c) => c.name).join(" → ")}
                </h2>
                {plannedDates.checkIn && plannedDates.checkOut && (
                  <p style={{ fontSize: 13, color: "#D9662E", fontWeight: 600, marginTop: 2 }}>
                    {segmentNumber > 1 ? `Segment ${segmentNumber}: ` : ""}
                    {formatDate(plannedDates.checkIn)} – {formatDate(plannedDates.checkOut)}
                  </p>
                )}
              </div>
              <div className="qc-itin-actions flex gap-2 flex-wrap no-print" style={{ flexShrink: 0 }}>
                <button onClick={saveTrip} className="qc-btn-dark flex items-center gap-1.5" style={{ background: "#1B1030", color: "#F5EFE6", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "background 0.15s ease", flexShrink: 0, whiteSpace: "nowrap" }}>
                  <Save size={13} /> {saveStatus === "saved" ? "Saved ✓" : "Save trip"}
                </button>
                <button onClick={printTrip} className="qc-btn-dark flex items-center gap-1.5" style={{ background: "#1B1030", color: "#1C9C9C", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "background 0.15s ease", flexShrink: 0, whiteSpace: "nowrap" }}>
                  <Printer size={13} /> Print
                </button>
                {typeof navigator !== "undefined" && navigator.share && (
                  <button onClick={shareTrip} className="qc-btn-dark flex items-center gap-1.5" style={{ background: "#1B1030", color: "#D9662E", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "background 0.15s ease", flexShrink: 0, whiteSpace: "nowrap" }}>
                    <Share2 size={13} /> Share
                  </button>
                )}
                <button onClick={downloadTrip} className="qc-btn-dark flex items-center gap-1.5" style={{ background: "#1B1030", color: "#B23A72", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "background 0.15s ease", flexShrink: 0, whiteSpace: "nowrap" }}>
                  <Download size={13} /> Download
                </button>
              </div>
            </div>
            <p style={{ color: "#F5EFE6cc", fontSize: 15 }}>{itinerary.summary}</p>
            <a
              href={flightsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("booking_click", { vertical: "flights" })}
              className="qc-btn-booking flex items-center justify-center gap-2 mt-3 no-print"
              style={{ background: "#003580", color: "#ffffff", fontWeight: 600, padding: "10px 0", borderRadius: 10, textDecoration: "none", fontSize: 13.5, transition: "background 0.15s ease" }}
            >
              <span style={{ background: "#ffffff", color: "#003580", fontWeight: 700, fontSize: 11, padding: "2px 7px", borderRadius: 4, letterSpacing: -0.2 }}>
                Booking.com
              </span>
              <Plane size={15} /> Find Flights
            </a>
          </div>

          {itinerary.cities?.map((city, ci) => {
            const allBannersForCity = cityBanners[city.name] || [];
            // If the traveler picked specific budget tier(s), only show partners
            // matching one of those tiers. No preference selected = show all,
            // unchanged from before this feature existed.
            const banners =
              selectedBudgetTiers.length > 0
                ? allBannersForCity.filter((b) => selectedBudgetTiers.includes(b.priceTier || "$$"))
                : allBannersForCity;
            const accommodationsPartners = sortPartners(banners.filter((b) => b.category === "Accommodations"));
            const placedIds = new Set(accommodationsPartners.map((b) => b.id));
            // For each day, find the first not-yet-placed banner whose category
            // maps to something actually happening that day (e.g. a Bars&Clubs
            // banner slots in right after a day that has nightlife activities).
            const dayBannerMap = {}; // day number -> banner to show after that day's card
            city.itinerary?.forEach((d) => {
              const dayCategories = new Set((d.activities || []).map((a) => a.category));
              const match = banners.find((b) => {
                if (placedIds.has(b.id) || b.category === "Accommodations") return false;
                const activityCategory = PARTNER_TO_ACTIVITY_CATEGORY[b.category];
                return activityCategory && dayCategories.has(activityCategory);
              });
              if (match) {
                dayBannerMap[d.day] = match;
                placedIds.add(match.id);
              }
            });
            // Anything left over never found a contextual match — show it once
            // at the end of the city, so a paying partner is never silently skipped.
            const fallbackBanners = banners.filter((b) => !placedIds.has(b.id));

            return (
            <div key={`${tripLoadId}-${ci}`} style={{ marginBottom: 28 }}>
              {cityImages[city.name] && (
                <div className="no-print" style={{ position: "relative", borderRadius: 14, overflow: "hidden", marginBottom: 12, height: 200 }}>
                  <img src={cityImages[city.name].url} alt={city.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <span style={{ position: "absolute", bottom: 6, right: 8, fontSize: 10.5, color: "#ffffffcc", background: "#00000055", padding: "2px 8px", borderRadius: 999 }}>
                    Photo by{" "}
                    <a href={cityImages[city.name].photographerUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#ffffffcc" }}>
                      {cityImages[city.name].photographer}
                    </a>{" "}
                    on{" "}
                    <a href={cityImages[city.name].unsplashUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#ffffffcc" }}>
                      Unsplash
                    </a>
                  </span>
                </div>
              )}

              <div className="no-print" style={{ marginBottom: 12 }}>
                <div style={{ background: "#241640", borderRadius: 16, padding: 10 }}>
                  <div ref={(el) => (mapContainerRefs.current[city.name] = el)} style={{ height: 260, borderRadius: 10, overflow: "hidden", background: "#1B1030" }} />
                  {geocodingProgress[city.name] && geocodingProgress[city.name].done < geocodingProgress[city.name].total && (
                    <p className="flex items-center gap-2 mt-2" style={{ fontSize: 12, color: "#F5EFE699" }}>
                      <Loader2 size={12} className="animate-spin" /> Pinning {city.name}… {geocodingProgress[city.name].done}/{geocodingProgress[city.name].total}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <MapPin size={16} color="#B23A72" />
                <span className="display" style={{ fontSize: 20 }}>{city.name}</span>
                <span style={{ color: "#F5EFE699", fontSize: 13 }}>· {city.days} day{city.days === 1 ? "" : "s"}</span>
              </div>

              <div className="flex items-start gap-2 mb-3" style={{ background: "#1C9C9C20", padding: 14, borderRadius: 10 }}>
                <Shield size={18} color="#1C9C9C" style={{ marginTop: 2, flexShrink: 0 }} />
                <p style={{ fontSize: 13.5, color: "#F5EFE6dd" }}>{city.safetyOverview}</p>
              </div>

              {(() => {
                const infoCards = [
                  city.weather && { key: "weather", icon: CloudSun, color: "#F2984A", label: "WEATHER", value: city.weather },
                  city.airport && { key: "airport", icon: Plane, color: "#9B2FA0", label: "AIRPORT", value: city.airport },
                  city.transportation && { key: "transport", icon: Bus, color: "#1C9C9C", label: "GETTING AROUND", value: city.transportation },
                  city.currency && { key: "currency", icon: DollarSign, color: "#D9662E", label: "CURRENCY", value: city.currency },
                  (city.healthTips || city.vaccinesNote) && { key: "health", icon: Stethoscope, color: "#B23A72", labelColor: "#F5EFE6", label: "HEALTH & VACCINES", value: `${city.healthTips || ""} ${city.vaccinesNote || ""}`.trim() },
                ].filter(Boolean);
                const COLS = 3;
                const lonelyLast = infoCards.length % COLS === 1;
                return (
                  <div className="qc-info-grid grid gap-2 mb-4" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, display: "grid" }}>
                    {infoCards.map((card, i) => {
                      const Icon = card.icon;
                      const isLast = i === infoCards.length - 1;
                      return (
                        <div
                          key={card.key}
                          className="flex items-start gap-2"
                          style={{ background: "#241640", padding: 12, borderRadius: 10, gridColumn: isLast && lonelyLast ? "1 / -1" : undefined }}
                        >
                          <Icon size={16} color={card.color} style={{ marginTop: 1, flexShrink: 0 }} />
                          <div>
                            <p style={{ fontSize: 11, color: card.labelColor || card.color, fontWeight: 600, marginBottom: 2 }}>{card.label}</p>
                            <p style={{ fontSize: 12.5, color: "#F5EFE6bb" }}>{card.value}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {city.neighborhoods?.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {city.neighborhoods.map((n, i) => (
                    <span key={i} style={{ background: "#B23A7222", color: "#F5EFE6", fontSize: 12.5, padding: "5px 12px", borderRadius: 999 }}>
                      {n.name} · {n.vibe}
                    </span>
                  ))}
                </div>
              )}

              {accommodationsPartners.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, color: "#D9662E", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
                    ★ RECOMMENDED ACCOMMODATIONS — DAY 1 CHECK-IN
                  </p>
                  {accommodationsPartners.map((p) => (
                    <BannerAd key={p.id} banner={p} cityName={city.name} />
                  ))}
                </div>
              )}

              {city.itinerary?.map((d) => {
                const dayBanner = dayBannerMap[d.day];
                return (
                <div key={d.day} style={{ marginBottom: 14 }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span style={{ color: "#D9662E", fontSize: 14, fontWeight: 600 }}>Day {d.day}</span>
                    <span style={{ color: "#F5EFE699", fontSize: 13.5 }}>· {d.title}</span>
                  </div>
                  <div style={{ background: "#241640", borderRadius: 14, padding: 16 }}>
                    {d.activities?.map((a, i) => (
                      <div key={i} className="flex gap-3" style={{ padding: "10px 0", borderTop: i > 0 ? "1px solid #F5EFE612" : "none" }}>
                        <VibeDot category={a.category} />
                        <div style={{ flex: 1 }}>
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span style={{ fontSize: 12, color: "#1C9C9C", fontWeight: 600 }}>{a.time}</span>
                            <span style={{ fontWeight: 600, fontSize: 14.5 }}>{a.name}</span>
                            <FriendlyBadge level={a.lgbtqFriendly} />
                            <PriceBadge level={a.priceLevel} />
                          </div>
                          <p style={{ fontSize: 13.5, color: "#F5EFE6aa", marginTop: 2 }}>{a.description}</p>
                          {(a.address || a.website) && (
                            <div className="flex flex-wrap items-center gap-3 mt-1.5 no-print">
                              {a.address && (
                                <a href={directionsUrl(a.address, city.name)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1" style={{ color: "#F5EFE688", fontSize: 12, textDecoration: "none" }}>
                                  <Navigation size={11} /> {a.address}
                                </a>
                              )}
                              {a.website && (
                                <a href={a.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1" style={{ color: "#1C9C9C", fontSize: 12, textDecoration: "none" }}>
                                  <Globe size={11} /> Website
                                </a>
                              )}
                            </div>
                          )}
                          {a.address && (
                            <p className="print-only" style={{ display: "none", fontSize: 11.5, color: "#1B1030aa", marginTop: 2 }}>{a.address}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {dayBanner && (
                    <div style={{ marginTop: 10 }}>
                      <BannerAd banner={dayBanner} cityName={city.name} />
                    </div>
                  )}
                </div>
                );
              })}

              {fallbackBanners.map((b) => (
                <BannerAd key={b.id} banner={b} cityName={city.name} />
              ))}

              {/* Booking.com affiliate button, via CJ deep link */}
              <a
                href={bookingUrl(city.name, checkIn, checkOut)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("booking_click", { vertical: "hotels", city: city.name })}
                className="qc-btn-booking flex items-center justify-center gap-2 mt-2 no-print"
                style={{ background: "#003580", color: "#ffffff", fontWeight: 600, padding: "12px 0", borderRadius: 10, textDecoration: "none", fontSize: 14, transition: "background 0.15s ease" }}
              >
                <span style={{ background: "#ffffff", color: "#003580", fontWeight: 700, fontSize: 12, padding: "2px 8px", borderRadius: 4, letterSpacing: -0.2 }}>
                  Booking.com
                </span>
                <Hotel size={16} /> Find LGBTQ+-friendly stays in {city.name}
              </a>

              <a
                href={attractionsUrl(city.name)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("booking_click", { vertical: "attractions", city: city.name })}
                className="qc-btn-booking flex items-center justify-center gap-2 mt-2 no-print"
                style={{ background: "#003580", color: "#ffffff", fontWeight: 600, padding: "12px 0", borderRadius: 10, textDecoration: "none", fontSize: 14, transition: "background 0.15s ease" }}
              >
                <span style={{ background: "#ffffff", color: "#003580", fontWeight: 700, fontSize: 12, padding: "2px 8px", borderRadius: 4, letterSpacing: -0.2 }}>
                  Booking.com
                </span>
                <Sparkles size={16} /> Find Attractions & Activities in {city.name}
              </a>

              {checkIn && checkOut && (
                <button
                  onClick={() => continueTrip(city)}
                  disabled={loading}
                  className="qc-btn-dark flex items-center justify-center gap-2 mt-2 no-print"
                  style={{ width: "100%", background: "#1B1030", color: "#F5EFE6", fontWeight: 600, padding: "10px 0", borderRadius: 10, border: "1px solid #F5EFE620", fontSize: 13, cursor: loading ? "default" : "pointer", transition: "background 0.15s ease" }}
                >
                  <ArrowRight size={15} /> Plan the next days in {city.name}
                </button>
              )}
            </div>
            );
          })}

          <div style={{ background: "#241640", borderRadius: 14, padding: 16, marginTop: 8 }} className="no-print">
            <p style={{ fontSize: 12, color: "#D9662E", fontWeight: 600, marginBottom: 10 }}>ASK COMPASS TO ADJUST YOUR TRIP</p>
            <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 10 }}>
              {chat.map((m, i) => (
                <div key={i} style={{ marginBottom: 8, textAlign: m.role === "user" ? "right" : "left" }}>
                  <span style={{ display: "inline-block", background: m.role === "user" ? "#1C9C9C22" : "#B23A7222", color: "#F5EFE6", padding: "8px 12px", borderRadius: 10, fontSize: 13.5, maxWidth: "85%" }}>
                    {m.content}
                  </span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="e.g. swap day 2 for something more low-key"
                className="qc-input-field"
                style={{ flex: 1, background: "#C9AEC7", border: "1px solid #1B103015", outline: "none", color: "#1B1030", padding: "10px 14px", borderRadius: 10, transition: "background 0.15s ease" }}
              />
              <button onClick={sendChat} disabled={chatLoading} className="qc-btn-send" style={{ background: "#1C9C9C", color: "#1B1030", border: "none", borderRadius: 10, padding: "0 16px", cursor: "pointer", transition: "background 0.15s ease" }}>
                {chatLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTrips && (
        <div style={{ position: "fixed", inset: 0, background: "#00000080", display: "flex", justifyContent: "flex-end", zIndex: 50 }} onClick={() => setShowTrips(false)}>
          <div style={{ width: 320, background: "#241640", height: "100%", padding: 20, overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="display" style={{ fontSize: 18 }}>My Trips</span>
              <button onClick={() => setShowTrips(false)} style={{ background: "none", border: "none", color: "#F5EFE6" }}>
                <X size={18} />
              </button>
            </div>
            {savedTrips.length === 0 && <p style={{ fontSize: 13, color: "#F5EFE699" }}>No saved trips yet — plan one and hit "Save trip." (Saved on this device/browser only.)</p>}
            {savedTrips.map((t) => (
              <div key={t.id} className="flex items-center justify-between mb-2" style={{ background: "#1B1030", borderRadius: 10, padding: "10px 12px" }}>
                <button onClick={() => loadTrip(t.id)} style={{ background: "none", border: "none", color: "#F5EFE6", fontSize: 13.5, textAlign: "left", flex: 1, cursor: "pointer" }}>
                  {t.label}
                </button>
                <button onClick={() => deleteTrip(t.id)} style={{ background: "none", border: "none", color: "#F5EFE6", cursor: "pointer" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("Compass crashed:", error, info); // check browser console (F12) for the real error
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: "#1B1030", minHeight: "100vh", color: "#F5EFE6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "Inter, sans-serif" }}>
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong loading that trip.</p>
          <p style={{ fontSize: 14, color: "#F5EFE699", marginBottom: 20 }}>Try refreshing the page — your saved trips are still safe.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 24px", borderRadius: 10, border: "none", cursor: "pointer" }}
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <CompassApp />
    </ErrorBoundary>
  );
}
