import { useEffect, useMemo, useRef, useState } from "react";
import { DESTINATIONS, inDestination, LEGACY, COMPASS_URL, WORDPRESS_URL, BRAND, postImage } from "./siteData.js";
import { href } from "./Website.jsx";
import RATE_CARD from "../rateCard.json";

// Tribes are only used to filter; they are never shown on a listing card,
// since advertisers didn't choose that wording for their ad.
// Map-first destination page: an interactive FunMap of the city's live
// website listings (numbered pins), filters, the listings by tier with honest
// paid-placement labels, and "Add to my trip" which hands the picks to Compass.

const prettyCategory = (c) => String(c || "").replace(/&/g, " & ");
// Tiers, top to bottom: Gold Star Partner (rank 1), Premium Partner (rank 2),
// Featured Partner (rank 3, Basic), free Directory (no label). "Partner" says
// the business pays to support FunMaps; LGBTQ+ Verified is the earned signal.
const isGoldStar = (l) => l.rank === 1;
const isPremium = (l) => l.rank === 2;
// Free directory listings have no paid label.
const isDirectory = (l) => !l.label;
// Tier colors: Gold Star gold, Premium purple, Featured orange, free light blue.
const PREMIUM_COLOR = "#5B2A9E";
const FEATURED_COLOR = BRAND.orangeDark;
// Ring around the map pins of FunMaps LGBTQ+ Verified places.
const VERIFIED_RING = "#1E8C3A";
const DIRECTORY_PIN = "#8CC4EE";
const pinColor = (l) => (isGoldStar(l) ? BRAND.gold : isPremium(l) ? PREMIUM_COLOR : isDirectory(l) ? DIRECTORY_PIN : FEATURED_COLOR);
const pinText = (l) => (isGoldStar(l) || isDirectory(l) ? BRAND.ink : "#FFFFFF");

function decode(html) {
  const t = document.createElement("textarea");
  t.innerHTML = html;
  return t.value;
}

function directionsUrl(l) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.businessName} ${l.address || ""} ${l.city || ""}`)}`;
}

// Trip picks are a per-visitor convenience, kept in this browser only.
function loadTrip(slug) {
  try {
    return JSON.parse(localStorage.getItem(`funmaps-trip-${slug}`) || "[]");
  } catch {
    return [];
  }
}
function saveTrip(slug, trip) {
  try {
    localStorage.setItem(`funmaps-trip-${slug}`, JSON.stringify(trip));
  } catch {
    // storage blocked (private window etc.) — the trip just won't survive a reload
  }
}

function VerifiedBadge({ small }) {
  return (
    <span className={`inline-flex items-center gap-1 self-start rounded-full font-bold ${small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`} style={{ background: "#E3F3F3", color: BRAND.tealDark }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
      FunMaps LGBTQ+ Verified
    </span>
  );
}

function PaidLabel({ listing }) {
  if (isDirectory(listing)) return null;
  if (isGoldStar(listing))
    return (
      <div className="flex items-center gap-1.5">
        <span className="rounded-full px-3 py-1 text-[13px] font-extrabold" style={{ background: BRAND.gold, color: BRAND.ink, boxShadow: "0 2px 8px rgba(0,0,0,.25)" }}>★ Gold Star Partner</span>
        <span className="rounded-full px-2 py-1 text-[11px] font-semibold text-white" style={{ background: "#1A1226b3" }}>Paid placement</span>
      </div>
    );
  return isPremium(listing) ? (
    <div className="flex items-center gap-1.5">
      <span className="rounded-full px-2.5 py-1 text-xs font-extrabold text-white" style={{ background: PREMIUM_COLOR }}>Premium Partner</span>
      <span className="rounded-full px-2 py-1 text-[11px] font-semibold text-white" style={{ background: "#1A1226b3" }}>Paid placement</span>
    </div>
  ) : (
    <span className="text-[11px] font-bold" style={{ color: FEATURED_COLOR }}>Featured Partner · paid placement</span>
  );
}

function PinNumber({ n, listing, size = 30 }) {
  return (
    <span
      aria-label={`Map pin ${n}`}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-extrabold"
      style={{ width: size, height: size, fontSize: size * 0.42, background: pinColor(listing), color: pinText(listing), boxShadow: listing.verified ? `0 0 0 3px ${VERIFIED_RING}` : "none" }}
    >
      {n}
    </span>
  );
}

function TripButton({ inTrip, onClick, compact }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={inTrip}
      className={`cursor-pointer font-bold ${compact ? "rounded-lg px-3 py-1.5 text-[13px]" : "rounded-[10px] px-4 py-[11px] text-sm"}`}
      style={inTrip ? { background: "#E3F3F3", color: BRAND.tealDark, border: `1px solid ${BRAND.teal}` } : { background: BRAND.magenta, color: "#FFFFFF", border: `1px solid ${BRAND.magenta}` }}
    >
      {inTrip ? "✓ In my trip" : "+ Add to my trip"}
    </button>
  );
}

// Leaflet is loaded globally by index.html (it's also used by Compass).
function FunMap({ dest, items }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  useEffect(() => {
    const L = window.L;
    if (!L || !box.current || map.current) return;
    map.current = L.map(box.current, { scrollWheelZoom: false }).setView(dest.center, dest.zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current.remove();
      map.current = null;
    };
  }, [dest]);
  useEffect(() => {
    const L = window.L;
    if (!L || !map.current || !layer.current) return;
    layer.current.clearLayers();
    const placed = items.filter(({ listing }) => listing.lat != null && listing.lng != null);
    placed.forEach(({ n, listing }) => {
      const sz = isDirectory(listing) ? 26 : isGoldStar(listing) ? 40 : 34;
      const icon = L.divIcon({
        className: "",
        iconSize: [sz, sz],
        iconAnchor: [sz / 2, sz],
        html: `<span style="display:flex;width:${sz}px;height:${sz}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${pinColor(listing)};box-shadow:${listing.verified ? `0 0 0 3px ${VERIFIED_RING},` : ""}0 4px 10px rgba(0,0,0,.35);align-items:center;justify-content:center"><span style="transform:rotate(45deg);font:800 ${sz === 26 ? 11 : 13}px 'Plus Jakarta Sans',sans-serif;color:${pinText(listing)}">${isGoldStar(listing) ? "★" : ""}${n}</span></span>`,
      });
      L.marker([listing.lat, listing.lng], { icon, title: `${n}. ${listing.businessName}` })
        .bindPopup(`<strong>${n}. ${listing.businessName.replace(/</g, "&lt;")}</strong><br>${prettyCategory(listing.category)}`)
        .addTo(layer.current);
    });
    if (dest.fitToPins === false) map.current.setView(dest.center, dest.zoom);
    else if (placed.length > 1) map.current.fitBounds(L.latLngBounds(placed.map(({ listing }) => [listing.lat, listing.lng])), { padding: [40, 40], maxZoom: 15 });
    else if (placed.length === 1) map.current.setView([placed[0].listing.lat, placed[0].listing.lng], 14);
    else map.current.setView(dest.center, dest.zoom);
  }, [items, dest]);
  return (
    <div className="relative h-[340px] min-w-0 flex-[3_1_620px] overflow-hidden rounded-[22px] border md:h-[460px]" style={{ borderColor: "#E8DDC9", background: "#F7F1E6" }}>
      <div ref={box} role="region" aria-label={`Map of ${dest.name} with numbered pins for the places listed below`} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-3.5 left-3.5 z-[500] flex flex-wrap gap-3.5 rounded-xl px-3 py-2.5 text-xs" style={{ background: "#FFFFFFEE" }}>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: BRAND.gold }} />Gold Star Partner</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: PREMIUM_COLOR }} />Premium Partner</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: FEATURED_COLOR }} />Featured Partner</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: DIRECTORY_PIN }} />Directory</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-white" style={{ boxShadow: `0 0 0 3px ${VERIFIED_RING}` }} />FunMaps LGBTQ+ Verified</span>
      </div>
    </div>
  );
}

function CityStories({ dest }) {
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=3&search=${encodeURIComponent(dest.query)}&_embed=wp:featuredmedia`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) =>
        setPosts(
          (Array.isArray(list) ? list : []).map((p) => ({
            id: p.id,
            title: decode(p.title?.rendered || ""),
            link: p.link,
            image: postImage(p),
          }))
        )
      )
      .catch(() => {});
  }, [dest]);
  if (!posts.length) return null;
  return (
    <section className="mx-auto max-w-[1280px] px-6 pt-16">
      <h2 className="mb-4 text-[24px] font-extrabold">Stories about {dest.name}</h2>
      <div className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {posts.map((p) => (
          <a key={p.id} href={p.link} className="flex flex-col gap-2.5 no-underline" style={{ color: BRAND.ink }}>
            <div className="overflow-hidden rounded-2xl" style={{ aspectRatio: "3 / 2", background: dest.tint }}>
              {p.image && <img src={p.image} alt="" className="block h-full w-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
            </div>
            <h3 className="m-0 text-lg font-extrabold leading-snug">{p.title}</h3>
          </a>
        ))}
      </div>
    </section>
  );
}

// "Venues for your tribe": a compact multi-select of every tribe on the rate
// card. Travelers pick the tribes they identify with; the count shows how many
// places here are tagged with each.
function TribePicker({ counts, picked, setPicked }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !box.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const groups = RATE_CARD.tribeGroups;
  const toggle = (t) => setPicked(picked.includes(t) ? picked.filter((x) => x !== t) : [...picked, t]);
  const summary = picked.length === 0 ? "All" : picked.length <= 2 ? picked.join(", ") : `${picked.length} selected`;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm"
        style={{ borderColor: picked.length ? BRAND.night : "#DDD3E4", color: BRAND.ink }}
      >
        <span className="font-semibold" style={{ color: BRAND.muted }}>Venues for your tribe:</span>
        <span className="font-bold">{summary}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[1100] mt-2 sm:left-auto sm:right-0 w-[min(420px,calc(100vw-48px))] rounded-2xl border bg-white p-4" style={{ borderColor: BRAND.line, boxShadow: "0 14px 34px #1A122633" }}>
          <div className="flex max-h-[min(440px,60vh)] flex-col gap-3.5 overflow-y-auto">
            {groups.map((g) => (
              <fieldset key={g.group} className="m-0 border-0 p-0">
                <legend className="mb-1.5 p-0 text-xs font-bold uppercase tracking-[0.06em]" style={{ color: BRAND.muted }}>{g.group}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {g.tribes.map((t) => (
                    <label key={t} className="inline-flex min-h-[36px] cursor-pointer items-center gap-2 text-[15px]">
                      <input type="checkbox" checked={picked.includes(t)} onChange={() => toggle(t)} style={{ width: 18, height: 18, accentColor: BRAND.magenta }} />
                      {t}
                      {counts[t] ? <span className="text-xs" style={{ color: BRAND.muted }}>({counts[t]})</span> : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: BRAND.line }}>
            <button type="button" onClick={() => setPicked([])} disabled={!picked.length} className="cursor-pointer border-0 bg-transparent p-0 text-sm font-bold" style={{ color: picked.length ? BRAND.magenta : "#B9AFC2" }}>
              Clear
            </button>
            <button type="button" onClick={() => setOpen(false)} className="cursor-pointer rounded-[10px] border-0 px-4 py-2 text-sm font-bold text-white" style={{ background: BRAND.night }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Destination({ slug }) {
  const dest = DESTINATIONS.find((d) => d.slug === slug);
  const [all, setAll] = useState(null);
  const [cat, setCat] = useState("all");
  // Selected tribes; a place shows if it has any of them. It's the traveler's
  // own choice, so it follows them to other destination pages (this browser only).
  const [picked, setPickedState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("funmaps-tribes") || "[]");
      return Array.isArray(saved) ? saved.filter((t) => RATE_CARD.tribeGroups.some((g) => g.tribes.includes(t))) : [];
    } catch {
      return [];
    }
  });
  const setPicked = (next) => {
    setPickedState(next);
    try {
      localStorage.setItem("funmaps-tribes", JSON.stringify(next));
    } catch {
      // storage blocked: the choice just lasts for this page
    }
  };
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [trip, setTrip] = useState(() => (dest ? loadTrip(dest.slug) : []));

  useEffect(() => {
    if (!dest) return;
    fetch("/api/listings")
      .then((r) => (r.ok ? r.json() : { listings: [] }))
      .then((d) => setAll((d.listings || []).filter((l) => inDestination(dest, l.city))))
      .catch(() => setAll([]));
  }, [dest]);

  // Number every listing once (best tier first, as the API orders them), so a
  // place keeps its pin number while filters change.
  const numbered = useMemo(() => (all || []).map((listing, i) => ({ n: i + 1, listing })), [all]);
  const shown = numbered.filter(
    ({ listing: l }) => (cat === "all" || l.category === cat) && (!picked.length || (l.tribes || []).some((t) => picked.includes(t))) && (!verifiedOnly || l.verified)
  );
  const categories = [...new Set(numbered.map(({ listing }) => listing.category).filter(Boolean))];
  const tribeCounts = {};
  for (const { listing } of numbered) for (const t of listing.tribes || []) tribeCounts[t] = (tribeCounts[t] || 0) + 1;
  const verifiedCount = numbered.filter(({ listing }) => listing.verified).length;

  const toggleTrip = (l) => {
    const next = trip.some((t) => t.id === l.id) ? trip.filter((t) => t.id !== l.id) : [...trip, { id: l.id, name: l.businessName }];
    setTrip(next);
    saveTrip(dest.slug, next);
  };
  const inTrip = (l) => trip.some((t) => t.id === l.id);
  const compassLink = `${COMPASS_URL}?destination=${encodeURIComponent(dest?.compass || "")}${
    trip.length ? `&notes=${encodeURIComponent(`Please include these places I saved on FunMaps: ${trip.map((t) => t.name).join(", ")}.`)}` : ""
  }`;

  if (!dest) {
    return (
      <main className="mx-auto max-w-[1280px] px-6 py-24">
        <h1 className="text-4xl font-extrabold">We don't have a page for that destination yet</h1>
        <p className="mt-3" style={{ color: BRAND.body }}>
          <a href={href("/")}>Back to the homepage</a> or <a href={COMPASS_URL}>plan a trip anywhere with Compass</a>.
        </p>
      </main>
    );
  }

  const gold = shown.filter(({ listing }) => listing.rank === 1);
  const premium = shown.filter(({ listing }) => listing.rank === 2);
  const basic = shown.filter(({ listing }) => listing.rank !== 1 && listing.rank !== 2 && !isDirectory(listing));
  const directory = shown.filter(({ listing }) => isDirectory(listing));
  const directoryByCategory = [...new Set(directory.map(({ listing }) => listing.category))]
    .sort()
    .map((c) => ({ category: c, items: directory.filter(({ listing }) => listing.category === c) }));

  return (
    <main>
      <section className="mx-auto max-w-[1280px] px-6 pt-7">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="m-0 text-sm" style={{ color: BRAND.muted }}>
            <a href={href("/")}>Home</a> / <a href={href("/#destinations")}>Destinations</a> / {dest.name}
          </p>
          <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-2">
            {verifiedCount > 0 && (
              <button
                type="button"
                aria-pressed={verifiedOnly}
                onClick={() => setVerifiedOnly(!verifiedOnly)}
                className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-bold"
                style={{ borderColor: BRAND.teal, background: verifiedOnly ? BRAND.teal : "#FFFFFF", color: verifiedOnly ? "#FFFFFF" : BRAND.tealDark }}
              >
                ✓ LGBTQ+ Verified only
              </button>
            )}
            <TribePicker counts={tribeCounts} picked={picked} setPicked={setPicked} />
          </div>
        </div>
        <h1 className="m-0 text-[36px] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-[52px]">Gay {dest.name}</h1>
        <p className="mt-3 max-w-[760px] text-[17px] leading-relaxed" style={{ color: BRAND.body }}>
          Where to stay, eat, drink and explore in {dest.name}, with FunMaps LGBTQ+ Verified welcoming places and insider picks.{" "}
          <a href={LEGACY.search(dest.query)}>Read the full FunMaps guide to {dest.name}</a>.
        </p>
      </section>

      <section className="mx-auto flex max-w-[1280px] flex-wrap gap-5 px-6 pt-6">
        <FunMap dest={dest} items={shown} />
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-[22px] p-[22px]" style={{ background: "#EEF8F8" }}>
            <h2 className="m-0 flex items-center gap-2 text-[19px] font-extrabold">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={BRAND.teal} strokeWidth="2" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
              {verifiedCount} FunMaps LGBTQ+ Verified {verifiedCount === 1 ? "place" : "places"} here
            </h2>
            <p className="m-0 text-sm leading-relaxed" style={{ color: BRAND.body }}>Checked against our published standards every year. Free, and never sold with advertising.</p>
            <a href={href("/verified")} className="text-sm font-bold">What LGBTQ+ Verified means</a>
          </div>
          <div className="flex flex-col gap-2 rounded-[22px] p-[22px]" style={{ background: "#F5EDF7" }}>
            <h2 className="m-0 text-[19px] font-extrabold">Plan {dest.name} with Compass</h2>
            <p className="m-0 text-sm leading-relaxed" style={{ color: BRAND.body }}>Add places to your trip as you browse, then let Compass build your day-by-day itinerary.</p>
            <a href={compassLink} className="self-start rounded-[10px] px-4 py-2.5 text-sm font-bold text-white no-underline" style={{ background: BRAND.magenta }}>
              Open Compass
            </a>
          </div>
        </aside>
      </section>

      <section className="mx-auto flex max-w-[1280px] flex-col gap-3.5 px-6 pt-7">
        {categories.length > 1 && (
          <div>
          <p id="cat-filter-label" className="m-0 mb-1 text-[12.5px] font-bold uppercase tracking-[0.08em]" style={{ color: BRAND.muted }}>Filter by category</p>
          <div role="group" aria-labelledby="cat-filter-label" className="flex gap-1.5 overflow-x-auto whitespace-nowrap border-b" style={{ borderColor: BRAND.line }}>
            {[["all", "All"], ...categories.map((c) => [c, prettyCategory(c)])].map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={cat === id}
                onClick={() => setCat(id)}
                className="min-h-[44px] shrink-0 cursor-pointer border-0 bg-transparent px-4 py-3 text-[15px] font-bold"
                style={{ color: cat === id ? BRAND.magenta : BRAND.muted, boxShadow: `inset 0 -3px 0 ${cat === id ? BRAND.magenta : "transparent"}` }}
              >
                {label}
              </button>
            ))}
          </div>
          </div>
        )}
        {all !== null && all.length > 0 && (
          <p className="m-0 text-sm" style={{ color: BRAND.muted }}>
            Showing {shown.length} of {all.length} {all.length === 1 ? "place" : "places"}. Partner listings are paid placements.
          </p>
        )}
      </section>

      <section className="mx-auto flex max-w-[1280px] flex-col gap-[22px] px-6 pt-5">
        {all === null && <p style={{ color: BRAND.muted }}>Loading places…</p>}
        {all !== null && all.length === 0 && (
          <div className="flex flex-col items-start gap-3 rounded-[18px] border border-dashed p-7" style={{ borderColor: "#DDD3E4" }}>
            <p className="m-0 text-base font-bold">FunMaps listings for {dest.name} are coming soon.</p>
            <p className="m-0 text-[15px]" style={{ color: BRAND.body }}>
              Meanwhile, <a href={LEGACY.search(dest.query)}>read our {dest.name} guide</a> or <a href={compassLink}>plan your trip with Compass</a>.
            </p>
          </div>
        )}
        {all !== null && all.length > 0 && shown.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed p-8 text-center" style={{ borderColor: "#DDD3E4" }}>
            <p className="m-0 font-bold">
              {picked.length ? `No places here are tagged ${picked.join(" or ")} yet.` : "No places match those filters."}
            </p>
            <button type="button" onClick={() => { setCat("all"); setPicked([]); setVerifiedOnly(false); }} className="cursor-pointer rounded-[10px] border bg-white px-4 py-2.5 text-sm font-bold" style={{ borderColor: "#DDD3E4" }}>
              Clear filters
            </button>
          </div>
        )}

        {gold.map(({ n, listing: l }) => (
          <article key={l.id} className="flex flex-wrap overflow-hidden rounded-3xl border-2 bg-white" style={{ borderColor: BRAND.gold }}>
            <div className="relative min-w-0 flex-[3_1_520px]" style={{ aspectRatio: "2 / 1", background: dest.tint }}>
              {l.imageUrl && <img src={l.imageUrl} alt="" className="block h-full w-full object-cover" />}
              <div className="absolute left-4 top-4"><PaidLabel listing={l} /></div>
              <div className="absolute bottom-4 left-4"><PinNumber n={n} listing={l} size={34} /></div>
            </div>
            <div className="flex min-w-0 flex-[2_1_340px] flex-col justify-center gap-2.5 p-[30px]">
              <p className="m-0 text-[12.5px] font-bold uppercase tracking-[0.06em]" style={{ color: BRAND.muted }}>{prettyCategory(l.category)} · {l.city}</p>
              <h2 className="m-0 text-[30px] font-extrabold leading-tight">{l.businessName}</h2>
              {l.verified && <VerifiedBadge />}
              {l.description && <p className="m-0 text-base leading-relaxed" style={{ color: BRAND.body }}>{l.description}</p>}
              <div className="mt-1.5 flex flex-wrap gap-2.5">
                <TripButton inTrip={inTrip(l)} onClick={() => toggleTrip(l)} />
                {l.website && <a href={l.website} target="_blank" rel="noopener" className="rounded-[10px] border px-4 py-2.5 text-sm font-bold no-underline" style={{ borderColor: "#DDD3E4", color: BRAND.ink }}>Website</a>}
                {l.address && <a href={directionsUrl(l)} target="_blank" rel="noopener" className="rounded-[10px] border px-4 py-2.5 text-sm font-bold no-underline" style={{ borderColor: "#DDD3E4", color: BRAND.ink }}>Directions</a>}
              </div>
            </div>
          </article>
        ))}

        {premium.length > 0 && (
          <div className="grid gap-[22px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(380px, 100%), 1fr))" }}>
            {premium.map(({ n, listing: l }) => (
              <article key={l.id} className="flex flex-col overflow-hidden rounded-[22px] border bg-white" style={{ borderColor: BRAND.line }}>
                <div className="relative" style={{ aspectRatio: "2 / 1", background: dest.tint }}>
                  {l.imageUrl && <img src={l.imageUrl} alt="" className="block h-full w-full object-cover" loading="lazy" />}
                  <div className="absolute left-3 top-3"><PaidLabel listing={l} /></div>
                  <div className="absolute bottom-3 left-3"><PinNumber n={n} listing={l} /></div>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <p className="m-0 text-xs font-bold uppercase tracking-[0.06em]" style={{ color: BRAND.muted }}>{prettyCategory(l.category)} · {l.city}</p>
                  <h3 className="m-0 text-[21px] font-extrabold">{l.businessName}</h3>
                  {l.verified && <VerifiedBadge small />}
                  {l.description && <p className="m-0 text-[15px] leading-relaxed" style={{ color: BRAND.body }}>{l.description}</p>}
                  <div className="mt-auto flex flex-wrap gap-2.5 pt-1.5">
                    <TripButton inTrip={inTrip(l)} onClick={() => toggleTrip(l)} />
                    {l.website && <a href={l.website} target="_blank" rel="noopener" className="rounded-[10px] border px-4 py-2.5 text-sm font-bold no-underline" style={{ borderColor: "#DDD3E4", color: BRAND.ink }}>Website</a>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {basic.length > 0 && (
          <div>
            <h2 className="mb-3 text-xl font-extrabold">Featured Partners</h2>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {basic.map(({ n, listing: l }) => (
                <article key={l.id} className="flex items-start gap-3.5 rounded-2xl border p-3.5" style={{ borderColor: BRAND.line }}>
                  <div className="relative shrink-0 overflow-visible rounded-xl" style={{ width: 96, height: 96, background: dest.tint }}>
                    {l.imageUrl && <img src={l.imageUrl} alt="" className="block h-full w-full rounded-xl object-cover" loading="lazy" />}
                    <div className="absolute -left-2 -top-2"><PinNumber n={n} listing={l} size={26} /></div>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap gap-1.5">
                      <PaidLabel listing={l} />
                      {l.verified && <span className="text-[11px] font-bold" style={{ color: BRAND.tealDark }}>✓ LGBTQ+ Verified</span>}
                    </div>
                    <h3 className="m-0 text-base font-extrabold">{l.businessName}</h3>
                    <p className="m-0 text-[13px]" style={{ color: BRAND.muted }}>
                      {prettyCategory(l.category)}
                    </p>
                    {l.phone && <a href={`tel:${l.phone.replace(/[^0-9+]/g, "")}`} className="text-[13px]">{l.phone}</a>}
                    <div className="mt-1 flex flex-wrap gap-2">
                      <TripButton compact inTrip={inTrip(l)} onClick={() => toggleTrip(l)} />
                      {l.website && <a href={l.website} target="_blank" rel="noopener" className="self-center text-[13px] font-bold">Website</a>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {directory.length > 0 && (
          <div className="mt-2">
            <h2 className="m-0 text-xl font-extrabold">{gold.length + premium.length + basic.length > 0 ? `All places in ${dest.name}` : `Places in ${dest.name}`}</h2>
            <p className="mb-3 mt-1 text-sm" style={{ color: BRAND.muted }}>Our full directory, free to every business we list. Verified places first.</p>
            <div className="flex flex-col gap-6">
              {directoryByCategory.map(({ category, items }) => (
                <div key={category}>
                  {directoryByCategory.length > 1 && <h3 className="mb-1 text-[13px] font-bold uppercase tracking-[0.06em]" style={{ color: BRAND.muted }}>{prettyCategory(category)}</h3>}
                  <ul className="m-0 list-none divide-y p-0" style={{ borderTop: `1px solid ${BRAND.line}`, borderBottom: `1px solid ${BRAND.line}` }}>
                    {items.map(({ n, listing: l }) => (
                      <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" style={{ borderColor: BRAND.line }}>
                        <PinNumber n={n} listing={l} size={24} />
                        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[15px] font-bold">{l.businessName}</span>
                            {l.verified && <span className="text-[11px] font-bold" style={{ color: BRAND.tealDark }}>✓ FunMaps LGBTQ+ Verified</span>}
                          </div>
                          <span className="text-[13px]" style={{ color: BRAND.muted }}>
                            {[l.address, l.city].filter(Boolean).join(", ")}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[13px] font-bold">
                          {l.phone && <a href={`tel:${l.phone.replace(/[^0-9+]/g, "")}`}>{l.phone}</a>}
                          {l.website && <a href={l.website} target="_blank" rel="noopener">Website</a>}
                          {l.address && <a href={directionsUrl(l)} target="_blank" rel="noopener">Directions</a>}
                          <TripButton compact inTrip={inTrip(l)} onClick={() => toggleTrip(l)} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <CityStories dest={dest} />

      {trip.length > 0 && (
        <div className="pointer-events-none sticky bottom-4 z-[600] mx-auto mt-7 flex max-w-[1280px] justify-end px-6">
          <div className="pointer-events-auto flex items-center gap-3.5 rounded-full py-2.5 pl-5 pr-2.5 text-white" style={{ background: BRAND.night, boxShadow: "0 12px 30px #00000040" }}>
            <span className="text-sm font-semibold">My trip: {trip.length} {trip.length === 1 ? "place" : "places"}</span>
            <a href={compassLink} className="rounded-full px-4 py-2.5 text-sm font-extrabold no-underline" style={{ background: BRAND.orange, color: BRAND.ink }}>
              Open in Compass
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
