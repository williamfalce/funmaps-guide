import { useEffect, useRef, useState } from "react";
import { BRAND, LEGACY } from "./siteData.js";

// "Join FunMaps" pop-up: newsletter, the free trip guide and deals, through
// Brevo (see api/_subscribeHandler.js). It opens by itself once per visitor
// after some reading time, and any "Subscribe" button can open it with
// openSignup().
//
// When it opens by itself: after 30 seconds on the page or half-way down it,
// or (on computers) when the pointer heads for the browser's tabs to leave.
// Never again after signing up; after closing it, not for 30 days; after
// closing it twice, not again.

const STORE = "funmaps-signup";
const INTERESTS = ["Beach & Tropical", "City Breaks", "Pride & Events", "Cruises", "Luxury", "Bear", "Leather", "Travel Deals", "Weddings"];
const QUIET_PATHS = ["/share-your-trip", "/subscribed"];
const DAY = 24 * 60 * 60 * 1000;

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}") || {};
  } catch {
    return {};
  }
}
function writeState(s) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    // storage blocked: the pop-up may come back on another visit
  }
}

export function openSignup() {
  window.dispatchEvent(new Event("funmaps:open-signup"));
}

export default function SignupPopup({ path }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [interests, setInterests] = useState([]);
  const [trap, setTrap] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const openedAt = useRef(0);
  const auto = useRef(false);
  const firstField = useRef(null);
  const dialog = useRef(null);
  const returnFocus = useRef(null);

  function show(byItself) {
    returnFocus.current = document.activeElement;
    openedAt.current = Date.now();
    auto.current = byItself;
    setOpen(true);
  }

  // Opened by a button anywhere on the site.
  useEffect(() => {
    const onOpen = () => show(false);
    window.addEventListener("funmaps:open-signup", onOpen);
    return () => window.removeEventListener("funmaps:open-signup", onOpen);
  }, []);

  // Opens by itself, at most once per page and only when the rules allow.
  useEffect(() => {
    const s = readState();
    if (s.subscribed || (s.closes || 0) >= 2 || (s.closedAt && Date.now() - s.closedAt < 30 * DAY)) return;
    if (QUIET_PATHS.some((p) => path.startsWith(p))) return;
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      cleanup();
      show(true);
    };
    const timer = setTimeout(fire, 30000);
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 400 && window.scrollY / max > 0.5) fire();
    };
    const onLeave = (e) => {
      if (e.clientY <= 0 && !e.relatedTarget) fire();
    };
    const desktop = window.matchMedia("(pointer: fine)").matches;
    window.addEventListener("scroll", onScroll, { passive: true });
    if (desktop) document.addEventListener("mouseout", onLeave);
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseout", onLeave);
    }
    return cleanup;
  }, [path]);

  // While open: focus the form, keep Tab inside, Escape closes.
  useEffect(() => {
    if (!open) return;
    setTimeout(() => firstField.current?.focus(), 30);
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll("button, input, a[href]")].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, done]);

  function close() {
    setOpen(false);
    if (!done && auto.current) {
      const s = readState();
      writeState({ ...s, closedAt: Date.now(), closes: (s.closes || 0) + 1 });
    }
    setTimeout(() => returnFocus.current?.focus?.(), 0);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError("Please enter a valid email address.");
    setSending(true);
    try {
      let res;
      try {
        res = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, firstName, interests, website: trap, startedAt: openedAt.current }),
        });
      } catch {
        throw new Error("Couldn't reach FunMaps. Check your connection and try again.");
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      writeState({ ...readState(), subscribed: true });
      setDone(data.alreadySubscribed ? "already" : true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;
  const toggle = (i) => setInterests(interests.includes(i) ? interests.filter((x) => x !== i) : [...interests, i]);

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center sm:items-center sm:p-6" style={{ background: "#1A122699" }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signup-title"
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] bg-white sm:max-w-[520px] sm:rounded-[24px]"
        style={{ boxShadow: "0 24px 60px #1A122659", color: BRAND.ink, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
      >
        <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-t-[24px]">
          {["#E40303", "#FF8C00", "#FFED00", "#008026", "#004DFF", "#750787"].map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}
        </div>
        <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-4 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-2xl leading-none" style={{ color: BRAND.muted }}>
          ×
        </button>

        {done === "already" ? (
          <div className="flex flex-col gap-3 px-7 pb-8 pt-8">
            <h2 id="signup-title" className="m-0 pr-8 text-[26px] font-extrabold leading-tight">You're already on the list!</h2>
            <p className="m-0 text-[16px] leading-relaxed" style={{ color: BRAND.body }}>
              <strong>{email.trim()}</strong> already gets the FunMaps newsletter. We've saved your trip interests so the deals we send fit you better.
            </p>
            <button type="button" onClick={close} className="mt-2 cursor-pointer self-start rounded-[10px] border-0 px-5 py-3 text-[15px] font-bold text-white" style={{ background: BRAND.magenta }}>
              Keep exploring
            </button>
          </div>
        ) : done ? (
          <div className="flex flex-col gap-3 px-7 pb-8 pt-8">
            <h2 id="signup-title" className="m-0 pr-8 text-[26px] font-extrabold leading-tight">Almost there! Check your inbox.</h2>
            <p className="m-0 text-[16px] leading-relaxed" style={{ color: BRAND.body }}>
              We've sent a message to <strong>{email.trim()}</strong>. Click <strong>Confirm</strong> in it, and your free trip guide arrives right after.
            </p>
            <p className="m-0 text-[14px]" style={{ color: BRAND.muted }}>Not there in a few minutes? Check your spam or promotions folder.</p>
            <button type="button" onClick={close} className="mt-2 cursor-pointer self-start rounded-[10px] border-0 px-5 py-3 text-[15px] font-bold text-white" style={{ background: BRAND.magenta }}>
              Keep exploring
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4 px-7 pb-7 pt-7">
            <div className="pr-8">
              <p className="m-0 mb-1.5 text-[12.5px] font-bold uppercase tracking-[0.12em]" style={{ color: BRAND.magenta }}>Free LGBTQ+ trip guide</p>
              <h2 id="signup-title" className="m-0 text-[28px] font-extrabold leading-tight tracking-[-0.01em]">Join FunMaps</h2>
              <p className="m-0 mt-2 text-[15.5px] leading-relaxed" style={{ color: BRAND.body }}>
                Get our latest free trip guide, the FunMaps newsletter and subscriber-only travel deals, straight to your inbox.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
              <label className="flex min-w-0 flex-col gap-1 text-[14px] font-bold">
                First name <span className="sr-only">(optional)</span>
                <input ref={firstField} value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} autoComplete="given-name" placeholder="Optional" className="w-full min-w-0 rounded-xl border px-3.5 py-3 text-base font-normal" style={{ borderColor: "#DDD3E4" }} />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[14px] font-bold">
                Email
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" inputMode="email" className="w-full min-w-0 rounded-xl border px-3.5 py-3 text-base font-normal" style={{ borderColor: "#DDD3E4" }} />
              </label>
            </div>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 p-0 text-[14px] font-bold">
                What kind of trips do you love? <span className="font-normal" style={{ color: BRAND.muted }}>Optional</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((i) => (
                  <button key={i} type="button" aria-pressed={interests.includes(i)} onClick={() => toggle(i)} className="min-h-[36px] cursor-pointer rounded-full border px-3 py-1.5 text-[13.5px] font-semibold" style={interests.includes(i) ? { background: BRAND.night, color: "#FFFFFF", borderColor: BRAND.night } : { background: "#FFFFFF", color: BRAND.ink, borderColor: "#DDD3E4" }}>
                    {i}
                  </button>
                ))}
              </div>
            </fieldset>
            <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
              <label>
                Leave this empty
                <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
              </label>
            </div>
            {error && <p role="alert" className="m-0 rounded-xl p-3 text-[14.5px] font-semibold" style={{ background: "#FBE9EF", color: "#9B2453" }}>{error}</p>}
            <button type="submit" disabled={sending} className="cursor-pointer rounded-[12px] border-0 px-5 py-3.5 text-base font-extrabold disabled:opacity-60" style={{ background: BRAND.orange, color: BRAND.ink }}>
              {sending ? "Sending…" : "Send me the free guide"}
            </button>
            <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: BRAND.muted }}>
              We'll email you a link to confirm. Unsubscribe anytime. <a href={LEGACY.privacy}>Privacy policy</a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
