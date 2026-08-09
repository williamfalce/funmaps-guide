import { useState, useRef, useEffect } from "react";
import { Compass, MapPin, Sparkles, Shield, Calendar, Hotel, Send, Loader2, Heart, Sun, Moon, Utensils, Save, Printer, FolderOpen, X, Trash2, Plane, Bus, DollarSign, Stethoscope, CloudSun, Globe, Navigation, BadgeCheck } from "lucide-react";
import funmapsLogo from "./assets/funmaps-logo.png";

const CATEGORY_META = {
  nightlife: { icon: Moon, color: "#B23A72" },
  culture: { icon: Compass, color: "#9B2FA0" },
  food: { icon: Utensils, color: "#F2984A" },
  outdoors: { icon: Sun, color: "#1C9C9C" },
  community: { icon: Heart, color: "#D9662E" },
};

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

const BOOKING_AID = import.meta.env.VITE_BOOKING_AID || "";

function bookingUrl(cityName) {
  const params = new URLSearchParams({ ss: cityName });
  if (BOOKING_AID) {
    params.set("aid", BOOKING_AID);
    params.set("label", `compass-${cityName.toLowerCase().replace(/\s+/g, "-")}`);
  }
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
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

const ITINERARY_SYSTEM = `You are Compass, an expert LGBTQ+ travel concierge for FunMaps. The traveler may give ONE destination or MULTIPLE (comma or "then" separated, e.g. "Bangkok then Chiang Mai" or "Mexico City, Oaxaca"). Split trip length sensibly across cities if multiple. Return ONLY valid JSON (no markdown fences, no preamble) matching exactly this schema:
{
  "tripLength": number,
  "summary": string (2-3 sentences covering the whole trip),
  "cities": [
    {
      "name": string,
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
              "lgbtqFriendly": "verified" | "welcoming" | "unconfirmed" ("verified" = explicitly queer-owned/queer space, "welcoming" = generally inclusive though not queer-specific, "unconfirmed" = no specific info either way)
            }
          ]
        }
      ]
    }
  ]
}
Keep activities realistic and specific to each real destination. Prioritize queer-owned or queer-friendly spots and genuinely relevant community spaces. When unsure of a specific business name, address, or website, describe the type of place and use a neighborhood-level location instead of inventing details.`;

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

export default function App() {
  const [destination, setDestination] = useState("");
  const [days, setDays] = useState(4);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [extraNotes, setExtraNotes] = useState("");

  function toggleInterest(tag) {
    setSelectedInterests((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [itinerary, setItinerary] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  const [showTrips, setShowTrips] = useState(false);
  const [savedTrips, setSavedTrips] = useState([]);
  const [saveStatus, setSaveStatus] = useState("");
  const [cityImages, setCityImages] = useState({});
  const [mapPins, setMapPins] = useState([]);
  const [geocodingProgress, setGeocodingProgress] = useState({});
  const mapContainerRefs = useRef({});
  const mapInstancesRef = useRef({});
  const resultsTopRef = useRef(null);

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

    async function run() {
      // Build the full list of things to pin: city center + every activity with an address, tagged by city.
      const targets = [];
      itinerary.cities.forEach((city) => {
        targets.push({ query: city.name, name: city.name, category: "city", cityName: city.name });
        city.itinerary?.forEach((d) => {
          d.activities?.forEach((a) => {
            if (a.address) targets.push({ query: `${a.address}, ${city.name}`, name: a.name, category: a.category, cityName: city.name });
          });
        });
      });

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
      const container = mapContainerRefs.current[cityName];
      const pins = pinsByCity[cityName];
      if (!container || pins.length === 0) return;

      if (!mapInstancesRef.current[cityName]) {
        const map = window.L.map(container);
        window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);
        map._markersLayer = window.L.layerGroup().addTo(map);
        mapInstancesRef.current[cityName] = map;
      }

      const map = mapInstancesRef.current[cityName];
      map._markersLayer.clearLayers();

      pins.forEach((pin) => {
        const isCity = pin.category === "city";
        const color = isCity ? "#9B2FA0" : (CATEGORY_META[pin.category] || CATEGORY_META.culture).color;
        const size = isCity ? 32 : 24;
        const icon = window.L.divIcon({
          className: "",
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 0 6px rgba(0,0,0,0.5);"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
        window.L.marker([pin.lat, pin.lon], { icon }).bindPopup(`<strong>${pin.name}</strong>`).addTo(map._markersLayer);
      });

      const bounds = window.L.latLngBounds(pins.map((p) => [p.lat, p.lon]));
      map.fitBounds(bounds, { padding: [30, 30] });
      setTimeout(() => map.invalidateSize(), 0);
    });
  }, [mapPins]);

  function openTripsPanel() {
    setSavedTrips(readLocalTrips().sort((a, b) => b.savedAt - a.savedAt));
    setShowTrips(true);
  }

  async function planTrip() {
    if (!destination.trim()) {
      setError("Tell me where you're headed first.");
      return;
    }
    setError("");
    setLoading(true);
    setItinerary(null);
    Object.values(mapInstancesRef.current).forEach((map) => map.remove());
    mapInstancesRef.current = {};
    setSaveStatus("");
    try {
      const interestsStr = [selectedInterests.join(", "), extraNotes.trim()].filter(Boolean).join("; ") || "open to anything, surprise me";
      const prompt = `Destination(s): ${destination}\nTotal trip length: ${days} days\nInterests / notes: ${interestsStr}`;
      const text = await callClaude([{ role: "user", content: prompt }], ITINERARY_SYSTEM, 8000);
      const parsed = extractItineraryJson(text);
      if (!parsed) throw new Error("Response was not valid JSON, likely cut off before it could finish.");
      setItinerary(parsed);
      setChat([]);
    } catch (e) {
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
      const contextPrompt = `Current itinerary JSON:\n${JSON.stringify(itinerary)}\n\nTraveler follow-up request: ${userMsg}\n\nRespond conversationally, plain text, 2-5 sentences.`;
      const text = await callClaude(
        [...nextChat.slice(0, -1).map((m) => ({ role: m.role, content: m.content })), { role: "user", content: contextPrompt }],
        "You are Compass, a warm, knowledgeable LGBTQ+ travel concierge helping refine an existing itinerary."
      );
      setChat([...nextChat, { role: "assistant", content: text }]);
    } catch (e) {
      setChat([...nextChat, { role: "assistant", content: "Hmm, I lost my signal there — mind trying that again?" }]);
    } finally {
      setChatLoading(false);
    }
  }

  function saveTrip() {
    if (!itinerary) return;
    const label = itinerary.cities?.map((c) => c.name).join(" + ") || destination;
    const trips = readLocalTrips();
    trips.push({ id: `${Date.now()}`, label, savedAt: Date.now(), itinerary, chat, destination });
    writeLocalTrips(trips);
    setSaveStatus("saved");
  }

  function printTrip() {
    window.print();
  }

  function loadTrip(id) {
    const trips = readLocalTrips();
    const found = trips.find((t) => t.id === id);
    if (!found) return;
    setItinerary(found.itinerary);
    setChat(found.chat || []);
    setDestination(found.destination || "");
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
        ::placeholder { color: #F5EFE688; }

        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          * { background: transparent !important; color: #1B1030 !important; box-shadow: none !important; border-color: #ddd !important; }
          body { background: #ffffff !important; }
        }
      `}</style>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 24px 0" }} className="no-print">
        <div className="flex items-start justify-between">
          <div>
            <img src={funmapsLogo} alt="FunMaps" style={{ height: 110 }} />
            <p style={{ letterSpacing: 1.5, fontSize: 12, fontWeight: 600, color: "#F5EFE699", marginTop: 8 }}>
              QUEER COMPASS TRAVEL GUIDE<sup style={{ fontSize: 12 }}>™</sup>
            </p>
          </div>
          <button
            onClick={openTripsPanel}
            className="flex items-center gap-1.5"
            style={{ background: "#241640", color: "#F5EFE6", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", flexShrink: 0, marginTop: 4 }}
          >
            <FolderOpen size={14} /> My Trips
          </button>
        </div>
      </div>

      <div style={{ padding: "24px 24px 32px", maxWidth: 880, margin: "0 auto" }} className="no-print">
        <h1 className="display" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.15, marginBottom: 12 }}>
          Your Queer <span style={{ color: "#9B2FA0" }}>Compass</span>, wherever you land.<sup style={{ fontSize: 14 }}>™</sup>
        </h1>
        <p style={{ color: "#F5EFE6aa", fontSize: 16, maxWidth: 560, marginBottom: 24 }}>
          One city or several — tell Compass where you're headed and it'll map out queer-friendly spots,
          community spaces, and an honest read on the local vibe for each stop.
        </p>

        <div style={{ background: "#241640", borderRadius: 16, padding: 24, border: "1px solid #B23A7220" }} className="no-print">
          <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr", display: "grid" }}>
            <div>
              <label style={{ fontSize: 12, color: "#D9662E", fontWeight: 600 }}>DESTINATION(S)</label>
              <div className="flex items-center gap-2 mt-1" style={{ background: "#1B1030", borderRadius: 10, padding: "10px 14px" }}>
                <MapPin size={16} color="#B23A72" />
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Bangkok then Chiang Mai, or just Lisbon"
                  style={{ background: "transparent", border: "none", outline: "none", color: "#F5EFE6", width: "100%" }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#D9662E", fontWeight: 600 }}>TOTAL DAYS</label>
              <div className="flex items-center gap-2 mt-1" style={{ background: "#1B1030", borderRadius: 10, padding: "10px 14px" }}>
                <Calendar size={16} color="#1C9C9C" />
                <input
                  type="number"
                  min={1}
                  max={21}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  style={{ background: "transparent", border: "none", outline: "none", color: "#F5EFE6", width: "100%" }}
                />
              </div>
            </div>
          </div>
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
            <label style={{ fontSize: 12, color: "#D9662E", fontWeight: 600 }}>ANYTHING ELSE? (optional)</label>
            <textarea
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              placeholder="going with my partner, celebrating a birthday, prefer walkable areas..."
              rows={2}
              className="mt-1"
              style={{ width: "100%", background: "#1B1030", borderRadius: 10, padding: "10px 14px", border: "none", outline: "none", color: "#F5EFE6", resize: "none" }}
            />
          </div>
          {error && <p style={{ color: "#B23A72", fontSize: 13, marginTop: 10 }}>{error}</p>}
          <button
            onClick={planTrip}
            disabled={loading}
            className="mt-4 flex items-center justify-center gap-2"
            style={{ width: "100%", background: loading ? "#D9662E88" : "#D9662E", color: "#1B1030", fontWeight: 600, padding: "12px 0", borderRadius: 10, border: "none", cursor: loading ? "default" : "pointer" }}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {loading ? "Mapping your trip..." : "Plan my trip"}
          </button>
        </div>
      </div>

      {itinerary && (
        <div ref={resultsTopRef} style={{ maxWidth: 880, margin: "0 auto", padding: "0 24px 64px" }}>
          <img src={funmapsLogo} alt="FunMaps" style={{ height: 80, marginBottom: 16, display: "none" }} className="print-only" />
          <div style={{ background: "#241640", borderRadius: 16, padding: 24, marginBottom: 20 }}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <h2 className="display" style={{ fontSize: 24 }}>
                {itinerary.cities?.map((c) => c.name).join(" → ")}
              </h2>
              <div className="flex gap-2 no-print">
                <button onClick={saveTrip} className="flex items-center gap-1.5" style={{ background: "#1B1030", color: "#F5EFE6", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600 }}>
                  <Save size={13} /> {saveStatus === "saved" ? "Saved ✓" : "Save trip"}
                </button>
                <button onClick={printTrip} className="flex items-center gap-1.5" style={{ background: "#1B1030", color: "#1C9C9C", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600 }}>
                  <Printer size={13} /> Print
                </button>
              </div>
            </div>
            <p style={{ color: "#F5EFE6cc", fontSize: 15 }}>{itinerary.summary}</p>
          </div>

          {itinerary.cities?.map((city, ci) => (
            <div key={ci} style={{ marginBottom: 28 }}>
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

              <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", display: "grid" }}>
                {city.weather && (
                  <div className="flex items-start gap-2" style={{ background: "#241640", padding: 12, borderRadius: 10 }}>
                    <CloudSun size={16} color="#F2984A" style={{ marginTop: 1, flexShrink: 0 }} />
                    <div><p style={{ fontSize: 11, color: "#F2984A", fontWeight: 600, marginBottom: 2 }}>WEATHER</p><p style={{ fontSize: 12.5, color: "#F5EFE6bb" }}>{city.weather}</p></div>
                  </div>
                )}
                {city.airport && (
                  <div className="flex items-start gap-2" style={{ background: "#241640", padding: 12, borderRadius: 10 }}>
                    <Plane size={16} color="#9B2FA0" style={{ marginTop: 1, flexShrink: 0 }} />
                    <div><p style={{ fontSize: 11, color: "#9B2FA0", fontWeight: 600, marginBottom: 2 }}>AIRPORT</p><p style={{ fontSize: 12.5, color: "#F5EFE6bb" }}>{city.airport}</p></div>
                  </div>
                )}
                {city.transportation && (
                  <div className="flex items-start gap-2" style={{ background: "#241640", padding: 12, borderRadius: 10 }}>
                    <Bus size={16} color="#1C9C9C" style={{ marginTop: 1, flexShrink: 0 }} />
                    <div><p style={{ fontSize: 11, color: "#1C9C9C", fontWeight: 600, marginBottom: 2 }}>GETTING AROUND</p><p style={{ fontSize: 12.5, color: "#F5EFE6bb" }}>{city.transportation}</p></div>
                  </div>
                )}
                {city.currency && (
                  <div className="flex items-start gap-2" style={{ background: "#241640", padding: 12, borderRadius: 10 }}>
                    <DollarSign size={16} color="#D9662E" style={{ marginTop: 1, flexShrink: 0 }} />
                    <div><p style={{ fontSize: 11, color: "#D9662E", fontWeight: 600, marginBottom: 2 }}>CURRENCY</p><p style={{ fontSize: 12.5, color: "#F5EFE6bb" }}>{city.currency}</p></div>
                  </div>
                )}
                {(city.healthTips || city.vaccinesNote) && (
                  <div className="flex items-start gap-2" style={{ background: "#241640", padding: 12, borderRadius: 10 }}>
                    <Stethoscope size={16} color="#B23A72" style={{ marginTop: 1, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 11, color: "#B23A72", fontWeight: 600, marginBottom: 2 }}>HEALTH & VACCINES</p>
                      <p style={{ fontSize: 12.5, color: "#F5EFE6bb" }}>{city.healthTips} {city.vaccinesNote}</p>
                    </div>
                  </div>
                )}
              </div>

              {city.neighborhoods?.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {city.neighborhoods.map((n, i) => (
                    <span key={i} style={{ background: "#B23A7222", color: "#B23A72", fontSize: 12.5, padding: "5px 12px", borderRadius: 999 }}>
                      {n.name} · {n.vibe}
                    </span>
                  ))}
                </div>
              )}

              {city.itinerary?.map((d) => (
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
                </div>
              ))}

              {/* Monetization placeholder — replace href with your affiliate booking link per city */}
              <a
                href={bookingUrl(city.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 mt-2 no-print"
                style={{ background: "#B23A72", color: "#1B1030", fontWeight: 600, padding: "12px 0", borderRadius: 10, textDecoration: "none", fontSize: 14 }}
              >
                <Hotel size={16} /> Find LGBTQ+-friendly stays in {city.name}
              </a>
            </div>
          ))}

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
                style={{ flex: 1, background: "#1B1030", border: "none", outline: "none", color: "#F5EFE6", padding: "10px 14px", borderRadius: 10 }}
              />
              <button onClick={sendChat} disabled={chatLoading} style={{ background: "#1C9C9C", color: "#1B1030", border: "none", borderRadius: 10, padding: "0 16px" }}>
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
                <button onClick={() => deleteTrip(t.id)} style={{ background: "none", border: "none", color: "#B23A72", cursor: "pointer" }}>
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
