import { useEffect, useState } from "react";
import { apiCall } from "./adminShared.jsx";
import { DESTINATIONS } from "./site/siteData.js";

// ---------- Destination cards (admin only) ----------
// The photo and one-line hook on each homepage destination card.

const HOOK_MAX = 90;

// Shrinks a chosen photo to at most 1,600 px wide as a JPEG, small enough to upload.
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
  const scale = Math.min(1, 1600 / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  let out = "";
  for (const q of [0.85, 0.75, 0.65]) {
    out = canvas.toDataURL("image/jpeg", q);
    if (out.length < 2_400_000) break;
  }
  return { dataUrl: out, width: img.naturalWidth };
}

export function DestinationCardsPanel({ adminKey, inputStyle, labelStyle }) {
  const [custom, setCustom] = useState(null);
  const [hooks, setHooks] = useState({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState({});

  useEffect(() => {
    fetch("/api/destinations")
      .then((r) => r.json())
      .then((d) => setCustom(d.destinations || {}))
      .catch(() => setCustom({}));
  }, []);

  const say = (slug, ok, text) => setMessage((m) => ({ ...m, [slug]: { ok, text } }));

  async function save(slug, changes, doneText) {
    setBusy(slug);
    try {
      const d = await apiCall("destinations", "PUT", { slug, ...changes }, adminKey);
      setCustom(d.destinations || {});
      say(slug, true, doneText);
    } catch (e) {
      say(slug, false, e.message || "Couldn't save.");
    } finally {
      setBusy("");
    }
  }

  async function upload(slug, e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(slug);
    try {
      const { dataUrl, width } = await shrinkPhoto(file);
      const res = await fetch("/api/upload-venue-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ imageDataUrl: dataUrl, filename: `destination-${slug}.jpg` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed. Try again.");
      await save(slug, { imageUrl: data.url }, width < 900 ? `Photo saved. It's only ${width} pixels wide, so it may look soft; 1,200 or wider is best.` : "Photo saved.");
    } catch (err) {
      say(slug, false, err.message);
      setBusy("");
    }
  }

  if (!custom) return <p style={{ color: "#F5EFE699" }}>Loading destinations...</p>;

  return (
    <div style={{ background: "#241640", borderRadius: 14, padding: 20, marginBottom: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1C9C9C" }}>Destination cards</h2>
      <p style={{ fontSize: 12.5, color: "#F5EFE6aa", lineHeight: 1.6, marginBottom: 14 }}>
        The photo and one-line hook on each homepage destination card. Use landscape photos 1,200 pixels wide or more, that FunMaps owns or has permission to use. The place counts on the cards update by themselves from the listings.
      </p>
      {DESTINATIONS.map((d) => {
        const c = custom[d.slug] || {};
        const image = c.imageUrl || d.image;
        const hook = hooks[d.slug] ?? c.hook ?? d.hook ?? "";
        const msg = message[d.slug];
        return (
          <div key={d.slug} style={{ display: "flex", gap: 16, flexWrap: "wrap", background: "#1B1030", borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ width: 200, height: 120, borderRadius: 10, overflow: "hidden", background: d.tint, flexShrink: 0, position: "relative" }}>
              {image ? <img src={image} alt={`${d.name} card photo`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#FFFFFFcc" }}>No photo yet</span>}
            </div>
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{d.name}</div>
              <label htmlFor={`dc-hook-${d.slug}`} style={labelStyle}>HOOK LINE · {hook.length} / {HOOK_MAX}</label>
              <input id={`dc-hook-${d.slug}`} value={hook} maxLength={HOOK_MAX} onChange={(e) => setHooks({ ...hooks, [d.slug]: e.target.value })} style={{ ...inputStyle, marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={() => save(d.slug, { hook }, "Hook line saved.")} disabled={busy === d.slug} style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13 }}>
                  Save hook
                </button>
                <label style={{ background: "#241640", color: "#1C9C9C", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {busy === d.slug ? "Working..." : image ? "Replace photo" : "Add photo"}
                  <input type="file" accept="image/*" onChange={(e) => upload(d.slug, e)} disabled={busy === d.slug} style={{ display: "none" }} />
                </label>
                {c.imageUrl && (
                  <button onClick={() => save(d.slug, { imageUrl: "" }, d.image ? "Back to the original photo." : "Photo removed.")} disabled={busy === d.slug} style={{ background: "transparent", color: "#F5EFE699", border: "1px solid #F5EFE633", padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                    {d.image ? "Use original photo" : "Remove photo"}
                  </button>
                )}
              </div>
              {msg && <p role="status" style={{ fontSize: 12.5, marginTop: 8, marginBottom: 0, color: msg.ok ? "#1C9C9C" : "#B23A72" }}>{msg.text}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
