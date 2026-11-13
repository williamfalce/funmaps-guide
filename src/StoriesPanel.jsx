import { useEffect, useState } from "react";
import { apiCall } from "./adminShared.jsx";

// ---------- Traveler Stories (admin only) ----------
// Stories sent in from the website's "Share your trip" page. Admins read them,
// mark where each one stands, and move the good ones into WordPress (as a
// draft in the "Traveler Stories" category) to edit and publish there.

const STATUS = {
  new: { label: "NEW", bg: "#D9662E", color: "#1B1030" },
  accepted: { label: "ACCEPTED", bg: "#1C9C9C", color: "#1B1030" },
  published: { label: "PUBLISHED", bg: "#5FD0D0", color: "#1B1030" },
  declined: { label: "DECLINED", bg: "#F5EFE622", color: "#F5EFE6aa" },
};

function plainText(s) {
  const lines = [`${s.title}`, `By ${s.displayName} · ${s.destination}${s.tripMonth ? `, ${s.tripMonth}` : ""}`];
  if (s.hosted) lines.push(`Disclosure: part of this trip was hosted or provided free${s.hostedDetails ? ` (${s.hostedDetails})` : ""}.`);
  lines.push("", s.story);
  if (s.photos?.length) lines.push("", "Photos:", ...s.photos);
  return lines.join("\n");
}

export function StoriesPanel({ adminKey, inputStyle, labelStyle }) {
  const [stories, setStories] = useState(null);
  const [wordpressReady, setWordpressReady] = useState(false);
  const [filter, setFilter] = useState("new");
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState({});

  async function load() {
    try {
      const d = await apiCall("stories", "GET", null, adminKey, "");
      setStories(d.stories || []);
      setWordpressReady(!!d.wordpressReady);
    } catch (e) {
      setMessage(e.message || "Couldn't load traveler stories.");
      setStories([]);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function update(s, changes, doneText) {
    setBusy(s.id);
    setMessage("");
    try {
      await apiCall("stories", "PUT", { id: s.id, ...changes }, adminKey);
      if (doneText) setMessage(doneText);
      await load();
    } catch (e) {
      setMessage(e.message || "Couldn't update that story.");
    } finally {
      setBusy("");
    }
  }

  async function remove(s) {
    if (!window.confirm(`Delete "${s.title}" by ${s.displayName}? This can't be undone.`)) return;
    try {
      await apiCall("stories", "DELETE", null, adminKey, `id=${encodeURIComponent(s.id)}`);
      await load();
    } catch (e) {
      setMessage(e.message || "Couldn't delete that story.");
    }
  }

  async function copy(s) {
    try {
      await navigator.clipboard.writeText(plainText(s));
      setMessage(`Copied "${s.title}". Paste it into a new WordPress post in the Traveler Stories category.`);
    } catch {
      setMessage("Your browser blocked copying. Open the story and select the text instead.");
    }
  }

  if (!stories) return <p style={{ color: "#F5EFE699" }}>{message || "Loading traveler stories..."}</p>;

  const count = (st) => stories.filter((s) => s.status === st).length;
  const shown = filter === "all" ? stories : stories.filter((s) => s.status === filter);
  const btn = { background: "#1B1030", border: "none", borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer", color: "#F5EFE6cc" };

  return (
    <>
      <div style={{ background: "#241640", borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1C9C9C" }}>Traveler Stories</h2>
        <p style={{ fontSize: 12.5, color: "#F5EFE6aa", lineHeight: 1.6, margin: 0 }}>
          Stories travelers send from the website's <a href="/site/share-your-trip" target="_blank" rel="noopener" style={{ color: "#5FD0D0" }}>Share your trip</a> page. Nothing is published automatically.
          To publish one, {wordpressReady ? "click Send to WordPress to create a draft" : "click Copy story and paste it into a new WordPress post"} in the <strong>Traveler Stories</strong> category, edit it there, publish, then mark it Published here.
          It then appears in the homepage's Traveler Stories section.
        </p>
        {!wordpressReady && (
          <p style={{ fontSize: 12, color: "#E8B84B", marginTop: 8, marginBottom: 0 }}>
            WordPress isn't connected yet, so Send to WordPress is off. Once a WordPress application password is added on the server, it switches on.
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <label htmlFor="ts-filter" style={{ ...labelStyle, marginBottom: 0 }}>SHOW</label>
        <select id="ts-filter" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...inputStyle, maxWidth: 240 }}>
          <option value="new">New ({count("new")})</option>
          <option value="accepted">Accepted ({count("accepted")})</option>
          <option value="published">Published ({count("published")})</option>
          <option value="declined">Declined ({count("declined")})</option>
          <option value="all">All ({stories.length})</option>
        </select>
      </div>
      {message && <p role="status" style={{ color: "#5FD0D0", fontSize: 13, marginBottom: 12 }}>{message}</p>}
      {shown.length === 0 && <p style={{ color: "#F5EFE699" }}>{stories.length === 0 ? "No stories yet. They'll appear here as travelers send them." : "Nothing here."}</p>}

      {shown.map((s) => {
        const st = STATUS[s.status] || STATUS.new;
        const isOpen = open === s.id;
        return (
          <div key={s.id} style={{ background: "#241640", borderRadius: 12, padding: 16, marginBottom: 10, border: s.status === "new" ? "1px solid #D9662E60" : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 380px" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{s.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: st.bg, color: st.color }}>{st.label}</span>
                  {s.hosted && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#E8B84B22", color: "#E8B84B" }}>HOSTED TRIP</span>}
                  {s.contestEntry && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A7233", color: "#E58AB5" }}>CONTEST ENTRY</span>}
                </div>
                <p style={{ fontSize: 13, color: "#F5EFE6cc", margin: 0 }}>
                  {s.displayName} · {s.destination}
                  {s.tripMonth ? ` · ${s.tripMonth}` : ""} · <a href={`mailto:${s.email}`} style={{ color: "#5FD0D0" }}>{s.email}</a>
                </p>
                <p style={{ fontSize: 12, color: "#F5EFE699", margin: "4px 0 0" }}>
                  Sent {new Date(s.createdAt).toLocaleDateString()} · {s.story.length.toLocaleString()} characters · {s.photos?.length || 0} photo{s.photos?.length === 1 ? "" : "s"}
                  {s.hosted && s.hostedDetails ? ` · Hosted: ${s.hostedDetails}` : ""}
                  {s.wpEditUrl && (
                    <>
                      {" · "}
                      <a href={s.wpEditUrl} target="_blank" rel="noopener" style={{ color: "#5FD0D0" }}>Open WordPress draft</a>
                    </>
                  )}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignContent: "flex-start", maxWidth: 380 }}>
                <button onClick={() => setOpen(isOpen ? null : s.id)} style={{ ...btn, color: "#1C9C9C" }}>{isOpen ? "Close" : "Read"}</button>
                {s.status !== "accepted" && s.status !== "published" && (
                  <button disabled={busy === s.id} onClick={() => update(s, { status: "accepted" })} style={{ ...btn, background: "#1C9C9C", color: "#1B1030", fontWeight: 700 }}>Accept</button>
                )}
                {wordpressReady && s.status !== "declined" && (
                  <button disabled={busy === s.id} onClick={() => update(s, { sendToWordPress: true }, `Draft ${s.wpPostId ? "updated" : "created"} in WordPress. Open it to edit and publish.`)} style={btn}>
                    {busy === s.id ? "Sending..." : s.wpPostId ? "Update WordPress draft" : "Send to WordPress"}
                  </button>
                )}
                <button onClick={() => copy(s)} style={btn}>Copy story</button>
                {s.status !== "published" && s.status !== "declined" && (
                  <button disabled={busy === s.id} onClick={() => update(s, { status: "published" })} style={btn}>Mark published</button>
                )}
                {s.status !== "declined" && s.status !== "published" && (
                  <button disabled={busy === s.id} onClick={() => update(s, { status: "declined" })} style={{ ...btn, color: "#E58AB5" }}>Decline</button>
                )}
                {(s.status === "declined" || s.status === "published") && (
                  <button disabled={busy === s.id} onClick={() => update(s, { status: "new" })} style={btn}>Move back to New</button>
                )}
                <button onClick={() => remove(s)} style={{ ...btn, color: "#B23A72" }}>Delete</button>
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, borderTop: "1px solid #F5EFE61a", paddingTop: 14 }}>
                {s.photos?.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {s.photos.map((u, i) => (
                      <a key={u} href={u} target="_blank" rel="noopener">
                        <img src={u} alt={`Photo ${i + 1} from ${s.displayName}`} style={{ width: 150, height: 100, objectFit: "cover", borderRadius: 8, display: "block" }} />
                      </a>
                    ))}
                  </div>
                )}
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.65, color: "#F5EFE6", background: "#1B1030", borderRadius: 10, padding: 14, maxHeight: 420, overflowY: "auto" }}>{s.story}</div>
                <label htmlFor={`ts-note-${s.id}`} style={{ ...labelStyle, marginTop: 12, display: "block" }}>NOTE FOR THE TEAM (PRIVATE)</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input id={`ts-note-${s.id}`} value={notes[s.id] ?? s.adminNote ?? ""} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} placeholder="e.g. Great story, trim the intro" style={{ ...inputStyle, flex: "1 1 260px" }} />
                  <button onClick={() => update(s, { adminNote: notes[s.id] ?? s.adminNote ?? "" }, "Note saved.")} style={{ ...btn, background: "#D9662E", color: "#1B1030", fontWeight: 700 }}>Save note</button>
                </div>
                <p style={{ fontSize: 11.5, color: "#F5EFE699", marginTop: 8 }}>
                  Permission to publish given {new Date(s.consentAt || s.createdAt).toLocaleString()}.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
