import { useState } from "react";
import { apiCall, buildCityString } from "./adminShared.jsx";

// ---------- Import free directory listings from a spreadsheet (admin only) ----------
// Upload a .csv (File → Download → CSV in Google Sheets or Excel's "Save as CSV")
// with the columns: Business name, Category, Street address, City, State,
// Phone, Website (a Notes column, if present, is shown but not imported).
// Each row becomes a free Directory listing, approved, with its map pin looked
// up from the address. Rows already listed (same name and city) are skipped.

function parseCsv(text, sep = ",") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const yes = (v) => /^(y|yes|true|x|1|signed|paid|done)$/i.test(String(v || "").trim());

// "2026-11-01", "11/1/2026" or "11/1/26" → "2026-11-01"; "" stays ""; null if unreadable.
function parseDate(v) {
  const t = String(v || "").trim();
  if (!t) return "";
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

// Tier column → rate card product. Blank, "Directory" or "Free" = the free listing.
function productFor(label) {
  const k = norm(label);
  if (!k || k === "directory" || k === "free" || k.startsWith("directorylisting")) return { id: "directory" };
  if (k.startsWith("goldstar")) return { id: "gold-star" };
  if (k.startsWith("premiumdestination")) return { id: "premium-destination" };
  if (k.startsWith("premiumcategory")) return { id: "premium-category" };
  if (k.startsWith("basic")) return { id: "basic" };
  if (k === "premium") return { problem: "Tier says Premium: choose Premium Destination or Premium Category" };
  return { problem: `Unknown tier "${label}"` };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function ImportListings({ adminKey, rateCard, listings, onDone, inputStyle }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);

  const categoryFor = (label) => {
    const k = norm(label).replace(/accomadations/, "accommodations");
    return rateCard.categories.find((c) => norm(c) === k || norm(c).replace(/and/g, "") === k.replace(/and/g, "")) || null;
  };

  async function readFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setProgress(null);
    setRows(null);
    // Excel saves "CSV" several ways: commas, semicolons or tabs between
    // columns, in UTF-8 or UTF-16 text, sometimes as a workbook. Handle them all.
    const bytes = new Uint8Array(await file.arrayBuffer());
    if ((bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) {
      return setError('This is an Excel workbook (.xlsx), not a CSV file. In Excel choose File → Save As → "CSV UTF-8 (Comma delimited) (*.csv)", then choose that new file here.');
    }
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
    let text = new TextDecoder(encoding).decode(bytes);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || "";
    const sep = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
    const parsed = parseCsv(text, sep);
    // The column names may sit below a title row: start at the first row that names them.
    const isHeader = (r) => {
      const h = r.map(norm);
      return h.some((x) => x.includes("businessname") || x === "name" || x === "business") && h.some((x) => x.includes("category"));
    };
    const headerAt = Math.max(0, parsed.slice(0, 6).findIndex(isHeader));
    const table = parsed.slice(headerAt);
    if (table.length < 2) return setError("That file has no rows to import.");
    const head = table[0].map(norm);
    const col = (...names) => head.findIndex((h) => names.some((n) => h === n || h.includes(n)));
    const ix = { name: col("businessname", "business", "name"), category: col("category"), address: col("streetaddress", "address"), city: col("city"), state: col("state"), phone: col("phone"), website: col("website", "url"), notes: col("notes"), tier: col("tier", "product"), price: col("price"), start: col("startdate", "start"), end: col("enddate", "end"), signed: col("contractsigned", "contract"), paid: col("paid", "payment"), rep: col("rep"), image: col("imageurl", "image"), description: col("description") };
    if (ix.name < 0 || ix.category < 0 || ix.city < 0 || new Set([ix.name, ix.category, ix.city]).size < 3) {
      return setError(`Couldn't find the columns "Business name", "Category" and "City". The first row reads: ${table[0].slice(0, 8).map((c) => `"${String(c).trim()}"`).join(", ")}. If that looks right, tell Claude what it says.`);
    }
    const existing = new Set(listings.map((l) => `${norm(l.businessName)}|${norm(String(l.city).split(",")[0])}`));
    const seenInFile = new Set();
    setRows(
      table.slice(1).map((r) => {
        const get = (i) => (i >= 0 ? String(r[i] || "").trim() : "");
        const rec = { name: get(ix.name), categoryLabel: get(ix.category), category: categoryFor(get(ix.category)), address: get(ix.address), city: get(ix.city), state: get(ix.state).toUpperCase().slice(0, 2), phone: get(ix.phone), website: get(ix.website), notes: get(ix.notes) };
        const key = `${norm(rec.name)}|${norm(rec.city)}`;
        const prod = productFor(get(ix.tier));
        const product = rateCard.products.find((p) => p.id === prod.id);
        rec.product = prod.id;
        rec.productName = { "gold-star": "Gold Star", "premium-destination": "Premium Destination", "premium-category": "Premium Category", basic: "Basic", directory: "Directory (free)" }[prod.id] || get(ix.tier);
        rec.free = !!product?.free;
        const priceText = get(ix.price).replace(/[$,\s]/g, "");
        rec.price = priceText === "" ? null : Number(priceText);
        rec.startDate = parseDate(get(ix.start));
        rec.endDate = parseDate(get(ix.end));
        rec.contractSigned = yes(get(ix.signed));
        rec.paid = yes(get(ix.paid));
        rec.repName = get(ix.rep);
        rec.imageUrl = get(ix.image);
        rec.description = get(ix.description);
        const warnings = [];
        if (!rec.free && product) {
          if (rec.description.length > product.descriptionLimit) warnings.push(`Description is ${rec.description.length} characters; ${rec.productName} allows ${product.descriptionLimit}.`);
          if (!rec.imageUrl) warnings.push("No image.");
          const today = new Date().toISOString().slice(0, 10);
          const why = [!rec.contractSigned && "contract not signed", !rec.paid && "not paid", rec.startDate && rec.startDate > today && `starts ${rec.startDate}`, rec.endDate && rec.endDate < today && `ended ${rec.endDate}`].filter(Boolean);
          rec.live = why.length ? `Not live yet: ${why.join(", ")}` : "Live";
        } else rec.live = "Live";
        rec.warnings = warnings.join(" ");
        rec.problem = !rec.name ? "No business name" : !rec.category ? `Unknown category "${rec.categoryLabel}"` : !rec.city ? "No city" : prod.problem ? prod.problem : rec.price !== null && !(rec.price >= 0) ? `Price "${get(ix.price)}" isn't a number` : rec.startDate === null || rec.endDate === null ? "Dates must look like 11/1/2026 or 2026-11-01" : existing.has(key) ? "Already listed" : seenInFile.has(key) ? "Duplicate row" : "";
        seenInFile.add(key);
        if (rec.problem) rec.live = "";
        rec.include = !rec.problem;
        return rec;
      })
    );
  }

  async function runImport() {
    const todo = rows.filter((r) => r.include && !r.problem);
    setRunning(true);
    let added = 0;
    let noPin = 0;
    const failed = [];
    const imageIssues = [];
    for (let i = 0; i < todo.length; i++) {
      const r = todo[i];
      setProgress({ done: i, total: todo.length, current: r.name });
      const fullCity = buildCityString(r.city, "United States", r.state || "FL");
      let lat = null;
      let lng = null;
      if (r.address) {
        try {
          const g = await fetch(`/api/geocode?q=${encodeURIComponent(`${r.address}, ${fullCity}`)}`);
          if (g.ok) {
            const pos = await g.json();
            lat = pos.lat;
            lng = pos.lon;
          }
        } catch {
          // no pin; it can be added later with "Find map pin"
        }
        await sleep(1100); // the free map service allows about one lookup a second
      }
      if (lat === null) noPin++;
      // Paid listings: copy the ad image from the current funmaps.com into the new site's storage.
      let imageUrl = "";
      if (!r.free && /^https?:\/\//i.test(r.imageUrl)) {
        imageUrl = r.imageUrl;
        if (/^https:\/\/(www\.)?funmaps\.com\//i.test(r.imageUrl)) {
          try {
            const c = await fetch("/api/upload-venue-image", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": adminKey }, body: JSON.stringify({ copyFromUrl: r.imageUrl }) });
            const d = await c.json().catch(() => ({}));
            if (c.ok && d.url) imageUrl = d.url;
            else imageIssues.push(`${r.name}: image not copied (${d.error || c.status}); it still points at the old site`);
          } catch {
            imageIssues.push(`${r.name}: image not copied; it still points at the old site`);
          }
        }
      }
      const payload = { product: r.product, businessName: r.name, category: r.category, city: fullCity, address: r.address, phone: r.phone, website: r.website, tribes: [], lat, lng };
      if (!r.free) {
        Object.assign(payload, { description: r.description, imageUrl, price: r.price, startDate: r.startDate, endDate: r.endDate, contractSigned: r.contractSigned, paymentReceived: r.paid, repName: r.repName });
      }
      try {
        await apiCall("listings", "POST", payload, adminKey);
        added++;
      } catch (e) {
        failed.push(`${r.name}: ${e.message}`);
      }
    }
    setProgress({ done: todo.length, total: todo.length, finished: true, added, noPin, failed, imageIssues });
    setRunning(false);
    setRows(null);
    onDone();
  }

  const box = { background: "#241640", borderRadius: 14, padding: 16, marginBottom: 16 };
  const included = rows ? rows.filter((r) => r.include && !r.problem).length : 0;

  if (!open) {
    return (
      <div style={{ ...box, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#F5EFE6cc" }}>Adding many listings at once, free or paid? Import them from a spreadsheet.</span>
        <button onClick={() => setOpen(true)} style={{ background: "#1B1030", color: "#1C9C9C", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Import from spreadsheet
        </button>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "#1C9C9C" }}>Import listings from a spreadsheet</h3>
        {!running && (
          <button onClick={() => { setOpen(false); setRows(null); setProgress(null); }} style={{ background: "transparent", color: "#F5EFE699", border: "none", cursor: "pointer", fontSize: 13 }}>
            Close
          </button>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: "#F5EFE6aa", lineHeight: 1.6, margin: "0 0 10px" }}>
        Upload a CSV file with the columns Business name, Category, Street address, City, State, Phone and Website (in Google Sheets: File → Download → Comma-separated values; in Excel: Save as CSV). Rows without a Tier become free Directory listings, live right away. For paid listings add Tier (Gold Star, Premium Destination, Premium Category or Basic), Price, Start date, End date, Contract signed, Paid, Rep, Image URL and Description; they go live once signed, paid and in date. You'll see every row before anything is added. Map pins are looked up from the addresses (about one a second).
      </p>
      {!running && (
        <label style={{ display: "inline-block", background: "#1B1030", color: "#1C9C9C", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}>
          {rows ? "Choose a different file" : "Choose CSV file"}
          <input type="file" accept=".csv,text/csv" onChange={readFile} style={{ display: "none" }} />
        </label>
      )}
      {error && <p role="alert" style={{ color: "#B23A72", fontSize: 13 }}>{error}</p>}

      {rows && !running && (
        <>
          <div style={{ maxHeight: 420, overflow: "auto", border: "1px solid #F5EFE61a", borderRadius: 10, marginBottom: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "#1B1030", textAlign: "left" }}>
                  {["Add", "Business", "Category", "Tier", "Price", "City", "Status", "Problems and notes"].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", fontWeight: 700, color: "#F5EFE6cc" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F5EFE61a", opacity: r.problem || !r.include ? 0.55 : 1 }}>
                    <td style={{ padding: "6px 10px" }}>
                      <input type="checkbox" aria-label={`Import ${r.name}`} checked={r.include && !r.problem} disabled={!!r.problem} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} style={{ accentColor: "#D9662E" }} />
                    </td>
                    <td style={{ padding: "6px 10px", fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: "6px 10px" }}>{r.category || r.categoryLabel}</td>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{r.productName}</td>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{r.free ? "Free" : r.price === null ? "Rate card" : `$${r.price.toLocaleString("en-US")}`}</td>
                    <td style={{ padding: "6px 10px" }}>{r.city}{r.state ? `, ${r.state}` : ""}{!r.address && <em style={{ color: "#E8B84B", display: "block" }}>no address: no pin</em>}</td>
                    <td style={{ padding: "6px 10px", color: r.live === "Live" ? "#1C9C9C" : "#F5EFE6aa", minWidth: 120 }}>{r.live}</td>
                    <td style={{ padding: "6px 10px", minWidth: 240 }}>
                      {r.problem && <span style={{ color: "#E58AB5", display: "block", fontWeight: 600 }}>{r.problem}</span>}
                      {r.warnings && <span style={{ color: "#E8B84B", display: "block" }}>{r.warnings}</span>}
                      {r.notes && <span style={{ color: "#F5EFE699", display: "block" }}>{r.notes}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={runImport} disabled={!included} style={{ background: "#D9662E", color: "#1B1030", fontWeight: 700, padding: "10px 18px", borderRadius: 8, border: "none", cursor: included ? "pointer" : "default" }}>
            Import {included} listing{included === 1 ? "" : "s"}
          </button>
          <span style={{ fontSize: 12, color: "#F5EFE699", marginLeft: 10 }}>Untick any row you don't want. Rows already listed are skipped.</span>
        </>
      )}

      {progress && (
        <p role="status" style={{ fontSize: 13, color: progress.finished ? "#1C9C9C" : "#F5EFE6", marginTop: 10, marginBottom: 0 }}>
          {progress.finished
            ? `Done: ${progress.added} listing${progress.added === 1 ? "" : "s"} added${progress.noPin ? `; ${progress.noPin} without a map pin (use Find map pin on those)` : ""}.${progress.failed.length ? ` Not added: ${progress.failed.join("; ")}.` : ""}${progress.imageIssues?.length ? ` Added, but check the image: ${progress.imageIssues.join("; ")}.` : ""}`
            : `Adding ${progress.done + 1} of ${progress.total}: ${progress.current}… Keep this page open.`}
        </p>
      )}
    </div>
  );
}
