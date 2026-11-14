import { BRAND } from "./siteData.js";

// Public explanation of the FunMaps LGBTQ+ Verified badge, from the FunMaps LGBTQ+
// Friendly Verified Criteria (Oct 2026).
const REQUIRED = [
  ["Written non-discrimination policy", "covering sexual orientation and gender identity, for both guests and staff."],
  ["Equal treatment in practice", "same-sex couples get the same rooms, tables, packages and prices as anyone else, and no dress codes or rules target trans or gender-nonconforming people."],
  ["A named contact", "responsible for guest complaints about discrimination, and a commitment to respond."],
  ["No recent credible discrimination complaints", "checked with a review search covering the past two years."],
  ["A signed FunMaps LGBTQ+ Verified pledge", "agreeing to these standards, to fix problems reported to FunMaps, and to lose the badge if they don't."],
];

const STRENGTHS = [
  ["Staff training", "on LGBTQ+ inclusion in the past two years."],
  ["Inclusive forms and booking", "no forced \"Mr./Mrs.\" titles, gender options beyond two, and bookings that don't assume a man and a woman."],
  ["Restrooms", "at least one all-gender or single-occupancy restroom."],
  ["Visible welcome", "a pride flag, a safe-space sticker, or inclusive language and images online."],
  ["Community involvement", "taking part in Pride or local LGBTQ+ events, or supporting LGBTQ+ nonprofits."],
  ["Industry memberships", "IGLTA, a local LGBTQ+ chamber of commerce, or similar."],
  ["LGBTQ+-owned or -led", "counted only if the owner chooses to share it. Never required or asked."],
];

export default function Verified() {
  return (
    <main className="mx-auto max-w-[860px] px-6 pt-12">
      <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: BRAND.teal }}>FunMaps LGBTQ+ Verified</p>
      <h1 className="m-0 text-[40px] font-extrabold leading-tight tracking-[-0.02em]">What the LGBTQ+ Verified badge means</h1>
      <p className="mt-4 text-lg leading-relaxed" style={{ color: BRAND.body }}>
        FunMaps verifies what a business does, not who works there. A Verified business meets all five required standards and at least three strengths, and is checked again every year.
      </p>

      <div className="mt-6 rounded-2xl p-5 text-[15px] leading-relaxed" style={{ background: "#EEF8F8", color: BRAND.body }}>
        <strong style={{ color: BRAND.tealDark }}>Verification is free and separate from advertising.</strong> Paying for a listing never earns or speeds up the badge. Partner listings (Gold Star, Premium and Featured) are paid placements; Verified is earned.
      </div>

      <h2 className="mt-10 text-2xl font-extrabold">Required standards: all five</h2>
      <ul className="mt-3 flex list-none flex-col gap-3 p-0">
        {REQUIRED.map(([title, text]) => (
          <li key={title} className="flex gap-3 text-[16px] leading-relaxed" style={{ color: BRAND.body }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={BRAND.teal} strokeWidth="2.6" aria-hidden="true" className="mt-0.5 shrink-0"><path d="M5 12l5 5 9-10" /></svg>
            <span><strong style={{ color: BRAND.ink }}>{title}:</strong> {text}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-2xl font-extrabold">Strengths: at least three</h2>
      <ul className="mt-3 flex list-none flex-col gap-3 p-0">
        {STRENGTHS.map(([title, text]) => (
          <li key={title} className="flex gap-3 text-[16px] leading-relaxed" style={{ color: BRAND.body }}>
            <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: BRAND.magenta }} />
            <span><strong style={{ color: BRAND.ink }}>{title}:</strong> {text}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-2xl font-extrabold">How it works</h2>
      <ol className="mt-3 flex flex-col gap-2 pl-5 text-[16px] leading-relaxed" style={{ color: BRAND.body }}>
        <li>The business applies and shares its evidence.</li>
        <li>A FunMaps staff member reviews it and, where possible, visits or makes a mystery-shopper call.</li>
        <li>The business is approved, or told what's missing.</li>
        <li>The badge is renewed every year.</li>
        <li>Travelers can report a problem to FunMaps. If the business doesn't fix it, the badge comes off.</li>
      </ol>

      <p className="mt-8 text-[15px]" style={{ color: BRAND.body }}>
        Had an experience that doesn't match the badge? Tell us at <a href="mailto:info@funmaps.com?subject=FunMaps%20LGBTQ%2B%20Verified%20report">info@funmaps.com</a>.
      </p>
    </main>
  );
}
