import { useState, useEffect } from "react";
import { US_STATES, COUNTRIES, parseCityString, buildCityString, withPending, PendingChangesNote, apiCall } from "./adminShared.jsx";

// ---------- Website Listings ----------
// FunMaps.com profiles sold from the rate card (Gold Star, Premium, Basic).
// Sales reps enter them; admins approve. A listing appears on the website only
// once it is approved, the contract is signed, payment is received, and today
// falls between its start and end dates (see api/listings.js, isLive).

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function money(n) {
  return "$" + Number(n || 0).toLocaleString("en-US");
}

const emptyListingForm = {
  id: null,
  status: "",
  partnerId: "",
  cityName: "",
  country: "United States",
  state: "",
  businessName: "",
  category: "Restaurants",
  address: "",
  phone: "",
  website: "",
  googleUrl: "",
  description: "",
  product: "gold-star",
  price: "",
  addOns: [],
  imageUrl: "",
  signerName: "",
  signerEmail: "",
  signerTitle: "",
  startDate: "",
  endDate: "",
  paymentReceived: false,
  contractSigned: false,
  repCommissionRate: "",
};

// Why a listing isn't showing on the website (mirrors isLive in api/listings.js).
function notLiveReasons(l) {
  const r = [];
  const t = todayStr();
  if (l.status === "pending") r.push("waiting for admin approval");
  if (l.active === false) r.push("paused");
  if (!l.contractSigned) r.push("contract not signed");
  if (!l.paymentReceived) r.push("payment not received");
  if (l.startDate && l.startDate > t) r.push(`starts ${l.startDate}`);
  if (l.endDate && t > l.endDate) r.push(`ended ${l.endDate}`);
  return r;
}

// Checks an image's pixel size against the product: at least the required size, same shape (within 3%).
function checkImageSize(width, height, product) {
  if (!product || !product.image) return "";
  const { width: w, height: h } = product.image;
  const okShape = Math.abs(width / height - w / h) <= 0.03 * (w / h);
  if (width >= w && height >= h && okShape) return "";
  return `This image is ${width} × ${height}. ${product.name} needs ${w} × ${h} pixels (or larger in the same shape).`;
}

function imageDimensions(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

export function WebsiteListingsPanel({ adminKey, adminRole, inputStyle, labelStyle }) {
  const isAdmin = adminRole === "admin";
  const [rateCard, setRateCard] = useState(null);
  const [listings, setListings] = useState([]);
  const [partners, setPartners] = useState([]);
  const [form, setForm] = useState({ ...emptyListingForm, startDate: todayStr() });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageWarning, setImageWarning] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");

  const product = rateCard?.products.find((p) => p.id === form.product);
  const commissionRate = form.repCommissionRate !== "" ? Number(form.repCommissionRate) : rateCard?.digitalCommissionRate ?? 20;

  async function load() {
    try {
      const [rc, ls, ps] = await Promise.all([
        apiCall("rate-card", "GET", null, adminKey, ""),
        apiCall("listings", "GET", null, adminKey, ""),
        apiCall("banners", "GET", null, adminKey, ""),
      ]);
      setRateCard(rc.rateCard);
      setListings((ls.listings || []).slice().reverse()); // newest first
      setPartners(ps.banners || []);
    } catch (e) {
      setError("Couldn't load website listings.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-check an already-uploaded image whenever the product (and so the required size) changes.
  useEffect(() => {
    let cancelled = false;
    if (!form.imageUrl || !product) {
      setImageWarning("");
      return;
    }
    imageDimensions(form.imageUrl)
      .then(({ width, height }) => !cancelled && setImageWarning(checkImageSize(width, height, product)))
      .catch(() => !cancelled && setImageWarning(""));
    return () => {
      cancelled = true;
    };
  }, [form.imageUrl, form.product, product]);

  function set(changes) {
    setForm((f) => ({ ...f, ...changes }));
  }

  function linkPartner(id) {
    const p = partners.find((x) => x.id === id);
    if (!p) {
      set({ partnerId: "" });
      return;
    }
    const { cityName, country, state } = parseCityString(p.city);
    set({
      partnerId: p.id,
      businessName: p.businessName || "",
      cityName,
      country,
      state,
      category: rateCard?.categories.includes(p.category) ? p.category : form.category,
      address: p.address || "",
      phone: p.phone || "",
      website: p.ctaLink || "",
      description: p.tagline || "",
    });
  }

  async function handleImageSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { width, height } = await imageDimensions(dataUrl);
      const sizeProblem = checkImageSize(width, height, product);
      if (sizeProblem) {
        setError(sizeProblem + " Ask the advertiser for a larger image.");
        return;
      }
      const res = await fetch("/api/upload-venue-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ imageDataUrl: dataUrl, filename: file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      set({ imageUrl: data.url });
    } catch (err) {
      setError(err.message || "Image upload failed — try a smaller file (under 2 MB).");
    } finally {
      setUploading(false);
    }
  }

  function startEdit(orig) {
    const l = withPending(orig);
    const { cityName, country, state } = parseCityString(l.city);
    setForm({
      ...emptyListingForm,
      ...l,
      cityName,
      country,
      state,
      price: l.price ?? "",
      repCommissionRate: l.repCommissionRate ?? "",
      addOns: l.addOns || [],
    });
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setForm({ ...emptyListingForm, startDate: todayStr() });
    setError("");
  }

  async function save() {
    setError("");
    setNotice("");
    if (!form.businessName.trim() || !form.cityName.trim()) return setError("Business name and city are required.");
    if (form.country === "United States" && !form.state) return setError("Please select a state.");
    if (!form.imageUrl) return setError(`Upload the advertiser's image (${product?.image.width} × ${product?.image.height}).`);
    if (imageWarning) return setError(imageWarning + " Upload a larger image or pick a different product.");
    if (product && form.description.length > product.descriptionLimit) {
      return setError(`The description is ${form.description.length} characters; ${product.name} allows ${product.descriptionLimit}.`);
    }
    if (!form.signerName.trim() || !form.signerEmail.trim()) return setError("Add the name and email of the person who will sign the contract.");

    const payload = {
      id: form.id || undefined,
      partnerId: form.partnerId,
      businessName: form.businessName,
      city: buildCityString(form.cityName, form.country, form.state),
      category: form.category,
      address: form.address,
      phone: form.phone,
      website: form.website,
      googleUrl: form.googleUrl,
      description: form.description,
      product: form.product,
      price: form.price === "" ? null : form.price,
      addOns: form.addOns,
      imageUrl: form.imageUrl,
      signerName: form.signerName,
      signerEmail: form.signerEmail,
      signerTitle: form.signerTitle,
      startDate: form.startDate,
      endDate: form.endDate,
      paymentReceived: form.paymentReceived,
    };
    if (isAdmin) {
      payload.contractSigned = form.contractSigned;
      if (form.repCommissionRate !== "") payload.repCommissionRate = form.repCommissionRate;
      if (form.id) {
        payload.status = "approved";
        payload.approveChanges = true;
      }
    }
    setSaving(true);
    try {
      await apiCall("listings", form.id ? "PUT" : "POST", payload, adminKey);
      setNotice(
        isAdmin
          ? "Saved and approved. It goes live on the website once the contract is signed, payment is received and the start date arrives."
          : "Sent for review. An admin will approve it before it can go live."
      );
      cancelEdit();
      await load();
    } catch (e) {
      setError(e.message || "Couldn't save that listing — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function quickUpdate(l, changes, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setError("");
    try {
      await apiCall("listings", "PUT", { id: l.id, ...changes }, adminKey);
      await load();
    } catch (e) {
      setError(e.message || "Couldn't update that listing.");
    }
  }

  async function remove(l, confirmText) {
    if (!window.confirm(confirmText)) return;
    try {
      await apiCall("listings", "DELETE", null, adminKey, `id=${encodeURIComponent(l.id)}`);
      await load();
    } catch (e) {
      setError("Couldn't delete that listing.");
    }
  }

  if (!rateCard) {
    return <p style={{ color: "#F5EFE699" }}>{error || "Loading the rate card..."}</p>;
  }

  const monthly = rateCard.addOns.filter((a) => form.addOns.includes(a.id)).reduce((t, a) => t + a.price, 0);
  const annual = form.price !== "" ? Number(form.price) : product?.price || 0;
  const priceDiffers = product && form.price !== "" && Number(form.price) !== product.price;

  const shown = listings.filter((l) => {
    if (filter === "review") return l.status === "pending" || l.pendingChanges;
    if (filter === "live") return l.live;
    if (filter === "notlive") return !l.live;
    return true;
  });

  const card = { background: "#241640", borderRadius: 14, padding: 20, marginBottom: 16 };
  const sectionTitle = { fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#F5EFE6" };
  const pill = (bg, color) => ({ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: bg, color });
  const smallBtn = { background: "#1B1030", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" };

  return (
    <>
      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1C9C9C" }}>{form.id ? "Edit Website Listing" : "Add Website Listing"}</h2>
        <p style={{ fontSize: 12, color: "#F5EFE699", marginBottom: 14 }}>
          A FunMaps.com profile from the rate card. It shows on the website once an admin approves it, the contract is signed, payment is received and the start date arrives.
        </p>

        <h3 style={sectionTitle}>Business</h3>
        <label htmlFor="wl-partner" style={labelStyle}>LINK TO AN EXISTING COMPASS PARTNER (OPTIONAL — FILLS IN THE DETAILS)</label>
        <select id="wl-partner" value={form.partnerId} onChange={(e) => linkPartner(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }}>
          <option value="">— New business —</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.businessName} · {p.city}
            </option>
          ))}
        </select>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div>
            <label htmlFor="wl-business" style={labelStyle}>BUSINESS NAME *</label>
            <input id="wl-business" value={form.businessName} onChange={(e) => set({ businessName: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="wl-category" style={labelStyle}>CATEGORY *</label>
            <select id="wl-category" value={form.category} onChange={(e) => set({ category: e.target.value })} style={inputStyle}>
              {rateCard.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wl-city" style={labelStyle}>CITY *</label>
            <input id="wl-city" value={form.cityName} onChange={(e) => set({ cityName: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="wl-country" style={labelStyle}>COUNTRY *</label>
            <select id="wl-country" value={form.country} onChange={(e) => set({ country: e.target.value, state: "" })} style={inputStyle}>
              {COUNTRIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          {form.country === "United States" && (
            <div>
              <label htmlFor="wl-state" style={labelStyle}>STATE *</label>
              <select id="wl-state" value={form.state} onChange={(e) => set({ state: e.target.value })} style={inputStyle}>
                <option value="">Select a state...</option>
                {US_STATES.map(([abbr, name]) => (
                  <option key={abbr} value={abbr}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="wl-address" style={labelStyle}>ADDRESS (FOR THE MAP PIN)</label>
            <input id="wl-address" value={form.address} onChange={(e) => set({ address: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="wl-phone" style={labelStyle}>PHONE</label>
            <input id="wl-phone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="wl-website" style={labelStyle}>WEBSITE</label>
            <input id="wl-website" value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="wl-google" style={labelStyle}>GOOGLE BUSINESS LINK (FOR REVIEW STARS)</label>
            <input id="wl-google" value={form.googleUrl} onChange={(e) => set({ googleUrl: e.target.value })} placeholder="https://maps.google.com/..." style={inputStyle} />
          </div>
        </div>

        <h3 style={{ ...sectionTitle, marginTop: 8 }}>Website profile (rate card)</h3>
        <div role="radiogroup" aria-label="Rate card product" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
          {rateCard.products
            .filter((p) => p.active || p.id === form.product)
            .map((p) => {
              const selected = p.id === form.product;
              return (
                <label key={p.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 14, borderRadius: 12, border: `2px solid ${selected ? "#D9662E" : "#F5EFE622"}`, background: selected ? "#2E1F4A" : "transparent", cursor: "pointer" }}>
                  <input type="radio" name="wl-product" checked={selected} onChange={() => set({ product: p.id })} style={{ marginTop: 3, accentColor: "#D9662E" }} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</span>
                    <span style={{ color: "#D9662E", fontWeight: 600, fontSize: 13 }}>
                      {money(p.price)} / {p.period}
                    </span>
                    <span style={{ fontSize: 12, color: "#F5EFE6aa" }}>
                      Shown as "{p.label}" · {p.image.width} × {p.image.height} image · up to {p.descriptionLimit} characters
                    </span>
                  </span>
                </label>
              );
            })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div>
            <label htmlFor="wl-price" style={labelStyle}>PRICE ($ PER YEAR)</label>
            <input id="wl-price" type="number" min={0} value={form.price} onChange={(e) => set({ price: e.target.value })} placeholder={product ? `${product.price} (rate card)` : ""} style={inputStyle} />
            <p style={{ fontSize: 11.5, color: priceDiffers ? "#E8B84B" : "#F5EFE699", marginTop: 4 }}>
              {priceDiffers ? `Differs from the rate card (${money(product.price)}). An admin approves negotiated prices.` : "Leave blank to use the rate card price."}
            </p>
          </div>
        </div>
        <label htmlFor="wl-desc" style={labelStyle}>
          DESCRIPTION · {form.description.length} / {product?.descriptionLimit} CHARACTERS
        </label>
        <textarea id="wl-desc" rows={4} value={form.description} onChange={(e) => set({ description: e.target.value })} style={{ ...inputStyle, resize: "vertical", marginBottom: 4, borderColor: product && form.description.length > product.descriptionLimit ? "#B23A72" : undefined }} />
        {product && form.description.length > product.descriptionLimit && (
          <p style={{ fontSize: 12, color: "#B23A72", marginBottom: 8 }}>{form.description.length - product.descriptionLimit} characters over the limit for this product.</p>
        )}

        <h3 style={{ ...sectionTitle, marginTop: 12 }}>Image</h3>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          {form.imageUrl && <img src={form.imageUrl} alt="Listing preview" style={{ width: product?.image.width === product?.image.height ? 90 : 180, aspectRatio: product ? `${product.image.width} / ${product.image.height}` : "2 / 1", objectFit: "cover", borderRadius: 8 }} />}
          <label style={{ background: "#1B1030", color: "#1C9C9C", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {uploading ? "Uploading..." : form.imageUrl ? "Replace image" : "Choose image"}
            <input type="file" accept="image/*" onChange={handleImageSelect} disabled={uploading} style={{ display: "none" }} />
          </label>
          <span style={{ fontSize: 12, color: "#F5EFE699" }}>
            Required: {product?.image.width} × {product?.image.height} pixels or larger, same shape, under 2 MB.
          </span>
        </div>
        {imageWarning && <p style={{ fontSize: 12, color: "#E8B84B", marginBottom: 8 }}>{imageWarning}</p>}

        <h3 style={{ ...sectionTitle, marginTop: 12 }}>Add-ons</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8, marginBottom: 12 }}>
          {rateCard.addOns
            .filter((a) => a.active || form.addOns.includes(a.id))
            .map((a) => (
              <label key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 10, border: "1px solid #F5EFE622", cursor: "pointer", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={form.addOns.includes(a.id)}
                  onChange={() => set({ addOns: form.addOns.includes(a.id) ? form.addOns.filter((x) => x !== a.id) : [...form.addOns, a.id] })}
                  style={{ accentColor: "#D9662E" }}
                />
                <span style={{ flex: 1 }}>{a.name}</span>
                <span style={{ color: "#F5EFE699", whiteSpace: "nowrap" }}>
                  {money(a.price)} / {a.period === "month" ? "mo" : a.period}
                </span>
              </label>
            ))}
        </div>

        <h3 style={{ ...sectionTitle, marginTop: 12 }}>Contract &amp; payment</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div>
            <label htmlFor="wl-signer" style={labelStyle}>SIGNER NAME *</label>
            <input id="wl-signer" value={form.signerName} onChange={(e) => set({ signerName: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="wl-signer-email" style={labelStyle}>SIGNER EMAIL *</label>
            <input id="wl-signer-email" type="email" value={form.signerEmail} onChange={(e) => set({ signerEmail: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="wl-signer-title" style={labelStyle}>SIGNER TITLE</label>
            <input id="wl-signer-title" value={form.signerTitle} onChange={(e) => set({ signerTitle: e.target.value })} placeholder="Owner, General Manager..." style={inputStyle} />
          </div>
          <div>
            <label htmlFor="wl-start" style={labelStyle}>START DATE</label>
            <input id="wl-start" type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="wl-end" style={labelStyle}>END DATE (BLANK = 1 YEAR)</label>
            <input id="wl-end" type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", borderRadius: 10, border: "1px solid #F5EFE622", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={form.paymentReceived} onChange={(e) => set({ paymentReceived: e.target.checked })} style={{ accentColor: "#D9662E" }} />
            Payment received
          </label>
          {isAdmin && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", borderRadius: 10, border: "1px solid #F5EFE622", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.contractSigned} onChange={(e) => set({ contractSigned: e.target.checked })} style={{ accentColor: "#D9662E" }} />
              Contract signed (admin)
            </label>
          )}
          {isAdmin && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label htmlFor="wl-rep-commission" style={{ ...labelStyle, marginBottom: 0 }}>
                REP COMMISSION %
              </label>
              <input id="wl-rep-commission" type="number" min={0} max={100} value={form.repCommissionRate} onChange={(e) => set({ repCommissionRate: e.target.value })} placeholder={String(rateCard.digitalCommissionRate)} style={{ ...inputStyle, width: 80 }} />
            </div>
          )}
        </div>
        <p style={{ fontSize: 12, color: "#F5EFE699", marginBottom: 14 }}>
          Until DocuSign is connected, an admin marks the contract signed after receiving the signed agreement.
        </p>

        <div style={{ background: "#1B1030", borderRadius: 12, padding: 14, marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, fontSize: 13 }}>
          <div>
            <div style={{ color: "#F5EFE699" }}>Profile</div>
            <div style={{ fontWeight: 700 }}>{money(annual)} / year</div>
          </div>
          <div>
            <div style={{ color: "#F5EFE699" }}>Monthly add-ons</div>
            <div style={{ fontWeight: 700 }}>{money(monthly)} / month</div>
          </div>
          <div>
            <div style={{ color: "#F5EFE699" }}>Rep commission on profile ({commissionRate}%)</div>
            <div style={{ fontWeight: 700, color: "#1C9C9C" }}>{money(Math.round((annual * commissionRate) / 100))}</div>
          </div>
        </div>

        {error && <p role="alert" style={{ color: "#B23A72", fontSize: 13, marginBottom: 10 }}>{error}</p>}
        {notice && <p style={{ color: "#1C9C9C", fontSize: 13, marginBottom: 10 }}>{notice}</p>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={save} disabled={saving || uploading} style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 20px", borderRadius: 8, border: "none", cursor: saving ? "default" : "pointer" }}>
            {saving ? "Saving..." : isAdmin ? (form.id ? (form.status === "pending" ? "Save & Approve" : "Update Listing") : "Add Listing") : form.id ? "Send changes for review" : "Submit for review"}
          </button>
          {form.id && (
            <button onClick={cancelEdit} style={{ background: "transparent", color: "#F5EFE699", border: "1px solid #F5EFE633", padding: "10px 20px", borderRadius: 8, cursor: "pointer" }}>
              Cancel Edit
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <label htmlFor="wl-filter" style={{ ...labelStyle, marginBottom: 0 }}>
          SHOW
        </label>
        <select id="wl-filter" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...inputStyle, maxWidth: 240 }}>
          <option value="all">All listings ({listings.length})</option>
          <option value="review">Waiting for review ({listings.filter((l) => l.status === "pending" || l.pendingChanges).length})</option>
          <option value="live">Live on the website ({listings.filter((l) => l.live).length})</option>
          <option value="notlive">Not live ({listings.filter((l) => !l.live).length})</option>
        </select>
      </div>

      {shown.length === 0 && <p style={{ color: "#F5EFE699" }}>{listings.length === 0 ? "No website listings yet — add one above." : "Nothing matches that filter."}</p>}

      {shown.map((l) => {
        const p = rateCard.products.find((x) => x.id === l.product);
        const reasons = notLiveReasons(l);
        return (
          <div key={l.id} style={{ background: "#241640", borderRadius: 12, padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", opacity: l.active === false ? 0.6 : 1, border: l.status === "pending" ? "1px solid #D9662E60" : "none" }}>
            <div style={{ display: "flex", gap: 12, minWidth: 0, flex: "1 1 420px" }}>
              {l.imageUrl && <img src={l.imageUrl} alt={l.businessName} style={{ width: 80, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{l.businessName}</span>
                  <span style={pill("#F5EFE622", "#F5EFE6")}>{p ? p.name.split(" —")[0].toUpperCase() : l.product}</span>
                  <span style={pill("#D9662E22", "#D9662E")}>{l.category?.toUpperCase()}</span>
                  {l.status === "pending" && <span style={pill("#D9662E", "#1B1030")}>⏳ PENDING REVIEW</span>}
                  {l.pendingChanges && <span style={pill("#E8B84B", "#1B1030")}>CHANGES PENDING REVIEW</span>}
                  {l.live ? <span style={pill("#1C9C9C", "#1B1030")}>LIVE ON WEBSITE</span> : <span style={pill("#B23A7222", "#E58AB5")}>NOT LIVE</span>}
                </div>
                <p style={{ fontSize: 13, color: "#F5EFE6cc" }}>
                  {l.city} · {money(l.price)} / year · {l.startDate} to {l.endDate}
                  {l.addOns?.length ? ` · ${l.addOns.length} add-on${l.addOns.length > 1 ? "s" : ""}` : ""}
                </p>
                <p style={{ fontSize: 12.5, color: "#1C9C9C", marginTop: 4, fontWeight: 600 }}>
                  Contract {l.contractSigned ? "signed ✓" : "not signed"} · Payment {l.paymentReceived ? "received ✓" : "not received"} · Signer: {l.signerName || "—"}
                  {(l.createdByName || l.createdBy) && ` · added by ${l.createdByName || l.createdBy}`}
                </p>
                {!l.live && reasons.length > 0 && <p style={{ fontSize: 12, color: "#F5EFE699", marginTop: 4 }}>Not on the website yet: {reasons.join(", ")}.</p>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignContent: "flex-start", maxWidth: 300 }}>
              {isAdmin && l.status === "pending" && (
                <>
                  <button onClick={() => quickUpdate(l, { status: "approved" })} style={{ ...smallBtn, background: "#1C9C9C", color: "#1B1030", fontWeight: 700 }}>
                    Approve
                  </button>
                  <button onClick={() => remove(l, `Reject and remove "${l.businessName}"? This can't be undone.`)} style={{ ...smallBtn, color: "#B23A72", border: "1px solid #B23A7260" }}>
                    Reject
                  </button>
                </>
              )}
              {isAdmin && l.pendingChanges && (
                <>
                  <button onClick={() => quickUpdate(l, { approveChanges: true })} style={{ ...smallBtn, background: "#1C9C9C", color: "#1B1030", fontWeight: 700 }}>
                    Approve changes
                  </button>
                  <button onClick={() => quickUpdate(l, { rejectChanges: true }, `Discard the proposed changes to "${l.businessName}"? The live listing stays as it is.`)} style={{ ...smallBtn, color: "#B23A72", border: "1px solid #B23A7260" }}>
                    Reject changes
                  </button>
                </>
              )}
              {isAdmin && (
                <button onClick={() => quickUpdate(l, { contractSigned: !l.contractSigned })} style={{ ...smallBtn, color: "#F5EFE6cc" }}>
                  {l.contractSigned ? "Mark contract unsigned" : "Mark contract signed"}
                </button>
              )}
              {isAdmin && (
                <button onClick={() => quickUpdate(l, { paymentReceived: !l.paymentReceived })} style={{ ...smallBtn, color: "#F5EFE6cc" }}>
                  {l.paymentReceived ? "Mark unpaid" : "Mark paid"}
                </button>
              )}
              {isAdmin && (
                <button onClick={() => quickUpdate(l, { active: l.active === false })} style={{ ...smallBtn, color: l.active === false ? "#1C9C9C" : "#F5EFE699" }}>
                  {l.active === false ? "Activate" : "Pause"}
                </button>
              )}
              <button onClick={() => startEdit(l)} style={{ ...smallBtn, color: "#1C9C9C" }}>
                Edit
              </button>
              {isAdmin && (
                <button onClick={() => remove(l, `Delete "${l.businessName}"? This can't be undone.`)} style={{ ...smallBtn, color: "#B23A72" }}>
                  Delete
                </button>
              )}
            </div>
            {l.pendingChanges && <PendingChangesNote rec={l} />}
          </div>
        );
      })}
    </>
  );
}

// ---------- Rate Card (admin only) ----------
// Prices and which products are offered. Changes apply to new listings only;
// existing listings keep the price they were sold at.
export function RateCardPanel({ adminKey, inputStyle, labelStyle }) {
  const [card, setCard] = useState(null);
  const [edits, setEdits] = useState({ products: {}, addOns: {}, digitalCommissionRate: undefined });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await apiCall("rate-card", "GET", null, adminKey, "");
      setCard(data.rateCard);
      setEdits({ products: {}, addOns: {}, digitalCommissionRate: undefined });
    } catch (e) {
      setMessage("Couldn't load the rate card.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function edit(kind, id, change) {
    setEdits((e) => ({ ...e, [kind]: { ...e[kind], [id]: { ...(e[kind][id] || {}), ...change } } }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const data = await apiCall("rate-card", "PUT", edits, adminKey);
      setCard(data.rateCard);
      setEdits({ products: {}, addOns: {}, digitalCommissionRate: undefined });
      setMessage("Rate card saved. New listings use these prices; existing listings keep theirs.");
    } catch (e) {
      setMessage(e.message || "Couldn't save the rate card.");
    } finally {
      setSaving(false);
    }
  }

  if (!card) return <p style={{ color: "#F5EFE699" }}>{message || "Loading the rate card..."}</p>;

  const row = (kind, item) => {
    const e = edits[kind][item.id] || {};
    const active = e.active !== undefined ? e.active : item.active;
    return (
      <div key={item.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "12px 0", borderTop: "1px solid #F5EFE61a", opacity: active ? 1 : 0.6 }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name}</div>
          {item.includes && <div style={{ fontSize: 12, color: "#F5EFE699" }}>{item.includes}</div>}
        </div>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          $
          <input
            type="number"
            min={0}
            aria-label={`Price for ${item.name}`}
            value={e.price !== undefined ? e.price : item.price}
            onChange={(ev) => edit(kind, item.id, { price: ev.target.value })}
            style={{ ...inputStyle, width: 110 }}
          />
          / {item.period === "month" ? "mo" : "yr"}
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={active} onChange={(ev) => edit(kind, item.id, { active: ev.target.checked })} style={{ accentColor: "#D9662E" }} />
          Offered
        </label>
      </div>
    );
  };

  return (
    <div style={{ background: "#241640", borderRadius: 14, padding: 20, marginBottom: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1C9C9C" }}>Rate Card</h2>
      <p style={{ fontSize: 12, color: "#F5EFE699", marginBottom: 10 }}>
        Prices reps see when adding website listings. Changes apply to new listings only; existing listings keep the price they were sold at.
        {card.updatedBy && ` Last changed by ${card.updatedBy}${card.updatedAt ? ` on ${new Date(card.updatedAt).toLocaleDateString()}` : ""}.`}
      </p>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: "#D9662E" }}>Website profiles (per year)</h3>
      {card.products.map((p) => row("products", p))}
      <h3 style={{ fontSize: 13, fontWeight: 700, marginTop: 16, color: "#D9662E" }}>Add-ons (per month)</h3>
      {card.addOns.map((a) => row("addOns", a))}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
        <label htmlFor="rc-commission" style={{ ...labelStyle, marginBottom: 0 }}>
          DEFAULT REP COMMISSION ON DIGITAL SALES (%)
        </label>
        <input
          id="rc-commission"
          type="number"
          min={0}
          max={100}
          value={edits.digitalCommissionRate !== undefined ? edits.digitalCommissionRate : card.digitalCommissionRate}
          onChange={(e) => setEdits((x) => ({ ...x, digitalCommissionRate: e.target.value }))}
          style={{ ...inputStyle, width: 90 }}
        />
      </div>
      {message && <p style={{ fontSize: 13, color: message.startsWith("Rate card saved") ? "#1C9C9C" : "#B23A72", marginTop: 12 }}>{message}</p>}
      <button onClick={save} disabled={saving} style={{ marginTop: 14, background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 20px", borderRadius: 8, border: "none", cursor: saving ? "default" : "pointer" }}>
        {saving ? "Saving..." : "Save rate card"}
      </button>
    </div>
  );
}
