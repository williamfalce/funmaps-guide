import { useEffect } from "react";
import logo from "../assets/funmaps-logo.png";
import Home from "./Home.jsx";
import Verified from "./Verified.jsx";
import Destination from "./Destination.jsx";
import { DESTINATIONS, LEGACY, COMPASS_URL, ADVERTISE_URL, BRAND } from "./siteData.js";

// The FunMaps.com website. On funmaps.com it lives at the root; on
// compass.funmaps.com it is a preview under /site (hidden from search engines).
const IS_PREVIEW = !["funmaps.com", "www.funmaps.com"].includes(window.location.hostname);
export const BASE = IS_PREVIEW ? "/site" : "";
export const href = (p) => `${BASE}${p}` || "/";

const PAGES = {
  "": { component: Home, title: "FunMaps | LGBTQ+ Travel Guides, Maps & Trip Planner" },
  "/verified": { component: Verified, title: "What FunMaps LGBTQ+ Verified means | FunMaps" },
};

function useHead(title) {
  useEffect(() => {
    document.title = title;
    const set = (selector, create) => {
      let el = document.head.querySelector(selector);
      if (!el) {
        el = create();
        document.head.appendChild(el);
      }
      return el;
    };
    set('meta[name="description"]', () => Object.assign(document.createElement("meta"), { name: "description" })).content =
      "LGBTQ+ travel guides from FunMaps: verified welcoming places, insider city maps and the Compass trip planner, from 34 years of printed FunMaps.";
    set('meta[name="theme-color"]', () => Object.assign(document.createElement("meta"), { name: "theme-color" })).content = "#FFFFFF";
    if (IS_PREVIEW) set('meta[name="robots"]', () => Object.assign(document.createElement("meta"), { name: "robots" })).content = "noindex, nofollow";
    if (!document.head.querySelector('link[data-site-font]')) {
      const link = Object.assign(document.createElement("link"), {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      });
      link.dataset.siteFont = "1";
      document.head.appendChild(link);
    }
  }, [title]);
}

function Header() {
  return (
    <header className="border-b bg-white" style={{ borderColor: BRAND.line }}>
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3.5 px-6 py-3">
        <a href={href("/")} aria-label="FunMaps home">
          <img src={logo} alt="FunMaps" className="block h-[38px] w-auto md:h-[46px]" />
        </a>
        <nav aria-label="Main" className="order-last flex w-full gap-5 overflow-x-auto whitespace-nowrap text-[14px] font-semibold md:order-none md:w-auto md:gap-6 md:text-[15px]">
          <a href={href("/#destinations")} className="no-underline" style={{ color: BRAND.ink }}>Destinations</a>
          <a href={href("/#tribes")} className="no-underline" style={{ color: BRAND.ink }}>Things to do</a>
          <a href={href("/#stories")} className="no-underline" style={{ color: BRAND.ink }}>Stories</a>
          <a href={href("/verified")} className="no-underline" style={{ color: BRAND.ink }}>FunMaps LGBTQ+ Verified</a>
        </nav>
        <a href={COMPASS_URL} className="rounded-full px-4 py-2.5 text-[13px] font-bold text-white no-underline md:px-[18px] md:py-3 md:text-sm" style={{ background: BRAND.magenta }}>
          Plan with Compass
        </a>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-20" style={{ background: BRAND.soft }}>
      <div className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-6 px-6 py-10 text-sm" style={{ color: BRAND.muted }}>
        <div className="flex max-w-[560px] flex-col gap-2.5">
          <img src={logo} alt="FunMaps" className="h-10 w-auto self-start" />
          <span className="leading-relaxed">Fort Lauderdale, Florida · <a href="mailto:info@funmaps.com">info@funmaps.com</a></span>
          <span className="leading-relaxed">
            "Recommended" and "Featured" listings, banners and sponsored stories are paid placements. FunMaps LGBTQ+ Verified is free and can't be bought.
          </span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap content-start gap-[22px]">
          <a href={LEGACY.about}>About</a>
          <a href={href("/verified")}>What LGBTQ+ Verified means</a>
          <a href={ADVERTISE_URL}>Advertise</a>
          <a href={LEGACY.contact}>Contact</a>
          <a href={LEGACY.privacy}>Privacy</a>
        </nav>
      </div>
    </footer>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-[1280px] px-6 py-24">
      <h1 className="text-4xl font-extrabold">Page not found</h1>
      <p className="mt-3" style={{ color: BRAND.body }}>
        That page isn't here yet. <a href={href("/")}>Go to the homepage</a>.
      </p>
    </main>
  );
}

export default function Website() {
  const path = window.location.pathname.replace(/\/+$/, "").slice(BASE.length);
  const destMatch = path.match(/^\/destinations\/([a-z0-9-]+)$/);
  const dest = destMatch && DESTINATIONS.find((d) => d.slug === destMatch[1]);
  const page = dest
    ? { component: () => <Destination slug={dest.slug} />, title: `Gay ${dest.name}: LGBTQ+ travel guide and map | FunMaps` }
    : PAGES[path];
  useHead(page ? page.title : "Page not found | FunMaps");
  const Page = page ? page.component : NotFound;
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: BRAND.ink }}>
      {IS_PREVIEW && (
        <div className="px-6 py-2 text-center text-[13px] font-semibold text-white" style={{ background: BRAND.night }}>
          Preview of the new funmaps.com. Not public yet; the current site is unchanged.
        </div>
      )}
      <Header />
      <Page />
      <Footer />
    </div>
  );
}
