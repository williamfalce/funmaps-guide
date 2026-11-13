import { useEffect, useState } from "react";
import { apiCall } from "./adminShared.jsx";

// ---------- Newsletter & Guide links (admin only) ----------
// Where the permanent links /guide and /newsletter send people. The Brevo
// welcome email links to these, so each quarter only this page changes.

const PERMANENT = "https://compass.funmaps.com";

export function LatestLinksPanel({ adminKey, inputStyle, labelStyle }) {
  const [latest, setLatest] = useState(null);
  const [visits, setVisits] = useState({ guide: 0, newsletter: 0 });
  const [form, setForm] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const d = await apiCall("latest", "GET", null, adminKey, "");
      setLatest(d.latest);
      setVisits(d.visits || { guide: 0, newsletter: 0 });
      setForm({ guideUrl: d.latest.guideUrl, guideName: d.latest.guideName, newsletterUrl: d.latest.newsletterUrl, newsletterName: d.latest.newsletterName });
    } catch (e) {
      setMessage(e.message || "Couldn't load the links.");
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const d = await apiCall("latest", "PUT", form, adminKey);
      setLatest(d.latest);
      setMessage("Saved. The permanent links now open these.");
    } catch (e) {
      setMessage(e.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (!latest) return <p style={{ color: "#F5EFE699" }}>{message || "Loading..."}</p>;

  const block = (kind, title, hint) => {
    const urlKey = `${kind}Url`;
    const nameKey = `${kind}Name`;
    const link = `${PERMANENT}/${kind}`;
    return (
      <div style={{ background: "#1B1030", borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px", color: "#F5EFE6" }}>{title}</h3>
        <p style={{ fontSize: 12.5, color: "#F5EFE6aa", margin: "0 0 10px" }}>
          Permanent link:{" "}
          <a href={link} target="_blank" rel="noopener" style={{ color: "#5FD0D0" }}>{link}</a>
          {" · "}opened {visits[kind].toLocaleString()} time{visits[kind] === 1 ? "" : "s"}
        </p>
        <label htmlFor={`ll-${nameKey}`} style={labelStyle}>NAME (FOR YOUR REFERENCE)</label>
        <input id={`ll-${nameKey}`} value={form[nameKey] || ""} onChange={(e) => setForm({ ...form, [nameKey]: e.target.value })} style={{ ...inputStyle, marginBottom: 10 }} />
        <label htmlFor={`ll-${urlKey}`} style={labelStyle}>WHERE IT GOES</label>
        <input id={`ll-${urlKey}`} value={form[urlKey] || ""} onChange={(e) => setForm({ ...form, [urlKey]: e.target.value })} placeholder="https://" style={inputStyle} />
        <p style={{ fontSize: 12, color: "#F5EFE699", margin: "6px 0 0" }}>{hint}</p>
      </div>
    );
  };

  return (
    <div style={{ background: "#241640", borderRadius: 14, padding: 20, marginBottom: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1C9C9C" }}>Newsletter &amp; Guide links</h2>
      <p style={{ fontSize: 12.5, color: "#F5EFE6aa", lineHeight: 1.6, marginBottom: 14 }}>
        The Brevo welcome email links to the two permanent links below, so it never needs editing. Each quarter, after the new guide is uploaded and the newsletter campaign is sent, paste their addresses here and save. Anyone who clicks a permanent link, even in an older welcome email, gets the latest one.
      </p>
      {block("guide", "Latest free trip guide", "The guide PDF's address: in WordPress, Media → the PDF → Copy URL to clipboard.")}
      {block("newsletter", "Latest newsletter issue", "The issue's public web version: in Brevo, open the sent campaign and copy its share link.")}
      {message && <p role="status" style={{ fontSize: 13, color: message.startsWith("Saved") ? "#1C9C9C" : "#B23A72", marginBottom: 10 }}>{message}</p>}
      <button onClick={save} disabled={saving} style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 20px", borderRadius: 8, border: "none", cursor: saving ? "default" : "pointer" }}>
        {saving ? "Saving..." : "Save links"}
      </button>
      {latest.updatedBy && (
        <p style={{ fontSize: 12, color: "#F5EFE699", marginTop: 10 }}>
          Last changed by {latest.updatedBy}
          {latest.updatedAt ? ` on ${new Date(latest.updatedAt).toLocaleDateString()}` : ""}.
        </p>
      )}
    </div>
  );
}
