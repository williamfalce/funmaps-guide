import { BRAND, COMPASS_URL } from "./siteData.js";
import { href } from "./Website.jsx";

// Where Brevo's "Confirm your subscription" link lands.
export default function Subscribed() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-16">
      <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: BRAND.magenta }}>You're subscribed</p>
      <h1 className="m-0 text-[36px] font-extrabold leading-tight sm:text-[44px]">Welcome to FunMaps!</h1>
      <p className="mt-4 text-[17px] leading-relaxed" style={{ color: BRAND.body }}>
        Your email is confirmed. Your free trip guide is on its way to your inbox now, and you'll get the FunMaps newsletter and subscriber-only deals from here on.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <a href={href("/#destinations")} className="rounded-[10px] px-5 py-3 text-[15px] font-bold text-white no-underline" style={{ background: BRAND.magenta }}>
          Explore destinations
        </a>
        <a href={COMPASS_URL} className="rounded-[10px] border px-5 py-3 text-[15px] font-bold no-underline" style={{ borderColor: "#DDD3E4", color: BRAND.ink }}>
          Plan a trip with Compass
        </a>
      </div>
    </main>
  );
}
