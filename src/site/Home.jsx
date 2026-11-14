import { useEffect, useRef, useState } from "react";
import { DESTINATIONS, inDestination, TRIBES, LEGACY, COMPASS_URL, ADVERTISE_URL, WORDPRESS_URL, BRAND, postImage } from "./siteData.js";
import { href } from "./Website.jsx";
import { openSignup } from "./SignupPopup.jsx";

const card = { borderColor: BRAND.line };

function Check({ color = BRAND.teal, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

function MapIcon({ color = BRAND.orangeDark, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" aria-hidden="true">
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

function StarIcon({ color = BRAND.magenta, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" aria-hidden="true">
      <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}

function CompassIcon({ color = BRAND.magenta, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </svg>
  );
}

// Background loop that starts muted (so browsers allow autoplay), respects
// "reduce motion", and can be paused.
function LoopVideo({ src, poster, className, style }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.pause();
      setPlaying(false);
      return;
    }
    v.play().catch(() => setPlaying(false));
  }, []);
  const toggle = (e) => {
    e.preventDefault();
    const v = ref.current;
    if (!v) return;
    if (playing) v.pause();
    else v.play().catch(() => {});
    setPlaying(!playing);
  };
  return (
    <>
      <video ref={ref} src={src} poster={poster} autoPlay muted loop playsInline aria-hidden="true" className={className} style={style} />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause video" : "Play video"}
        className="absolute right-3 top-3 z-10 rounded-full border px-3 py-1.5 text-xs font-bold text-white"
        style={{ background: "#1A122699", borderColor: "#FFFFFF80", minHeight: 36 }}
      >
        {playing ? "Pause" : "Play"}
      </button>
    </>
  );
}

function Hero() {
  const [q, setQ] = useState("");
  const submit = (e) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    const match = DESTINATIONS.find((d) => d.name.toLowerCase().includes(term.toLowerCase()) || d.query.toLowerCase() === term.toLowerCase());
    window.location.href = match ? href(`/destinations/${match.slug}`) : LEGACY.search(term);
  };
  return (
    <section className="mx-auto max-w-[1280px] px-6 pt-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="min-w-0 flex-[1_1_520px]">
          <p className="mb-2.5 text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: BRAND.orangeDark }}>
            LGBTQ+ travel guides · 34 years of maps
          </p>
          <h1 className="m-0 text-[40px] font-extrabold leading-[1.03] tracking-[-0.02em] sm:text-[58px]">Go where you're welcome.</h1>
        </div>
        <form role="search" onSubmit={submit} className="flex min-w-0 flex-[1_1_440px] flex-wrap gap-2 rounded-2xl border bg-white p-2" style={{ borderColor: "#DDD3E4", boxShadow: "0 10px 30px #24152F14" }}>
          <label htmlFor="site-where" className="sr-only">Where are you going?</label>
          <input
            id="site-where"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Where are you going?"
            className="min-w-0 flex-[2_1_200px] border-0 bg-transparent px-3.5 py-3 text-base outline-none"
          />
          <button type="submit" className="min-h-[46px] cursor-pointer rounded-[10px] border-0 px-[22px] py-3 text-[15px] font-bold" style={{ background: BRAND.orange, color: BRAND.ink }}>
            Explore
          </button>
        </form>
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        <a href={COMPASS_URL} aria-label="FunMaps Compass: Plan It. Book It. Werk It." className="block min-w-0 flex-[0_1_416px] overflow-hidden rounded-3xl" style={{ height: 520, background: "#EDE3D3" }}>
          <img
            src="/site/compass-collage.jpg"
            alt="FunMaps Compass collage: rainbow flags on a New York avenue, a FunMaps map of Wilton Manors, a Miami lifeguard tower, couples and friends traveling, and the line Plan It. Book It. Werk It."
            className="block h-full w-full object-cover"
          />
        </a>
        <a href={LEGACY.search("deals")} className="relative block min-w-0 flex-[1_1_260px] overflow-hidden rounded-3xl text-white no-underline" style={{ height: 520, background: "#E9C24B" }}>
          <LoopVideo src="/site/getaway-loop-720.mp4" poster="/site/getaway-poster.jpg" className="block h-full w-full object-cover" style={{ objectPosition: "55% 30%" }} />
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0" style={{ height: "45%", background: "linear-gradient(0deg, #1A1226D9, #1A122600)" }} />
          <div className="absolute inset-x-5 bottom-5 flex flex-col gap-1.5">
            <span className="text-[22px] font-extrabold leading-tight">Getaways &amp; travel deals</span>
            <span className="text-sm" style={{ color: "#F1EAF6" }}>Partner offers this season →</span>
          </div>
        </a>
        <a href={COMPASS_URL} aria-label="Plan your trip with FunMaps Compass" className="relative block min-w-0 flex-[0_1_390px] overflow-hidden rounded-3xl no-underline" style={{ height: 520, background: "#3F879B" }}>
          <img
            src="/site/plan-book-werk.jpg"
            alt="Plan It. Book It. Werk It. A FunMaps suitcase covered in travel stickers. Your next trip starts at Compass.FunMaps.com"
            className="block h-full w-full object-cover"
            style={{ objectPosition: "center top" }}
          />
        </a>
      </div>
    </section>
  );
}

// Trust line, as a full-width strip right under the hero images.
function TrustStrip() {
  return (
    <div className="mt-7 border-y" style={{ background: BRAND.soft, borderColor: BRAND.line }}>
      <ul aria-label="Why FunMaps" className="mx-auto flex max-w-[1280px] list-none flex-wrap gap-x-7 gap-y-2 px-6 py-3.5 text-sm font-semibold" style={{ color: BRAND.body }}>
        <li className="inline-flex items-center gap-1.5"><Check />FunMaps LGBTQ+ Verified places</li>
        <li className="inline-flex items-center gap-1.5"><MapIcon />Printed FunMaps for 34 years</li>
        <li className="inline-flex items-center gap-1.5"><StarIcon />Endorsed by visitors bureaus, IGLTA and NGLCC affiliates</li>
      </ul>
    </div>
  );
}

// Story topics: the tribe groups and the travel styles, alphabetical.
// Each button opens matching FunMaps articles (a WordPress search for now).
// "Transgender" is spelled out: a search for "trans" also matches "transportation".
const STORY_TOPICS = [
  {
    group: "Your tribe",
    items: [
      { name: "Gay Men", query: "gay men" },
      { name: "Lesbians", query: "lesbian" },
      { name: "Transgender", query: "transgender" },
    ],
  },
  { group: "Travel style", items: TRIBES.map((t) => ({ name: t.name, query: t.query })) },
];

function StoryTopics() {
  return (
    <div id="tribes" className="mt-10 rounded-[22px] p-6 sm:p-8" style={{ background: BRAND.soft }}>
      <h3 className="m-0 text-[20px] font-extrabold">Read stories for your tribe &amp; travel style</h3>
      <p className="mb-5 mt-1.5 text-sm" style={{ color: BRAND.muted }}>Each topic opens our articles about it.</p>
      <div className="flex flex-col gap-4">
        {STORY_TOPICS.map((g) => (
          <div key={g.group} role="group" aria-label={`${g.group} stories`} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
            <span className="shrink-0 pt-2 text-xs font-bold uppercase tracking-[0.06em] sm:w-[120px]" style={{ color: BRAND.muted }}>{g.group}</span>
            <div className="flex flex-wrap gap-2">
              {g.items.map((t) => (
                <a key={t.name} href={LEGACY.search(t.query)} className="rounded-full border bg-white px-3.5 py-2 text-sm font-semibold no-underline" style={{ borderColor: "#DDD3E4", color: BRAND.ink }}>
                  {t.name}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Destination cards: photo, name, one-line hook and live counts from the
// website listings. Photos and hooks can be changed in the admin screen.
function Destinations() {
  const [custom, setCustom] = useState({});
  const [listings, setListings] = useState([]);
  useEffect(() => {
    fetch("/api/destinations")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => setCustom(d.destinations || {}))
      .catch(() => {});
    fetch("/api/listings")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => setListings(d.listings || []))
      .catch(() => {});
  }, []);
  return (
    <section id="destinations" className="mx-auto max-w-[1280px] px-6 pt-14">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h2 className="m-0 text-[32px] font-extrabold tracking-[-0.01em]">Popular destinations</h2>
        <a href={`${WORDPRESS_URL}/`} className="text-[15px] font-bold">All destinations</a>
      </div>
      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(270px, 100%), 1fr))" }}>
        {DESTINATIONS.map((d) => {
          const image = custom[d.slug]?.imageUrl || d.image;
          const hook = custom[d.slug]?.hook || d.hook;
          const here = listings.filter((l) => inDestination(d, l.city));
          const verified = here.filter((l) => l.verified).length;
          return (
            <a key={d.slug} href={href(`/destinations/${d.slug}`)} className="group relative flex h-[260px] flex-col justify-end overflow-hidden rounded-[20px] text-white no-underline" style={{ background: d.tint }}>
              {image && (
                <img src={image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              )}
              <div aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(0deg, #1A1226E6 0%, #1A122680 45%, #1A122600 75%)" }} />
              <span className="absolute left-3.5 top-3.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "#FFFFFFE6", color: BRAND.ink }}>
                <MapIcon color={BRAND.ink} size={12} /> Map guide
              </span>
              <div className="relative flex flex-col gap-1 p-5">
                <span className="text-[24px] font-extrabold leading-tight">{d.name}</span>
                {hook && <span className="text-[14px] leading-snug" style={{ color: "#F3EDF7" }}>{hook}</span>}
                {here.length > 0 && (
                  <span className="mt-1 text-[12.5px] font-bold" style={{ color: "#FFFFFF" }}>
                    {here.length} {here.length === 1 ? "place" : "places"}
                    {verified > 0 ? ` · ${verified} LGBTQ+ Verified` : ""}
                  </span>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

// "Recommended by FunMaps": live Gold Star and Premium website listings from
// the admin screen (only approved, signed, paid and in date — see api/listings.js).
function Recommended() {
  const [listings, setListings] = useState(null);
  useEffect(() => {
    fetch("/api/listings")
      .then((r) => (r.ok ? r.json() : { listings: [] }))
      .then((d) => setListings((d.listings || []).filter((l) => l.label === "Recommended").slice(0, 6)))
      .catch(() => setListings([]));
  }, []);
  if (listings === null) return null;
  return (
    <section className="mx-auto max-w-[1280px] px-6 pt-[72px]">
      <div className="mb-5">
        <h2 className="m-0 text-[32px] font-extrabold tracking-[-0.01em]">Recommended by FunMaps</h2>
        <p className="mt-1.5 text-sm" style={{ color: BRAND.muted }}>
          Recommended listings are paid placements. FunMaps LGBTQ+ Verified is earned separately and can't be bought.
        </p>
      </div>
      {listings.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-[15px]" style={{ borderColor: "#DDD3E4", color: BRAND.muted }}>
          Gold Star and Premium listings appear here once they're approved, signed and paid in the admin screen.
        </p>
      ) : (
        <div className="grid gap-[22px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {listings.map((l) => (
            <article key={l.id} className="flex flex-col overflow-hidden rounded-[20px] border bg-white" style={card}>
              <div className="relative" style={{ aspectRatio: "2 / 1", background: "#5A4A8E" }}>
                {l.imageUrl && <img src={l.imageUrl} alt="" className="block h-full w-full object-cover" />}
                <div className="absolute left-3 top-3 flex items-center gap-1.5">
                  <span className="rounded-full px-2.5 py-1 text-xs font-extrabold" style={{ background: BRAND.gold, color: BRAND.ink }}>★ Recommended</span>
                  <span className="rounded-full px-2 py-1 text-[11px] font-semibold text-white" style={{ background: "#1A1226b3" }}>Paid placement</span>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <p className="m-0 text-[12.5px] font-bold uppercase tracking-[0.06em]" style={{ color: BRAND.muted }}>
                  {String(l.category || "").replace(/&/g, " & ")} · {l.city}
                </p>
                <h3 className="m-0 text-[21px] font-extrabold">{l.businessName}</h3>
                {l.description && <p className="m-0 text-[15px] leading-relaxed" style={{ color: BRAND.body }}>{l.description}</p>}
                <div className="mt-auto flex flex-wrap gap-2.5 pt-2">
                  {l.website && (
                    <a href={l.website} target="_blank" rel="noopener" className="rounded-[10px] px-4 py-[11px] text-sm font-bold text-white no-underline" style={{ background: BRAND.magenta }}>
                      Visit website
                    </a>
                  )}
                  {l.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.businessName} ${l.address}`)}`}
                      target="_blank"
                      rel="noopener"
                      className="rounded-[10px] border px-4 py-2.5 text-sm font-bold no-underline"
                      style={{ borderColor: "#DDD3E4", color: BRAND.ink }}
                    >
                      Directions
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function WhyTrust() {
  const box = "flex flex-col gap-2.5 rounded-[20px] p-[26px]";
  return (
    <section className="mx-auto max-w-[1280px] px-6 pt-20">
      <h2 className="mb-6 text-[32px] font-extrabold tracking-[-0.01em]">Why travelers trust FunMaps</h2>
      <div className="grid gap-[22px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div className={box} style={{ background: "#EEF8F8" }}>
          <Check size={30} />
          <h3 className="m-0 text-xl font-extrabold">FunMaps LGBTQ+ Verified</h3>
          <p className="m-0 text-[15px] leading-relaxed" style={{ color: BRAND.body }}>
            Five required standards, from a written non-discrimination policy to equal treatment in practice, checked every year. Free, and never sold with advertising.
          </p>
          <a href={href("/verified")} className="text-sm font-bold">What LGBTQ+ Verified means</a>
        </div>
        <div className={box} style={{ background: "#FDF1E8" }}>
          <MapIcon size={30} />
          <h3 className="m-0 text-xl font-extrabold">Real maps, by locals</h3>
          <p className="m-0 text-[15px] leading-relaxed" style={{ color: BRAND.body }}>
            34 years of printed FunMaps, endorsed by visitors bureaus, IGLTA and NGLCC affiliates.
          </p>
          <a href="#destinations" className="text-sm font-bold">Browse destinations</a>
        </div>
        <div className={box} style={{ background: "#F5EDF7" }}>
          <CompassIcon size={30} />
          <h3 className="m-0 text-xl font-extrabold">Plan it in one place</h3>
          <p className="m-0 text-[15px] leading-relaxed" style={{ color: BRAND.body }}>
            Tell Compass where you're going and it builds a day-by-day itinerary with maps and booking links.
          </p>
          <a href={COMPASS_URL} className="text-sm font-bold">Try Compass</a>
        </div>
      </div>
    </section>
  );
}

function decode(html) {
  const t = document.createElement("textarea");
  t.innerHTML = html;
  return t.value;
}

// Latest articles, read from WordPress (where they're still written).
function Stories() {
  const [posts, setPosts] = useState(null);
  useEffect(() => {
    fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=3&_embed=wp:featuredmedia`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) =>
        setPosts(
          (Array.isArray(list) ? list : []).map((p) => ({
            id: p.id,
            title: decode(p.title?.rendered || ""),
            link: p.link,
            date: p.date,
            image: postImage(p),
          }))
        )
      )
      .catch(() => setPosts([]));
  }, []);
  return (
    <section id="stories" className="mx-auto max-w-[1280px] px-6 pt-20">
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
        <h2 className="m-0 text-[28px] font-extrabold">Stories</h2>
        <a href={`${WORDPRESS_URL}/`} className="text-sm font-bold">All stories</a>
      </div>
      {posts && posts.length > 0 && (
      <div className="grid gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {posts.map((p) => (
          <a key={p.id} href={p.link} className="flex flex-col gap-2.5 no-underline" style={{ color: BRAND.ink }}>
            <div className="overflow-hidden rounded-2xl" style={{ aspectRatio: "3 / 2", background: "#C27A4A" }}>
              {p.image && <img src={p.image} alt="" className="block h-full w-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
            </div>
            <h3 className="m-0 text-lg font-extrabold leading-snug">{p.title}</h3>
            <span className="text-[13px]" style={{ color: BRAND.muted }}>
              {new Date(p.date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
            </span>
          </a>
        ))}
      </div>
      )}
      <StoryTopics />
    </section>
  );
}

// Traveler Stories: personal trips sent in through "Share your trip" and
// published in WordPress under the "Traveler Stories" category.
function TravelerStories() {
  const [posts, setPosts] = useState(null);
  useEffect(() => {
    fetch(`${WORDPRESS_URL}/wp-json/wp/v2/categories?slug=traveler-stories`)
      .then((r) => (r.ok ? r.json() : []))
      .then((cats) => {
        if (!Array.isArray(cats) || !cats[0]) return [];
        return fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts?categories=${cats[0].id}&per_page=3&_embed=wp:featuredmedia`).then((r) => (r.ok ? r.json() : []));
      })
      .then((list) =>
        setPosts(
          (Array.isArray(list) ? list : []).map((p) => {
            const text = decode((p.excerpt?.rendered || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
            return {
              id: p.id,
              title: decode(p.title?.rendered || ""),
              link: p.link,
              excerpt: text.length > 220 ? `${text.slice(0, 217)}…` : text,
              image: postImage(p),
            };
          })
        )
      )
      .catch(() => setPosts([]));
  }, []);
  return (
    <section id="traveler-stories" className="mx-auto max-w-[1280px] px-6 pt-20">
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-[28px] font-extrabold">Traveler Stories</h2>
          <p className="m-0 mt-1 text-[16px]" style={{ color: BRAND.muted }}>Real trips, told by LGBTQ+ travelers.</p>
        </div>
        {posts && posts.length > 0 && (
          <a href={`${WORDPRESS_URL}/category/traveler-stories/`} className="text-sm font-bold">More traveler stories</a>
        )}
      </div>
      {posts && posts.length > 0 && (
        <div className="mb-5 grid gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))" }}>
          {posts.map((p) => (
            <a key={p.id} href={p.link} className="flex flex-col overflow-hidden rounded-[20px] border no-underline" style={{ borderColor: BRAND.line, color: BRAND.ink }}>
              {p.image && (
                <div style={{ aspectRatio: "16 / 9", background: BRAND.soft }}>
                  <img src={p.image} alt="" className="block h-full w-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                </div>
              )}
              <div className="flex flex-col gap-2 p-5">
                <span aria-hidden="true" className="text-[40px] font-extrabold leading-[0.6]" style={{ color: BRAND.magenta }}>“</span>
                <h3 className="m-0 text-lg font-extrabold leading-snug">{p.title}</h3>
                {p.excerpt && <p className="m-0 text-[14.5px] leading-relaxed" style={{ color: BRAND.body }}>{p.excerpt}</p>}
              </div>
            </a>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] p-6 sm:p-8" style={{ background: "#FDF1E8" }}>
        <div className="flex max-w-[640px] flex-col gap-1.5">
          <h3 className="m-0 text-[20px] font-extrabold">Been somewhere great? Share your trip.</h3>
          <p className="m-0 text-[15px]" style={{ color: BRAND.body }}>Tell other LGBTQ+ travelers where you went, what you loved and what to know. We publish our favorites.</p>
        </div>
        <a href={href("/share-your-trip")} className="rounded-[10px] px-5 py-3 text-[15px] font-bold text-white no-underline" style={{ background: BRAND.magenta }}>
          Share your trip
        </a>
      </div>
    </section>
  );
}

function SignupAndAdvertise() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 pt-20">
      <div className="flex flex-wrap gap-[22px]">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col items-start gap-3.5 rounded-[22px] p-9 text-white" style={{ background: BRAND.night }}>
          <h2 className="m-0 text-[26px] font-extrabold">Get the best of LGBTQ+ travel</h2>
          <p className="m-0 text-[15px]" style={{ color: "#E9E0F0" }}>Our free LGBTQ+ trip guide, the FunMaps newsletter and subscriber-only deals.</p>
          <button type="button" onClick={openSignup} className="cursor-pointer rounded-[10px] border-0 px-5 py-3 text-[15px] font-bold" style={{ background: BRAND.orange, color: BRAND.ink }}>
            Get the free guide &amp; newsletter
          </button>
        </div>
        <div className="flex min-w-0 flex-[1_1_420px] flex-col items-start gap-3.5 rounded-[22px] p-9" style={{ background: "#FDF1E8" }}>
          <h2 className="m-0 text-[26px] font-extrabold">Welcome LGBTQ+ travelers to your business</h2>
          <p className="m-0 text-[15px]" style={{ color: BRAND.body }}>
            Website profiles from Basic to Gold Star, rotating banners, Compass itinerary placement and the printed guides.
          </p>
          <a href={ADVERTISE_URL} className="rounded-[10px] px-5 py-3 text-[15px] font-bold text-white no-underline" style={{ background: BRAND.magenta }}>
            Advertise with FunMaps
          </a>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main>
      <Hero />
      <TrustStrip />
      <Destinations />
      <Recommended />
      <WhyTrust />
      <Stories />
      <TravelerStories />
      <SignupAndAdvertise />
    </main>
  );
}
