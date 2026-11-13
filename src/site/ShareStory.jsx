import { useRef, useState } from "react";
import { DESTINATIONS, BRAND } from "./siteData.js";
import { href } from "./Website.jsx";

// "Share your trip": travelers send in a personal travel story for Traveler
// Stories. Submissions go to the admin panel for review; nothing is published
// automatically (see api/_storiesHandler.js).

const MIN_STORY = 300;
const MAX_PHOTOS = 5;

// Phone photos are often several MB; shrink to at most 1600 px and a JPEG of
// about 1 MB or less before sending.
async function shrinkPhoto(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("That file doesn't look like a photo."));
    i.src = dataUrl;
  });
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let out = "";
  for (const q of [0.85, 0.75, 0.65, 0.55]) {
    out = canvas.toDataURL("image/jpeg", q);
    if (out.length < 1_400_000) break;
  }
  return out;
}

function monthLabel(v) {
  if (!/^\d{4}-\d{2}$/.test(v)) return v;
  const [y, m] = v.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const inputClass = "w-full rounded-xl border bg-white px-4 py-3 text-base outline-none focus:ring-2";
const inputStyle = { borderColor: "#DDD3E4", color: BRAND.ink };

function Field({ id, label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-bold">{label}</label>
      {children}
      {hint && <p className="m-0 text-[13px]" style={{ color: BRAND.muted }}>{hint}</p>}
    </div>
  );
}

export default function ShareStory() {
  const startedAt = useRef(Date.now());
  const [f, setF] = useState({ displayName: "", email: "", destination: "", tripMonth: "", title: "", story: "", hosted: false, hostedDetails: "", consent: false, website: "" });
  const [photos, setPhotos] = useState([]); // { url, preview }
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (changes) => setF((x) => ({ ...x, ...changes }));

  async function addPhotos(e) {
    const files = [...(e.target.files || [])].slice(0, MAX_PHOTOS - photos.length);
    e.target.value = "";
    if (!files.length) return;
    setError("");
    setUploading(true);
    try {
      for (const file of files) {
        const small = await shrinkPhoto(file);
        let res;
        try {
          res = await fetch("/api/stories?action=photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageDataUrl: small }) });
        } catch {
          throw new Error("Couldn't reach FunMaps to upload the photo. Check your connection and try again.");
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "That photo didn't upload. Try again.");
        setPhotos((p) => [...p, { url: data.url, preview: small }]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (f.story.trim().length < MIN_STORY) return setError(`Please tell us a little more: at least ${MIN_STORY} characters (you have ${f.story.trim().length}).`);
    if (!f.consent) return setError("Please tick the permission box so we can publish your story.");
    setSending(true);
    try {
      let res;
      try {
        res = await fetch("/api/stories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...f, tripMonth: monthLabel(f.tripMonth), photos: photos.map((p) => p.url), startedAt: startedAt.current }),
        });
      } catch {
        throw new Error("Couldn't reach FunMaps. Check your connection and try again; your story is still here.");
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto max-w-[760px] px-6 py-16">
        <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: BRAND.magenta }}>Traveler Stories</p>
        <h1 className="m-0 text-[36px] font-extrabold leading-tight">Thank you for sharing your trip!</h1>
        <p className="mt-4 text-[17px] leading-relaxed" style={{ color: BRAND.body }}>
          We read every story. If we'd like to publish yours, we'll be in touch at the email you gave us.
        </p>
        <a href={href("/")} className="mt-6 inline-block rounded-[10px] px-5 py-3 text-[15px] font-bold text-white no-underline" style={{ background: BRAND.magenta }}>
          Back to FunMaps
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[760px] px-6 pb-10 pt-10">
      <p className="mb-2 text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: BRAND.magenta }}>Traveler Stories</p>
      <h1 className="m-0 text-[36px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[44px]">Share your trip</h1>
      <p className="mt-3 text-[17px] leading-relaxed" style={{ color: BRAND.body }}>
        Real trips, told by LGBTQ+ travelers. Tell us where you went, what you loved and what other travelers should know. We read every story and publish our favorites on FunMaps.
      </p>

      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="ss-name" label="Your name as it should appear" hint="Your full name, first name or a pen name.">
            <input id="ss-name" required maxLength={80} value={f.displayName} onChange={(e) => set({ displayName: e.target.value })} className={inputClass} style={inputStyle} autoComplete="nickname" />
          </Field>
          <Field id="ss-email" label="Your email" hint="Only to contact you about your story. Never published.">
            <input id="ss-email" type="email" required maxLength={200} value={f.email} onChange={(e) => set({ email: e.target.value })} className={inputClass} style={inputStyle} autoComplete="email" />
          </Field>
          <Field id="ss-dest" label="Where did you go?">
            <input id="ss-dest" required list="ss-dest-list" maxLength={120} value={f.destination} onChange={(e) => set({ destination: e.target.value })} placeholder="City, state or country" className={inputClass} style={inputStyle} />
            <datalist id="ss-dest-list">
              {DESTINATIONS.map((d) => <option key={d.slug} value={d.compass} />)}
            </datalist>
          </Field>
          <Field id="ss-month" label="When? (optional)">
            <input id="ss-month" type="month" value={f.tripMonth} onChange={(e) => set({ tripMonth: e.target.value })} className={inputClass} style={inputStyle} />
          </Field>
        </div>

        <Field id="ss-title" label="A title for your story">
          <input id="ss-title" required maxLength={160} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Our first Pride in San Juan" className={inputClass} style={inputStyle} />
        </Field>

        <Field id="ss-story" label="Your story" hint={`${f.story.trim().length} characters · at least ${MIN_STORY}. Where you stayed, ate and went out, how welcome you felt, and tips for others.`}>
          <textarea id="ss-story" required rows={12} maxLength={20000} value={f.story} onChange={(e) => set({ story: e.target.value })} className={`${inputClass} resize-y leading-relaxed`} style={inputStyle} />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-bold">Photos (optional, up to {MAX_PHOTOS})</span>
          <div className="flex flex-wrap gap-3">
            {photos.map((p, i) => (
              <div key={p.url} className="relative">
                <img src={p.preview} alt={`Your photo ${i + 1}`} className="block h-[96px] w-[128px] rounded-xl object-cover" />
                <button type="button" onClick={() => setPhotos(photos.filter((x) => x.url !== p.url))} aria-label={`Remove photo ${i + 1}`} className="absolute -right-2 -top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-0 text-sm font-bold text-white" style={{ background: BRAND.night }}>
                  ×
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="flex h-[96px] w-[128px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-sm font-bold" style={{ borderColor: "#DDD3E4", color: BRAND.magenta }}>
                {uploading ? "Uploading…" : "+ Add photos"}
                <input type="file" accept="image/*" multiple onChange={addPhotos} disabled={uploading} className="sr-only" />
              </label>
            )}
          </div>
          <p className="m-0 text-[13px]" style={{ color: BRAND.muted }}>Only photos you took or have permission to share.</p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl p-5" style={{ background: BRAND.soft }}>
          <label className="flex cursor-pointer items-start gap-3 text-[15px]">
            <input type="checkbox" checked={f.hosted} onChange={(e) => set({ hosted: e.target.checked })} className="mt-1 h-5 w-5 shrink-0" style={{ accentColor: BRAND.magenta }} />
            <span>Part of this trip was hosted or given to me for free (a hotel stay, meal, tour or similar).</span>
          </label>
          {f.hosted && (
            <Field id="ss-hosted" label="What was hosted, and by whom?" hint="We'll mention it with your story, so readers know.">
              <input id="ss-hosted" maxLength={300} value={f.hostedDetails} onChange={(e) => set({ hostedDetails: e.target.value })} className={inputClass} style={inputStyle} />
            </Field>
          )}
          <label className="flex cursor-pointer items-start gap-3 text-[15px]">
            <input type="checkbox" required checked={f.consent} onChange={(e) => set({ consent: e.target.checked })} className="mt-1 h-5 w-5 shrink-0" style={{ accentColor: BRAND.magenta }} />
            <span>
              I wrote this story and took these photos (or have permission to share them), and I'm 18 or older. I give FunMaps permission to edit and publish my story and photos, with the name I chose above, on FunMaps.com, in the printed FunMaps guides and on FunMaps social media.
            </span>
          </label>
        </div>

        {/* Hidden from people; automated spam fills it in. */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
          <label htmlFor="ss-website">Leave this empty</label>
          <input id="ss-website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set({ website: e.target.value })} />
        </div>

        {error && <p role="alert" className="m-0 rounded-xl p-3 text-[15px] font-semibold" style={{ background: "#FBE9EF", color: "#9B2453" }}>{error}</p>}

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={sending || uploading} className="cursor-pointer rounded-[10px] border-0 px-6 py-3.5 text-base font-bold text-white disabled:opacity-60" style={{ background: BRAND.magenta }}>
            {sending ? "Sending…" : "Send my story"}
          </button>
          <span className="text-[13px]" style={{ color: BRAND.muted }}>Nothing is published until our editors review it.</span>
        </div>
      </form>
    </main>
  );
}
