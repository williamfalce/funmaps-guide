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
    const ix = { name: col("businessname", "business", "name"), category: col("category"), address: col("streetaddress", "address"), city: col("city"), state: col("state"), phone: col("phone"), website: col("website", "url"), notes: col("notes") };
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
        rec.problem = !rec.name ? "No business name" : !rec.category ? `Unknown category "${rec.categoryLabel}"` : !rec.city ? "No city" : existing.has(key) ? "Already listed" : seenInFile.has(key) ? "Duplicate row" : "";
        seenInFile.add(key);
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
      try {
        await apiCall("listings", "POST", { product: "directory", businessName: r.name, category: r.category, city: fullCity, address: r.address, phone: r.phone, website: r.website, tribes: [], lat, lng }, adminKey);
        added++;
      } catch (e) {
        failed.push(`${r.name}: ${e.message}`);
      }
    }
    setProgress({ done: todo.length, total: todo.length, finished: true, added, noPin, failed });
    setRunning(false);
    setRows(null);
    onDone();
  }

  const box = { background: "#241640", borderRadius: 14, padding: 16, marginBottom: 16 };
  const included = rows ? rows.filter((r) => r.include && !r.problem).length : 0;

  if (!open) {
    return (
      <div style={{ ...box, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#F5EFE6cc" }}>Adding many free Directory listings at once? Import them from a spreadsheet.</span>
        <button onClick={() => setOpen(true)} style={{ background: "#1B1030", color: "#1C9C9C", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Import from spreadsheet
        </button>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "#1C9C9C" }}>Import free Directory listings</h3>
        {!running && (
          <button onClick={() => { setOpen(false); setRows(null); setProgress(null); }} style={{ background: "transparent", color: "#F5EFE699", border: "none", cursor: "pointer", fontSize: 13 }}>
            Close
          </button>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: "#F5EFE6aa", lineHeight: 1.6, margin: "0 0 10px" }}>
        Upload a CSV file with the columns Business name, Category, Street address, City, State, Phone and Website (in Google Sheets: File → Download → Comma-separated values; in Excel: Save as CSV). You'll see every row before anything is added. Each becomes a free Directory listing, live right away, with its map pin looked up from the address (about one a second).
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
                  {["Add", "Business", "Category", "Address", "City", "Phone", "Notes"].map((h) => (
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
                    <td style={{ padding: "6px 10px" }}>{r.address || <em style={{ color: "#E8B84B" }}>none: no pin</em>}</td>
                    <td style={{ padding: "6px 10px" }}>{r.city}{r.state ? `, ${r.state}` : ""}</td>
                    <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{r.phone}</td>
                    <td style={{ padding: "6px 10px", color: r.problem ? "#E58AB5" : "#E8B84B", minWidth: 200 }}>{r.problem || r.notes}</td>
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
            ? `Done: ${progress.added} listing${progress.added === 1 ? "" : "s"} added${progress.noPin ? `; ${progress.noPin} without a map pin (use Find map pin on those)` : ""}.${progress.failed.length ? ` Not added: ${progress.failed.join("; ")}` : ""}`
            : `Adding ${progress.done + 1} of ${progress.total}: ${progress.current}… Keep this page open.`}
        </p>
      )}
    </div>
  );
}
