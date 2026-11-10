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

