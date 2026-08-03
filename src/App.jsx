import { useState, useRef, useEffect } from "react";
import { Compass, MapPin, Sparkles, Shield, Calendar, Hotel, Send, Loader2, Heart, Sun, Moon, Utensils, Save, Share2, FolderOpen, X, Trash2 } from "lucide-react";

const CATEGORY_META = {
  nightlife: { icon: Moon, color: "#FF6F61" },
  culture: { icon: Compass, color: "#E8B04B" },
  food: { icon: Utensils, color: "#F5A623" },
  outdoors: { icon: Sun, color: "#4ECDC4" },
  community: { icon: Heart, color: "#FF6F61" },
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

const ITINERARY_SYSTEM = `You are Compass, an expert LGBTQ+ travel concierge. The traveler may give ONE destination or MULTIPLE (comma or "then" separated, e.g. "Bangkok then Chiang Mai" or "Mexico City, Oaxaca"). Split trip length sensibly across cities if multiple. Return ONLY valid JSON (no markdown fences, no preamble) matching exactly this schema:
{
  "tripLength": number,
  "summary": string (2-3 sentences covering the whole trip),
  "cities": [
    {
      "name": string,
      "days": number,
      "safetyOverview": string (2-3 sentences: legal climate, welcome level, anything to be mindful of),
      "neighborhoods": [ { "name": string, "vibe": string } ] (2-4 items),
      "itinerary": [
        {
          "day": number (local day number within this city, starting at 1),
          "title": string,
          "activities": [
            { "time": string, "name": string, "description": string, "category": "nightlife"|"culture"|"food"|"outdoors"|"community" }
          ]
        }
      ]
    }
  ]
}
Keep activities realistic and specific to each real destination. Prioritize queer-owned or queer-friendly spots and genuinely relevant community spaces. When unsure of a specific business name, describe the type of place instead of inventing one.`;

function genCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

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
  const [interests, setInterests] = useState("");
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
  const [shareCode, setShareCode] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [loadCode, setLoadCode] = useState("");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

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
    setShareCode("");
    setShareStatus("");
    setSaveStatus("");
    try {
      const prompt = `Destination(s): ${destination}\nTotal trip length: ${days} days\nInterests / notes: ${interests || "open to anything, surprise me"}`;
      const text = await callClaude([{ role: "user", content: prompt }], ITINERARY_SYSTEM);
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setItinerary(parsed);
      setChat([]);
    } catch (e) {
      setError("Couldn't build that itinerary — try rephrasing the destination(s) or interests.");
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

  async function shareTrip() {
    if (!itinerary) return;
    setShareStatus("sharing");
    try {
      const code = genCode();
      const label = itinerary.cities?.map((c) => c.name).join(" + ") || destination;
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, data: { itinerary, label } }),
      });
      const data = await res.json();
      if (!res.ok) {
        setShareStatus(data.error || "Sharing isn't set up yet.");
        return;
      }
      setShareCode(code);
      setShareStatus("");
    } catch {
      setShareStatus("Couldn't share right now.");
    }
  }

  function loadTrip(id) {
    const trips = readLocalTrips();
    const found = trips.find((t) => t.id === id);
    if (!found) return;
    setItinerary(found.itinerary);
    setChat(found.chat || []);
    setDestination(found.destination || "");
    setShowTrips(false);
    setShareCode("");
    setShareStatus("");
    setSaveStatus("");
  }

  function deleteTrip(id) {
    const trips = readLocalTrips().filter((t) => t.id !== id);
    writeLocalTrips(trips);
    setSavedTrips(trips.sort((a, b) => b.savedAt - a.savedAt));
  }

  async function loadSharedByCode() {
    if (!loadCode.trim()) return;
    setError("");
    try {
      const res = await fetch(`/api/trips?code=${encodeURIComponent(loadCode.trim().toUpperCase())}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No trip found with that code.");
        return;
      }
      setItinerary(data.data.itinerary);
      setChat([]);
      setLoadCode("");
      setShareCode("");
      setShareStatus("");
      setSaveStatus("");
    } catch {
      setError("No trip found with that code.");
    }
  }

  return (
    <div style={{ background: "#1B1030", minHeight: "100vh", fontFamily: "Inter, sans-serif", color: "#F5EFE6" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap');
        .display { font-family: 'Fraunces', serif; }
        input, textarea { font-family: 'Inter', sans-serif; }
        ::placeholder { color: #F5EFE688; }
      `}</style>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 24px 0" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2" style={{ color: "#E8B04B" }}>
            <Compass size={20} />
            <span style={{ letterSpacing: 2, fontSize: 12, fontWeight: 600 }}>COMPASS · QUEER TRAVEL CONCIERGE</span>
          </div>
          <button
            onClick={openTripsPanel}
            className="flex items-center gap-1.5"
            style={{ background: "#241640", color: "#F5EFE6", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            <FolderOpen size={14} /> My Trips
          </button>
        </div>
      </div>

      <div style={{ padding: "24px 24px 32px", maxWidth: 880, margin: "0 auto" }}>
        <h1 className="display" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.15, marginBottom: 12 }}>
          Plan a trip that feels like <span style={{ color: "#FF6F61" }}>home</span>, wherever you land.
        </h1>
        <p style={{ color: "#F5EFE6aa", fontSize: 16, maxWidth: 560, marginBottom: 24 }}>
          One city or several — tell Compass where you're headed and it'll map out queer-friendly spots,
          community spaces, and an honest read on the local vibe for each stop.
        </p>

        <div className="flex gap-2 mb-6" style={{ maxWidth: 420 }}>
          <input
            value={loadCode}
            onChange={(e) => setLoadCode(e.target.value)}
            placeholder="Have a share code? Enter it here"
            style={{ flex: 1, background: "#241640", border: "1px solid #F5EFE620", outline: "none", color: "#F5EFE6", padding: "9px 12px", borderRadius: 8, fontSize: 13 }}
          />
          <button onClick={loadSharedByCode} style={{ background: "#241640", color: "#4ECDC4", border: "1px solid #4ECDC440", borderRadius: 8, padding: "0 14px", fontSize: 13, fontWeight: 600 }}>
            Load
          </button>
        </div>

        <div style={{ background: "#241640", borderRadius: 16, padding: 24, border: "1px solid #FF6F6120" }}>
          <div className="grid gap-4" style={{ gridTemplateColumns: "2fr 1fr", display: "grid" }}>
            <div>
              <label style={{ fontSize: 12, color: "#E8B04B", fontWeight: 600 }}>DESTINATION(S)</label>
              <div className="flex items-center gap-2 mt-1" style={{ background: "#1B1030", borderRadius: 10, padding: "10px 14px" }}>
                <MapPin size={16} color="#FF6F61" />
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Bangkok then Chiang Mai, or just Lisbon"
                  style={{ background: "transparent", border: "none", outline: "none", color: "#F5EFE6", width: "100%" }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#E8B04B", fontWeight: 600 }}>TOTAL DAYS</label>
              <div className="flex items-center gap-2 mt-1" style={{ background: "#1B1030", borderRadius: 10, padding: "10px 14px" }}>
                <Calendar size={16} color="#4ECDC4" />
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
            <label style={{ fontSize: 12, color: "#E8B04B", fontWeight: 600 }}>INTERESTS (optional)</label>
            <textarea
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="nightlife, drag shows, quiet beaches, museums, going with my partner..."
              rows={2}
              className="mt-1"
              style={{ width: "100%", background: "#1B1030", borderRadius: 10, padding: "10px 14px", border: "none", outline: "none", color: "#F5EFE6", resize: "none" }}
            />
          </div>
          {error && <p style={{ color: "#FF6F61", fontSize: 13, marginTop: 10 }}>{error}</p>}
          <button
            onClick={planTrip}
            disabled={loading}
            className="mt-4 flex items-center justify-center gap-2"
            style={{ width: "100%", background: loading ? "#E8B04B88" : "#E8B04B", color: "#1B1030", fontWeight: 600, padding: "12px 0", borderRadius: 10, border: "none", cursor: loading ? "default" : "pointer" }}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {loading ? "Mapping your trip..." : "Plan my trip"}
          </button>
        </div>
      </div>

      {itinerary && (
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "0 24px 64px" }}>
          <div style={{ background: "#241640", borderRadius: 16, padding: 24, marginBottom: 20 }}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <h2 className="display" style={{ fontSize: 24 }}>
                {itinerary.cities?.map((c) => c.name).join(" → ")}
              </h2>
              <div className="flex gap-2">
                <button onClick={saveTrip} className="flex items-center gap-1.5" style={{ background: "#1B1030", color: "#F5EFE6", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600 }}>
                  <Save size={13} /> {saveStatus === "saved" ? "Saved ✓" : "Save trip"}
                </button>
                <button onClick={shareTrip} className="flex items-center gap-1.5" style={{ background: "#1B1030", color: "#4ECDC4", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600 }}>
                  <Share2 size={13} /> {shareStatus === "sharing" ? "Sharing..." : "Share"}
                </button>
              </div>
            </div>
            {shareCode && (
              <p style={{ fontSize: 12.5, color: "#4ECDC4", marginBottom: 10 }}>
                Share code: <strong style={{ letterSpacing: 1 }}>{shareCode}</strong> — anyone can load this trip by entering it above. Visible to anyone with the code.
              </p>
            )}
            {shareStatus && shareStatus !== "sharing" && (
              <p style={{ fontSize: 12.5, color: "#FF6F61", marginBottom: 10 }}>{shareStatus}</p>
            )}
            <p style={{ color: "#F5EFE6cc", fontSize: 15 }}>{itinerary.summary}</p>
          </div>

          {itinerary.cities?.map((city, ci) => (
            <div key={ci} style={{ marginBottom: 28 }}>
              <div className="flex items-center gap-2 mb-2">
                <MapPin size={16} color="#FF6F61" />
                <span className="display" style={{ fontSize: 20 }}>{city.name}</span>
                <span style={{ color: "#F5EFE699", fontSize: 13 }}>· {city.days} day{city.days === 1 ? "" : "s"}</span>
              </div>

              <div className="flex items-start gap-2 mb-3" style={{ background: "#4ECDC420", padding: 14, borderRadius: 10 }}>
                <Shield size={18} color="#4ECDC4" style={{ marginTop: 2, flexShrink: 0 }} />
                <p style={{ fontSize: 13.5, color: "#F5EFE6dd" }}>{city.safetyOverview}</p>
              </div>

              {city.neighborhoods?.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {city.neighborhoods.map((n, i) => (
                    <span key={i} style={{ background: "#FF6F6122", color: "#FF6F61", fontSize: 12.5, padding: "5px 12px", borderRadius: 999 }}>
                      {n.name} · {n.vibe}
                    </span>
                  ))}
                </div>
              )}

              {city.itinerary?.map((d) => (
                <div key={d.day} style={{ marginBottom: 14 }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span style={{ color: "#E8B04B", fontSize: 14, fontWeight: 600 }}>Day {d.day}</span>
                    <span style={{ color: "#F5EFE699", fontSize: 13.5 }}>· {d.title}</span>
                  </div>
                  <div style={{ background: "#241640", borderRadius: 14, padding: 16 }}>
                    {d.activities?.map((a, i) => (
                      <div key={i} className="flex gap-3" style={{ padding: "10px 0", borderTop: i > 0 ? "1px solid #F5EFE612" : "none" }}>
                        <VibeDot category={a.category} />
                        <div>
                          <div className="flex items-baseline gap-2">
                            <span style={{ fontSize: 12, color: "#4ECDC4", fontWeight: 600 }}>{a.time}</span>
                            <span style={{ fontWeight: 600, fontSize: 14.5 }}>{a.name}</span>
                          </div>
                          <p style={{ fontSize: 13.5, color: "#F5EFE6aa", marginTop: 2 }}>{a.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Monetization placeholder — replace href with your affiliate booking link per city */}
              <a
                href={`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 mt-2"
                style={{ background: "#FF6F61", color: "#1B1030", fontWeight: 600, padding: "12px 0", borderRadius: 10, textDecoration: "none", fontSize: 14 }}
              >
                <Hotel size={16} /> Find LGBTQ+-friendly stays in {city.name}
              </a>
            </div>
          ))}

          <div style={{ background: "#241640", borderRadius: 14, padding: 16, marginTop: 8 }}>
            <p style={{ fontSize: 12, color: "#E8B04B", fontWeight: 600, marginBottom: 10 }}>ASK COMPASS TO ADJUST YOUR TRIP</p>
            <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 10 }}>
              {chat.map((m, i) => (
                <div key={i} style={{ marginBottom: 8, textAlign: m.role === "user" ? "right" : "left" }}>
                  <span style={{ display: "inline-block", background: m.role === "user" ? "#4ECDC422" : "#FF6F6122", color: "#F5EFE6", padding: "8px 12px", borderRadius: 10, fontSize: 13.5, maxWidth: "85%" }}>
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
              <button onClick={sendChat} disabled={chatLoading} style={{ background: "#4ECDC4", color: "#1B1030", border: "none", borderRadius: 10, padding: "0 16px" }}>
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
                <button onClick={() => deleteTrip(t.id)} style={{ background: "none", border: "none", color: "#FF6F61", cursor: "pointer" }}>
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
