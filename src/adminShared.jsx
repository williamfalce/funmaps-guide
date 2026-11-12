import { useState } from "react";

// Pieces shared by the admin panel's tabs: city/state helpers, the
// proposed-changes note shown on entries awaiting review, and the API helper.

export const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"],
  ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"],
  ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"],
  ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"],
  ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
];
export const US_STATE_ABBRS = new Set(US_STATES.map(([abbr]) => abbr));
export const US_STATE_NAME_TO_ABBR = Object.fromEntries(US_STATES.map(([abbr, name]) => [name.toLowerCase(), abbr]));

export const COUNTRIES = [
  "United States", "Canada", "Mexico", "United Kingdom", "Ireland", "France", "Spain", "Portugal", "Germany",
  "Italy", "Netherlands", "Belgium", "Switzerland", "Austria", "Greece", "Sweden", "Norway", "Denmark", "Finland",
  "Iceland", "Poland", "Czech Republic", "Hungary", "Croatia", "Turkey", "Israel", "United Arab Emirates",
  "Thailand", "Japan", "South Korea", "Singapore", "Australia", "New Zealand", "Brazil", "Argentina", "Colombia",
  "Chile", "Peru", "Costa Rica", "Puerto Rico", "Dominican Republic", "Jamaica", "Bahamas", "Cuba", "South Africa",
  "Other",
];

// Splits a stored "City, ST" or "City, Country" string back into parts for editing.
export function parseCityString(fullCity) {
  const parts = (fullCity || "").split(",").map((s) => s.trim());
  if (parts.length < 2) return { cityName: parts[0] || "", country: "United States", state: "" };
  const cityName = parts[0];
  const region = parts[1];
  if (US_STATE_ABBRS.has(region.toUpperCase())) {
    return { cityName, country: "United States", state: region.toUpperCase() };
  }
  const matchedAbbr = US_STATE_NAME_TO_ABBR[region.toLowerCase()];
  if (matchedAbbr) {
    return { cityName, country: "United States", state: matchedAbbr };
  }
  return { cityName, country: region, state: "" };
}

// Builds the final consistent "City, ST" / "City, Country" string from the parts.
export function buildCityString(cityName, country, state) {
  if (!cityName?.trim()) return "";
  if (country === "United States") {
    return state ? `${cityName.trim()}, ${state}` : cityName.trim();
  }
  return country ? `${cityName.trim()}, ${country}` : cityName.trim();
}
// ---------- Proposed changes to live entries ----------
// When a sales rep edits an entry that is already live, the server keeps the
// approved version visible and stores the edit in `pendingChanges` for review.
export function withPending(rec) {
  return rec && rec.pendingChanges ? { ...rec, ...rec.pendingChanges } : rec;
}

export const FIELD_LABELS = {
  city: "City", businessName: "Business name", category: "Category", tier: "Tier", priceTier: "Price tier",
  tagline: "Description", address: "Address", phone: "Phone", imageUrl: "Image", ctaText: "Button text",
  ctaLink: "Button link", bookingLink: "Booking link", promoCode: "Promo code", promoIncentive: "Promo incentive",
  commissionRate: "Commission (%)", annualPrice: "Annual price ($)", startDate: "Start date", endDate: "End date",
  dealDescription: "Deal", discountCode: "Discount code", dealLink: "Deal link", active: "Active",
  // Website listings
  website: "Website", googleUrl: "Google listing", description: "Description", product: "Product",
  price: "Price ($/yr)", addOns: "Add-ons", signerName: "Signer", signerEmail: "Signer email",
  signerTitle: "Signer title", paymentReceived: "Payment received",
  tribes: "Tribes",
};

export function changedFields(rec) {
  if (!rec || !rec.pendingChanges) return [];
  return Object.keys(rec.pendingChanges).filter(
    (k) => k in FIELD_LABELS && JSON.stringify(rec.pendingChanges[k] ?? "") !== JSON.stringify(rec[k] ?? "")
  );
}

export function shortValue(v) {
  if (v === undefined || v === null || v === "") return "(empty)";
  const t = String(v);
  return t.length > 60 ? t.slice(0, 57) + "..." : t;
}

export function PendingChangesNote({ rec }) {
  const fields = changedFields(rec);
  return (
    <div style={{ flexBasis: "100%", order: 99, marginTop: 6, background: "#D9662E14", border: "1px solid #D9662E60", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#F5EFE6" }}>
      <div style={{ fontWeight: 700, color: "#D9662E", marginBottom: 4 }}>
        Proposed changes waiting for admin review. The live listing stays as it is until approved.
      </div>
      {fields.length === 0 ? (
        <div style={{ color: "#F5EFE6cc" }}>No field values differ from the live version.</div>
      ) : (
        fields.map((k) => (
          <div key={k} style={{ color: "#F5EFE6cc" }}>
            <strong style={{ color: "#F5EFE6" }}>{FIELD_LABELS[k]}:</strong> {shortValue(rec[k])} → {shortValue(rec.pendingChanges[k])}
          </div>
        ))
      )}
    </div>
  );
}

export async function apiCall(endpoint, method, body, adminKey, query) {
  const url = `/api/${endpoint}` + (query ? `?${query}` : "");
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "x-admin-key": adminKey || "" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}


// ---------- Send back to rep ----------
// Admin returns an entry (or its proposed changes) to the sales rep with a
// required note. Opens a small dialog for the note.
export function SendBackButton({ endpoint, rec, adminKey, onDone, style }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const changesOnly = !!rec.pendingChanges && rec.status !== "pending" && rec.status !== "needs_changes";

  async function submit() {
    if (!note.trim()) {
      setError("Write a note telling the rep what to change.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiCall(endpoint, "PUT", { id: rec.id, sendBack: true, note }, adminKey);
      setOpen(false);
      setNote("");
      await onDone();
    } catch (e) {
      setError(e.message || "Couldn't send it back — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={style}>
        Send back to rep
      </button>
      {open && (
        <div
          onClick={(e) => e.target === e.currentTarget && !saving && setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && !saving && setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "#0B061499", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby={`sendback-title-${rec.id}`} style={{ background: "#241640", color: "#F5EFE6", borderRadius: 14, padding: 20, width: "100%", maxWidth: 460, textAlign: "left", fontFamily: "Inter, sans-serif" }}>
            <h2 id={`sendback-title-${rec.id}`} style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              Send {changesOnly ? "these changes" : `"${rec.businessName}"`} back to the rep
            </h2>
            <p style={{ fontSize: 13, color: "#F5EFE6b3", marginBottom: 12 }}>
              {changesOnly
                ? "The live version stays as it is. The rep sees your note, edits the proposed changes and resubmits them."
                : "Nothing is deleted. The rep sees your note on the entry, makes the changes and resubmits it for review."}
            </p>
            <label htmlFor={`sendback-note-${rec.id}`} style={{ fontSize: 11.5, color: "#D9662E", fontWeight: 600, display: "block", marginBottom: 4 }}>
              WHAT NEEDS TO CHANGE? *
            </label>
            <textarea
              id={`sendback-note-${rec.id}`}
              autoFocus
              rows={4}
              maxLength={1000}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (error) setError("");
              }}
              placeholder="e.g. The photo is blurry. Please get a sharper 800 × 400 image from the owner."
              style={{ width: "100%", boxSizing: "border-box", background: "#C9AEC7", border: "none", borderRadius: 8, padding: "9px 12px", color: "#1B1030", fontSize: 14, resize: "vertical", fontFamily: "inherit" }}
            />
            {error && <p role="alert" style={{ color: "#E58AB5", fontSize: 13, marginTop: 8 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={submit} disabled={saving} style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 18px", borderRadius: 8, border: "none", cursor: saving ? "default" : "pointer" }}>
                {saving ? "Sending..." : "Send back"}
              </button>
              <button onClick={() => setOpen(false)} disabled={saving} style={{ background: "transparent", color: "#F5EFE6b3", border: "1px solid #F5EFE633", padding: "10px 18px", borderRadius: 8, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// The admin's note on an entry that was sent back (shown to reps and admins).
export function ReviewNoteBox({ rec, inForm = false }) {
  if (!rec || !rec.reviewNote) return null;
  const when = rec.reviewNoteAt ? new Date(rec.reviewNoteAt).toLocaleDateString() : "";
  const waitingOnRep = rec.status === "needs_changes" || rec.changesSentBack;
  const heading = inForm
    ? waitingOnRep
      ? "The admin sent this back. What to change:"
      : "Sent back earlier. The admin's note:"
    : rec.status === "needs_changes"
      ? "Sent back for changes. Click Edit, make the changes, then click Resubmit for review at the bottom of the form."
      : rec.changesSentBack
      ? "Proposed changes sent back. Click Edit, make the changes, then click Resubmit for review at the bottom of the form."
      : "Resubmitted after being sent back. The earlier note:";
  return (
    <div style={{ flexBasis: "100%", order: inForm ? 0 : 98, marginTop: inForm ? 0 : 6, background: waitingOnRep ? "#B23A721f" : "#F5EFE60d", border: `1px solid ${waitingOnRep ? "#B23A7280" : "#F5EFE626"}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: "#F5EFE6" }}>
      <div style={{ fontWeight: 700, color: waitingOnRep ? "#E58AB5" : "#F5EFE6b3", marginBottom: 3 }}>{heading}</div>
      <div style={{ whiteSpace: "pre-wrap" }}>“{rec.reviewNote}”</div>
      <div style={{ color: "#F5EFE699", marginTop: 3 }}>
        — {rec.reviewNoteBy || "Admin"}
        {when && `, ${when}`}
      </div>
    </div>
  );
}

// The form's main button label, so reps and admins see exactly what saving does.
export function saveLabel(isAdmin, record, noun) {
  if (!record) return isAdmin ? `Add ${noun}` : "Submit for review";
  const unapproved = record.status === "pending" || record.status === "needs_changes";
  if (isAdmin) return unapproved ? "Save & Approve" : record.pendingChanges ? "Save & approve changes" : `Update ${noun}`;
  return record.status === "needs_changes" || record.changesSentBack ? "Resubmit for review" : "Send changes for review";
}

// Shown at the top of a form while an entry is being edited: the admin's note
// (if it was sent back) and where the button is, since the form is long.
export function EditingBanner({ record, isAdmin, label }) {
  if (!record) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "4px 0 14px" }}>
      <ReviewNoteBox rec={record} inForm />
      <p style={{ fontSize: 12.5, color: "#F5EFE6", background: "#1C9C9C1f", border: "1px solid #1C9C9C55", borderRadius: 8, padding: "8px 10px", margin: 0 }}>
        Editing <strong>{record.businessName}</strong>. When you're done, click <strong>{label}</strong> at the bottom of this form.
        {!isAdmin && record.status === "approved" && " The live version stays up until an admin approves your changes."}
      </p>
    </div>
  );
}
