import { useState, useEffect } from "react";

const CATEGORIES = ["Accommodations", "Arts&Entertainment", "Attractions", "Bars&Clubs", "Events", "Resources", "Restaurants", "Shopping&Services", "Weddings"];
const ADMIN_KEY_STORAGE = "compass-admin-key";

async function apiCall(endpoint, method, body, adminKey, query) {
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

const emptyPartnerForm = {
  id: null,
  city: "",
  businessName: "",
  category: "Attractions",
  tier: "basic",
  tagline: "",
  address: "",
  phone: "",
  imageUrl: "",
  ctaText: "Learn More",
  ctaLink: "",
  bookingLink: "",
  promoCode: "",
  promoIncentive: "",
  commissionRate: 15,
};

const emptySponsorshipForm = { id: null, city: "", businessName: "", tagline: "", imageUrl: "", ctaText: "Learn More", ctaLink: "", annualPrice: 3000, startDate: "", endDate: "" };

export default function AdminPanel() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) || "");
  const [keyInput, setKeyInput] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState("partners"); // "partners" | "sponsorships"

  // Partners (commission-based, Basic/Premium tiers)
  const [partners, setPartners] = useState([]);
  const [partnerForm, setPartnerForm] = useState(emptyPartnerForm);
  const [partnerSaving, setPartnerSaving] = useState(false);
  const [partnerError, setPartnerError] = useState("");
  const [partnerFilterCity, setPartnerFilterCity] = useState("");
  const [uploadingPartnerImage, setUploadingPartnerImage] = useState(false);

  // Sponsorships (flat annual fee, rotates per city)
  const [sponsorships, setSponsorships] = useState([]);
  const [sponsorshipForm, setSponsorshipForm] = useState(emptySponsorshipForm);
  const [sponsorshipSaving, setSponsorshipSaving] = useState(false);
  const [sponsorshipError, setSponsorshipError] = useState("");
  const [sponsorshipFilterCity, setSponsorshipFilterCity] = useState("");
  const [uploadingSponsorshipImage, setUploadingSponsorshipImage] = useState(false);

  useEffect(() => {
    if (adminKey) tryUnlock(adminKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryUnlock(key) {
    setAuthError("");
    try {
      await apiCall("banners", "GET", null, key, "");
      setAdminKey(key);
      sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
      setUnlocked(true);
    } catch (e) {
      setAuthError("Couldn't connect — check your connection and try again.");
    }
  }

  function logOut() {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey("");
    setUnlocked(false);
    setKeyInput("");
  }

  // ---------- Partners ----------

  async function loadPartners() {
    try {
      const data = await apiCall("banners", "GET", null, adminKey, partnerFilterCity ? `city=${encodeURIComponent(partnerFilterCity)}` : "");
      setPartners(data.banners || []);
    } catch (e) {
      setPartnerError("Couldn't load partners.");
    }
  }

  useEffect(() => {
    if (unlocked && activeTab === "partners") loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, activeTab, partnerFilterCity]);

  async function handlePartnerImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPartnerError("Please choose an image file.");
      return;
    }
    setUploadingPartnerImage(true);
    setPartnerError("");
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/upload-venue-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ imageDataUrl: dataUrl, filename: file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setPartnerForm((f) => ({ ...f, imageUrl: data.url }));
    } catch (err) {
      setPartnerError(err.message || "Image upload failed — try a smaller image.");
    } finally {
      setUploadingPartnerImage(false);
    }
  }

  async function handlePartnerSave() {
    if (!partnerForm.city.trim() || !partnerForm.businessName.trim()) {
      setPartnerError("City and business name are required.");
      return;
    }
    if (partnerForm.tier === "premium" && !partnerForm.imageUrl) {
      setPartnerError("Recommended Partner (Premium) requires an uploaded image or logo.");
      return;
    }
    setPartnerSaving(true);
    setPartnerError("");
    try {
      if (partnerForm.id) {
        await apiCall("banners", "PUT", partnerForm, adminKey);
      } else {
        await apiCall("banners", "POST", partnerForm, adminKey);
      }
      setPartnerForm(emptyPartnerForm);
      await loadPartners();
    } catch (e) {
      if (e.message.includes("Invalid admin key")) {
        setPartnerError("Your admin key was rejected — click Log Out and re-enter it.");
      } else {
        setPartnerError("Couldn't save that partner — try again.");
      }
    } finally {
      setPartnerSaving(false);
    }
  }

  async function handlePartnerDelete(id) {
    if (!window.confirm("Remove this partner?")) return;
    try {
      await apiCall("banners", "DELETE", null, adminKey, `id=${encodeURIComponent(id)}`);
      await loadPartners();
    } catch (e) {
      setPartnerError("Couldn't delete that partner.");
    }
  }

  async function togglePartnerActive(p) {
    try {
      await apiCall("banners", "PUT", { id: p.id, active: !p.active }, adminKey);
      await loadPartners();
    } catch (e) {
      setPartnerError("Couldn't update that partner.");
    }
  }

  function startPartnerEdit(p) {
    setPartnerForm({
      id: p.id,
      city: p.city,
      businessName: p.businessName,
      category: p.category,
      tier: p.tier || "basic",
      tagline: p.tagline || "",
      address: p.address || "",
      phone: p.phone || "",
      imageUrl: p.imageUrl || "",
      ctaText: p.ctaText || "Learn More",
      ctaLink: p.ctaLink || "",
      bookingLink: p.bookingLink || "",
      promoCode: p.promoCode || "",
      promoIncentive: p.promoIncentive || "",
      commissionRate: p.commissionRate || 15,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- Sponsorships ----------

  async function loadSponsorships() {
    try {
      const data = await apiCall("sponsorships", "GET", null, adminKey, sponsorshipFilterCity ? `city=${encodeURIComponent(sponsorshipFilterCity)}` : "");
      setSponsorships(data.sponsorships || []);
    } catch (e) {
      setSponsorshipError("Couldn't load sponsorships.");
    }
  }

  useEffect(() => {
    if (unlocked && activeTab === "sponsorships") loadSponsorships();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, activeTab, sponsorshipFilterCity]);

  async function handleSponsorshipImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSponsorshipError("Please choose an image file.");
      return;
    }
    setUploadingSponsorshipImage(true);
    setSponsorshipError("");
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/upload-venue-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ imageDataUrl: dataUrl, filename: file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setSponsorshipForm((f) => ({ ...f, imageUrl: data.url }));
    } catch (err) {
      setSponsorshipError(err.message || "Image upload failed — try a smaller image.");
    } finally {
      setUploadingSponsorshipImage(false);
    }
  }

  async function handleSponsorshipSave() {
    if (!sponsorshipForm.city.trim() || !sponsorshipForm.businessName.trim() || !sponsorshipForm.imageUrl) {
      setSponsorshipError("City, business name, and an uploaded image are all required.");
      return;
    }
    setSponsorshipSaving(true);
    setSponsorshipError("");
    try {
      if (sponsorshipForm.id) {
        await apiCall("sponsorships", "PUT", sponsorshipForm, adminKey);
      } else {
        await apiCall("sponsorships", "POST", sponsorshipForm, adminKey);
      }
      setSponsorshipForm(emptySponsorshipForm);
      await loadSponsorships();
    } catch (e) {
      if (e.message.includes("Invalid admin key")) {
        setSponsorshipError("Your admin key was rejected — click Log Out and re-enter it.");
      } else {
        setSponsorshipError("Couldn't save that sponsorship — try again.");
      }
    } finally {
      setSponsorshipSaving(false);
    }
  }

  async function handleSponsorshipDelete(id) {
    if (!window.confirm("Remove this sponsorship?")) return;
    try {
      await apiCall("sponsorships", "DELETE", null, adminKey, `id=${encodeURIComponent(id)}`);
      await loadSponsorships();
    } catch (e) {
      setSponsorshipError("Couldn't delete that sponsorship.");
    }
  }

  async function toggleSponsorshipActive(s) {
    try {
      await apiCall("sponsorships", "PUT", { id: s.id, active: !s.active }, adminKey);
      await loadSponsorships();
    } catch (e) {
      setSponsorshipError("Couldn't update that sponsorship.");
    }
  }

  function startSponsorshipEdit(s) {
    setSponsorshipForm({
      id: s.id,
      city: s.city,
      businessName: s.businessName,
      tagline: s.tagline || "",
      imageUrl: s.imageUrl || "",
      ctaText: s.ctaText || "Learn More",
      ctaLink: s.ctaLink || "",
      annualPrice: s.annualPrice || 3000,
      startDate: s.startDate || "",
      endDate: s.endDate || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const inputStyle = { width: "100%", background: "#C9AEC7", border: "1px solid #1B103015", borderRadius: 8, padding: "9px 12px", outline: "none", color: "#1B1030", fontSize: 14 };
  const labelStyle = { fontSize: 11.5, color: "#D9662E", fontWeight: 600, display: "block", marginBottom: 4 };

  if (!unlocked) {
    return (
      <div style={{ background: "#1B1030", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", padding: 24 }}>
        <div style={{ background: "#241640", borderRadius: 16, padding: 32, maxWidth: 360, width: "100%" }}>
          <h1 style={{ color: "#F5EFE6", fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Compass Admin</h1>
          <label style={labelStyle}>ADMIN PASSWORD</label>
          <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tryUnlock(keyInput)} style={inputStyle} />
          {authError && <p style={{ color: "#B23A72", fontSize: 13, marginTop: 8 }}>{authError}</p>}
          <button onClick={() => tryUnlock(keyInput)} style={{ width: "100%", marginTop: 16, background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer" }}>
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#1B1030", minHeight: "100vh", fontFamily: "Inter, sans-serif", color: "#F5EFE6", padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Compass Partners Admin</h1>
          <button onClick={logOut} style={{ background: "#241640", color: "#F5EFE6", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>
            Log Out
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => setActiveTab("partners")}
            style={{ background: activeTab === "partners" ? "#D9662E" : "#241640", color: activeTab === "partners" ? "#1B1030" : "#F5EFE699", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Partners (Commission)
          </button>
          <button
            onClick={() => setActiveTab("sponsorships")}
            style={{ background: activeTab === "sponsorships" ? "#D9662E" : "#241640", color: activeTab === "sponsorships" ? "#1B1030" : "#F5EFE699", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Sponsorships (Flat Fee)
          </button>
        </div>

        {activeTab === "partners" && (
          <>
            <div style={{ background: "#241640", borderRadius: 14, padding: 20, marginBottom: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1C9C9C" }}>{partnerForm.id ? "Edit Partner" : "Add New Partner"}</h2>
              <p style={{ fontSize: 12, color: "#F5EFE699", marginBottom: 14 }}>
                Commission-based. Tier controls the <strong>visual style</strong> only — <strong>Recommended Partner (Premium)</strong> gets a white border and image/logo shown first. The commission rate below is fully independent — set it to whatever you actually negotiate with each partner (15% and 22% are just common starting points, not fixed values).
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>CITY *</label>
                  <input value={partnerForm.city} onChange={(e) => setPartnerForm({ ...partnerForm, city: e.target.value })} placeholder="e.g. Miami" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>BUSINESS NAME *</label>
                  <input value={partnerForm.businessName} onChange={(e) => setPartnerForm({ ...partnerForm, businessName: e.target.value })} placeholder="e.g. Club Neon" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>TIER (controls visual style — border, image layout, badge — not pricing)</label>
                  <select
                    value={partnerForm.tier}
                    onChange={(e) => setPartnerForm({ ...partnerForm, tier: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="basic">Featured Partner (Basic display)</option>
                    <option value="premium">Recommended Partner (Premium display — white border, image first)</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>CATEGORY (determines placement)</label>
                  <select value={partnerForm.category} onChange={(e) => setPartnerForm({ ...partnerForm, category: e.target.value })} style={inputStyle}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c === "Accommodations" ? "Accommodations (shown near booking button)" : c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>ADDRESS</label>
                  <input value={partnerForm.address} onChange={(e) => setPartnerForm({ ...partnerForm, address: e.target.value })} placeholder="Street address" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>PHONE NUMBER</label>
                  <input value={partnerForm.phone} onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })} placeholder="(555) 123-4567" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>WEBSITE</label>
                  <input value={partnerForm.ctaLink} onChange={(e) => setPartnerForm({ ...partnerForm, ctaLink: e.target.value })} placeholder="https://..." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>CTA BUTTON TEXT</label>
                  <input value={partnerForm.ctaText} onChange={(e) => setPartnerForm({ ...partnerForm, ctaText: e.target.value })} placeholder="e.g. Reserve Now" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>BOOKING LINK (optional — OpenTable, Resy, Eventbrite, etc.)</label>
                  <input value={partnerForm.bookingLink} onChange={(e) => setPartnerForm({ ...partnerForm, bookingLink: e.target.value })} placeholder="https://..." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>PROMO CODE</label>
                  <input value={partnerForm.promoCode} onChange={(e) => setPartnerForm({ ...partnerForm, promoCode: e.target.value })} placeholder="e.g. COMPASSMIA15" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>COMMISSION RATE (%) — set whatever you negotiated with this partner</label>
                  <input type="number" value={partnerForm.commissionRate} onChange={(e) => setPartnerForm({ ...partnerForm, commissionRate: Number(e.target.value) })} style={inputStyle} />
                </div>
              </div>

              <label style={labelStyle}>DESCRIPTION / TAGLINE</label>
              <textarea value={partnerForm.tagline} onChange={(e) => setPartnerForm({ ...partnerForm, tagline: e.target.value })} rows={2} style={{ ...inputStyle, resize: "none", marginBottom: 12 }} />

              <label style={labelStyle}>PROMO INCENTIVE — the actual reason to use the code (e.g. "15% off your bill" or "Free appetizer with any entrée")</label>
              <input
                value={partnerForm.promoIncentive}
                onChange={(e) => setPartnerForm({ ...partnerForm, promoIncentive: e.target.value })}
                placeholder="What does the traveler actually get?"
                style={{ ...inputStyle, marginBottom: 14 }}
              />

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>{partnerForm.tier === "premium" ? "IMAGE / LOGO *" : "IMAGE / LOGO (optional for Basic)"}</label>
                {partnerForm.imageUrl && (
                  <div style={{ marginBottom: 8 }}>
                    <img src={partnerForm.imageUrl} alt="Partner" style={{ width: 160, height: 90, objectFit: "cover", borderRadius: 8 }} />
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handlePartnerImageSelect} disabled={uploadingPartnerImage} style={{ fontSize: 13, color: "#F5EFE6" }} />
                {uploadingPartnerImage && <p style={{ fontSize: 12, color: "#1C9C9C", marginTop: 4 }}>Uploading...</p>}
              </div>

              {partnerError && <p style={{ color: "#B23A72", fontSize: 13, marginBottom: 10 }}>{partnerError}</p>}

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handlePartnerSave}
                  disabled={partnerSaving}
                  style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 20px", borderRadius: 8, border: "none", cursor: partnerSaving ? "default" : "pointer" }}
                >
                  {partnerSaving ? "Saving..." : partnerForm.id ? "Update Partner" : "Add Partner"}
                </button>
                {partnerForm.id && (
                  <button
                    onClick={() => setPartnerForm(emptyPartnerForm)}
                    style={{ background: "transparent", color: "#F5EFE699", border: "1px solid #F5EFE633", padding: "10px 20px", borderRadius: 8, cursor: "pointer" }}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <input value={partnerFilterCity} onChange={(e) => setPartnerFilterCity(e.target.value)} placeholder="Filter by city..." style={{ ...inputStyle, maxWidth: 300 }} />
            </div>

            {partners.length === 0 && <p style={{ color: "#F5EFE699" }}>No partners yet — add one above.</p>}

            {partners.map((p) => (
              <div key={p.id} style={{ background: "#241640", borderRadius: 12, padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, opacity: p.active === false ? 0.5 : 1 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  {p.imageUrl && <img src={p.imageUrl} alt={p.businessName} style={{ width: 70, height: 52, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{p.businessName}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: p.tier === "premium" ? "#F5EFE622" : "#1C9C9C22", color: p.tier === "premium" ? "#F5EFE6" : "#1C9C9C" }}>
                        {p.tier === "premium" ? "RECOMMENDED (PREMIUM)" : "FEATURED (BASIC)"}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#D9662E22", color: "#D9662E" }}>{p.category?.toUpperCase()}</span>
                      {p.active === false && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A7222", color: "#B23A72" }}>PAUSED</span>}
                    </div>
                    <p style={{ fontSize: 13, color: "#F5EFE6cc" }}>
                      {p.city} {p.address && `· ${p.address}`} {p.phone && `· ${p.phone}`}
                    </p>
                    <p style={{ fontSize: 12.5, color: "#1C9C9C", marginTop: 4, fontWeight: 600 }}>
                      {p.commissionRate}% commission · {p.promoCode && `Code: ${p.promoCode} · `}
                      {p.clicks || 0} clicks
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => togglePartnerActive(p)} style={{ background: "#1B1030", color: p.active === false ? "#1C9C9C" : "#F5EFE699", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                    {p.active === false ? "Activate" : "Pause"}
                  </button>
                  <button onClick={() => startPartnerEdit(p)} style={{ background: "#1B1030", color: "#1C9C9C", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                    Edit
                  </button>
                  <button onClick={() => handlePartnerDelete(p.id)} style={{ background: "#1B1030", color: "#B23A72", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === "sponsorships" && (
          <>
            <div style={{ background: "#241640", borderRadius: 14, padding: 20, marginBottom: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1C9C9C" }}>{sponsorshipForm.id ? "Edit Sponsorship" : "Add New Sponsorship"}</h2>
              <p style={{ fontSize: 12, color: "#F5EFE699", marginBottom: 14 }}>
                Flat annual fee, destination-specific. If a city has more than one sponsor, the banner rotates between them each time someone plans a trip there.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>CITY *</label>
                  <input value={sponsorshipForm.city} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, city: e.target.value })} placeholder="e.g. Miami" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>BUSINESS NAME *</label>
                  <input value={sponsorshipForm.businessName} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, businessName: e.target.value })} placeholder="e.g. Grand Resort Miami" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>TAGLINE</label>
                  <input value={sponsorshipForm.tagline} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, tagline: e.target.value })} placeholder="Short promotional line" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>ANNUAL PRICE ($)</label>
                  <input type="number" value={sponsorshipForm.annualPrice} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, annualPrice: Number(e.target.value) })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>CTA BUTTON TEXT</label>
                  <input value={sponsorshipForm.ctaText} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, ctaText: e.target.value })} placeholder="e.g. Book Now" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>CTA LINK</label>
                  <input value={sponsorshipForm.ctaLink} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, ctaLink: e.target.value })} placeholder="https://..." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>SPONSORSHIP START DATE</label>
                  <input type="date" value={sponsorshipForm.startDate} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, startDate: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>SPONSORSHIP END DATE</label>
                  <input type="date" value={sponsorshipForm.endDate} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, endDate: e.target.value })} style={inputStyle} />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>SPONSOR IMAGE *</label>
                {sponsorshipForm.imageUrl && (
                  <div style={{ marginBottom: 8 }}>
                    <img src={sponsorshipForm.imageUrl} alt="Sponsor" style={{ width: 200, height: 100, objectFit: "cover", borderRadius: 8 }} />
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handleSponsorshipImageSelect} disabled={uploadingSponsorshipImage} style={{ fontSize: 13, color: "#F5EFE6" }} />
                {uploadingSponsorshipImage && <p style={{ fontSize: 12, color: "#1C9C9C", marginTop: 4 }}>Uploading...</p>}
              </div>

              {sponsorshipError && <p style={{ color: "#B23A72", fontSize: 13, marginBottom: 10 }}>{sponsorshipError}</p>}

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handleSponsorshipSave}
                  disabled={sponsorshipSaving}
                  style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 20px", borderRadius: 8, border: "none", cursor: sponsorshipSaving ? "default" : "pointer" }}
                >
                  {sponsorshipSaving ? "Saving..." : sponsorshipForm.id ? "Update Sponsorship" : "Add Sponsorship"}
                </button>
                {sponsorshipForm.id && (
                  <button
                    onClick={() => setSponsorshipForm(emptySponsorshipForm)}
                    style={{ background: "transparent", color: "#F5EFE699", border: "1px solid #F5EFE633", padding: "10px 20px", borderRadius: 8, cursor: "pointer" }}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <input value={sponsorshipFilterCity} onChange={(e) => setSponsorshipFilterCity(e.target.value)} placeholder="Filter by city..." style={{ ...inputStyle, maxWidth: 300 }} />
            </div>

            {sponsorships.length === 0 && <p style={{ color: "#F5EFE699" }}>No sponsorships yet — add one above.</p>}

            {(() => {
              const cityCounts = {};
              sponsorships.forEach((s) => {
                const key = s.city.toLowerCase().trim();
                cityCounts[key] = (cityCounts[key] || 0) + 1;
              });
              return sponsorships.map((s) => {
                const rotating = cityCounts[s.city.toLowerCase().trim()] > 1;
                return (
                  <div key={s.id} style={{ background: "#241640", borderRadius: 12, padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, opacity: s.active === false ? 0.5 : 1 }}>
                    <div style={{ display: "flex", gap: 12 }}>
                      {s.imageUrl && <img src={s.imageUrl} alt={s.businessName} style={{ width: 90, height: 60, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{s.businessName}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#F5EFE622", color: "#F5EFE6" }}>${s.annualPrice || 3000}/YR</span>
                          {rotating && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#D9662E22", color: "#D9662E" }}>ROTATING</span>}
                          {s.active === false && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A7222", color: "#B23A72" }}>PAUSED</span>}
                        </div>
                        <p style={{ fontSize: 13, color: "#F5EFE6cc" }}>
                          {s.city} {s.startDate && s.endDate && `· ${s.startDate} to ${s.endDate}`}
                        </p>
                        <p style={{ fontSize: 12.5, color: "#1C9C9C", marginTop: 4, fontWeight: 600 }}>{s.clicks || 0} clicks</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => toggleSponsorshipActive(s)} style={{ background: "#1B1030", color: s.active === false ? "#1C9C9C" : "#F5EFE699", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                        {s.active === false ? "Activate" : "Pause"}
                      </button>
                      <button onClick={() => startSponsorshipEdit(s)} style={{ background: "#1B1030", color: "#1C9C9C", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                        Edit
                      </button>
                      <button onClick={() => handleSponsorshipDelete(s.id)} style={{ background: "#1B1030", color: "#B23A72", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </>
        )}
      </div>
    </div>
  );
}
