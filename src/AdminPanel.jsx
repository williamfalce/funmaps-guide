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

const emptyForm = { id: null, city: "", name: "", category: "culture", tier: "standard", address: "", phone: "", website: "", note: "", imageUrl: "" };
const emptyBannerForm = { id: null, city: "", businessName: "", category: "nightlife", tagline: "", imageUrl: "", ctaText: "Learn More", ctaLink: "", promoCode: "", commissionRate: 15 };

export default function AdminPanel() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) || "");
  const [keyInput, setKeyInput] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [authError, setAuthError] = useState("");

  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [activeTab, setActiveTab] = useState("venues"); // "venues" | "banners"
  const [banners, setBanners] = useState([]);
  const [bannerForm, setBannerForm] = useState(emptyBannerForm);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerError, setBannerError] = useState("");
  const [bannerFilterCity, setBannerFilterCity] = useState("");
  const [uploadingBannerImage, setUploadingBannerImage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  async function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setUploadingImage(true);
    setError("");
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
      setForm((f) => ({ ...f, imageUrl: data.url }));
    } catch (err) {
      setError(err.message || "Image upload failed — try a smaller image.");
    } finally {
      setUploadingImage(false);
    }
  }

  useEffect(() => {
    if (adminKey) tryUnlock(adminKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryUnlock(key) {
    setAuthError("");
    try {
      // A GET is unauthenticated, so we verify the key with a harmless PUT-like check instead:
      // simplest reliable check is just trying to load venues (always works) then confirm
      // the key by attempting a no-op-ish call. Since GET doesn't need auth, we just trust
      // the key here and let the first real write action reveal if it's wrong.
      await loadVenues();
      setAdminKey(key);
      sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
      setUnlocked(true);
    } catch (e) {
      setAuthError("Couldn't load venues — check your connection and try again.");
    }
  }

  async function loadVenues() {
    setLoading(true);
    try {
      const data = await apiCall("venues", "GET", null, null, filterCity ? `city=${encodeURIComponent(filterCity)}` : "");
      setVenues(data.venues || []);
    } catch (e) {
      setError("Couldn't load venues.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (unlocked) loadVenues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, filterCity]);

  async function handleSave() {
    if (!form.city.trim() || !form.name.trim()) {
      setError("City and name are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (form.id) {
        await apiCall("venues", "PUT", form, adminKey);
      } else {
        await apiCall("venues", "POST", form, adminKey);
      }
      setForm(emptyForm);
      await loadVenues();
    } catch (e) {
      if (e.message.includes("Invalid admin key")) {
        setError("Your admin key was rejected — click Log Out and re-enter it.");
      } else {
        setError("Couldn't save that venue — try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Remove this venue?")) return;
    try {
      await apiCall("venues", "DELETE", null, adminKey, `id=${encodeURIComponent(id)}`);
      await loadVenues();
    } catch (e) {
      setError("Couldn't delete that venue.");
    }
  }

  function startEdit(v) {
    setForm({ id: v.id, city: v.city, name: v.name, category: v.category, tier: v.tier, address: v.address || "", phone: v.phone || "", website: v.website || "", note: v.note || "", imageUrl: v.imageUrl || "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadBanners() {
    try {
      const data = await apiCall("banners", "GET", null, adminKey, bannerFilterCity ? `city=${encodeURIComponent(bannerFilterCity)}` : "");
      setBanners(data.banners || []);
    } catch (e) {
      setBannerError("Couldn't load banners.");
    }
  }

  useEffect(() => {
    if (unlocked && activeTab === "banners") loadBanners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, activeTab, bannerFilterCity]);

  async function handleBannerImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setBannerError("Please choose an image file.");
      return;
    }
    setUploadingBannerImage(true);
    setBannerError("");
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
      setBannerForm((f) => ({ ...f, imageUrl: data.url }));
    } catch (err) {
      setBannerError(err.message || "Image upload failed — try a smaller image.");
    } finally {
      setUploadingBannerImage(false);
    }
  }

  async function handleBannerSave() {
    if (!bannerForm.city.trim() || !bannerForm.businessName.trim() || !bannerForm.imageUrl) {
      setBannerError("City, business name, and an uploaded image are all required.");
      return;
    }
    setBannerSaving(true);
    setBannerError("");
    try {
      if (bannerForm.id) {
        await apiCall("banners", "PUT", bannerForm, adminKey);
      } else {
        await apiCall("banners", "POST", bannerForm, adminKey);
      }
      setBannerForm(emptyBannerForm);
      await loadBanners();
    } catch (e) {
      if (e.message.includes("Invalid admin key")) {
        setBannerError("Your admin key was rejected — click Log Out and re-enter it.");
      } else {
        setBannerError("Couldn't save that banner — try again.");
      }
    } finally {
      setBannerSaving(false);
    }
  }

  async function handleBannerDelete(id) {
    if (!window.confirm("Remove this banner ad?")) return;
    try {
      await apiCall("banners", "DELETE", null, adminKey, `id=${encodeURIComponent(id)}`);
      await loadBanners();
    } catch (e) {
      setBannerError("Couldn't delete that banner.");
    }
  }

  async function toggleBannerActive(b) {
    try {
      await apiCall("banners", "PUT", { id: b.id, active: !b.active }, adminKey);
      await loadBanners();
    } catch (e) {
      setBannerError("Couldn't update that banner.");
    }
  }

  function startBannerEdit(b) {
    setBannerForm({
      id: b.id,
      city: b.city,
      businessName: b.businessName,
      category: b.category,
      tagline: b.tagline || "",
      imageUrl: b.imageUrl || "",
      ctaText: b.ctaText || "Learn More",
      ctaLink: b.ctaLink || "",
      promoCode: b.promoCode || "",
      commissionRate: b.commissionRate || 15,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function logOut() {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey("");
    setUnlocked(false);
    setKeyInput("");
  }

  const inputStyle = { width: "100%", background: "#C9AEC7", border: "1px solid #1B103015", borderRadius: 8, padding: "9px 12px", outline: "none", color: "#1B1030", fontSize: 14 };
  const labelStyle = { fontSize: 11.5, color: "#D9662E", fontWeight: 600, display: "block", marginBottom: 4 };

  if (!unlocked) {
    return (
      <div style={{ background: "#1B1030", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", padding: 24 }}>
        <div style={{ background: "#241640", borderRadius: 16, padding: 32, maxWidth: 360, width: "100%" }}>
          <h1 style={{ color: "#F5EFE6", fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Compass Admin</h1>
          <label style={labelStyle}>ADMIN PASSWORD</label>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryUnlock(keyInput)}
            style={inputStyle}
          />
          {authError && <p style={{ color: "#B23A72", fontSize: 13, marginTop: 8 }}>{authError}</p>}
          <button
            onClick={() => tryUnlock(keyInput)}
            style={{ width: "100%", marginTop: 16, background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer" }}
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#1B1030", minHeight: "100vh", fontFamily: "Inter, sans-serif", color: "#F5EFE6", padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="flex items-center justify-between" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Compass Partners Admin</h1>
          <button onClick={logOut} style={{ background: "#241640", color: "#F5EFE6", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>
            Log Out
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => setActiveTab("venues")}
            style={{
              background: activeTab === "venues" ? "#D9662E" : "#241640",
              color: activeTab === "venues" ? "#1B1030" : "#F5EFE699",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Featured Partners
          </button>
          <button
            onClick={() => setActiveTab("banners")}
            style={{
              background: activeTab === "banners" ? "#D9662E" : "#241640",
              color: activeTab === "banners" ? "#1B1030" : "#F5EFE699",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Banner Ads
          </button>
        </div>

        {activeTab === "venues" && (
        <>
        {/* Add / Edit form */}
        <div style={{ background: "#241640", borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: "#1C9C9C" }}>{form.id ? "Edit Venue" : "Add New Venue"}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>CITY *</label>
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Miami" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>VENUE NAME *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Abracadabra NYC" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>CATEGORY</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>TIER</label>
              <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} style={inputStyle}>
                <option value="standard">Standard</option>
                <option value="premium">Premium (top billing)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>ADDRESS</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>PHONE NUMBER</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>WEBSITE</label>
              <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." style={inputStyle} />
            </div>
          </div>
          <label style={labelStyle}>NOTE / DESCRIPTION</label>
          <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} style={{ ...inputStyle, resize: "none", marginBottom: 14 }} />

          {form.tier === "premium" && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>VENUE PHOTO (Premium perk)</label>
              {form.imageUrl && (
                <div style={{ marginBottom: 8 }}>
                  <img src={form.imageUrl} alt="Venue" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8 }} />
                </div>
              )}
              <input type="file" accept="image/*" onChange={handleImageSelect} disabled={uploadingImage} style={{ fontSize: 13, color: "#F5EFE6" }} />
              {uploadingImage && <p style={{ fontSize: 12, color: "#1C9C9C", marginTop: 4 }}>Uploading...</p>}
            </div>
          )}

          {error && <p style={{ color: "#B23A72", fontSize: 13, marginBottom: 10 }}>{error}</p>}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 20px", borderRadius: 8, border: "none", cursor: saving ? "default" : "pointer" }}
            >
              {saving ? "Saving..." : form.id ? "Update Venue" : "Add Venue"}
            </button>
            {form.id && (
              <button
                onClick={() => setForm(emptyForm)}
                style={{ background: "transparent", color: "#F5EFE699", border: "1px solid #F5EFE633", padding: "10px 20px", borderRadius: 8, cursor: "pointer" }}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </div>

        {/* Filter + list */}
        <div style={{ marginBottom: 12 }}>
          <input
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            placeholder="Filter by city..."
            style={{ ...inputStyle, maxWidth: 300 }}
          />
        </div>

        {loading && <p style={{ color: "#F5EFE699" }}>Loading...</p>}
        {!loading && venues.length === 0 && <p style={{ color: "#F5EFE699" }}>No venues yet — add one above.</p>}

        {venues.map((v) => (
          <div key={v.id} style={{ background: "#241640", borderRadius: 12, padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{v.name}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: v.tier === "premium" ? "#D9662E22" : "#1C9C9C22",
                    color: v.tier === "premium" ? "#D9662E" : "#1C9C9C",
                  }}
                >
                  {v.tier === "premium" ? "PREMIUM" : "STANDARD"}
                </span>
                <span style={{ fontSize: 11, color: "#F5EFE699" }}>{v.category}</span>
              </div>
              <p style={{ fontSize: 13, color: "#F5EFE6cc" }}>
                {v.city} {v.address && `· ${v.address}`} {v.phone && `· ${v.phone}`}
              </p>
              {v.note && <p style={{ fontSize: 12.5, color: "#F5EFE699", marginTop: 4 }}>{v.note}</p>}
              {v.imageUrl && (
                <img src={v.imageUrl} alt={v.name} style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 6, marginTop: 8 }} />
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={() => startEdit(v)} style={{ background: "#1B1030", color: "#1C9C9C", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                Edit
              </button>
              <button onClick={() => handleDelete(v.id)} style={{ background: "#1B1030", color: "#B23A72", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                Delete
              </button>
            </div>
          </div>
        ))}
        </>
        )}

        {activeTab === "banners" && (
        <>
        {/* Banner Add / Edit form */}
        <div style={{ background: "#241640", borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1C9C9C" }}>{bannerForm.id ? "Edit Banner Ad" : "Add New Banner Ad"}</h2>
          <p style={{ fontSize: 12, color: "#F5EFE699", marginBottom: 14 }}>
            Commission-based placements. Category determines where the banner shows up in the itinerary (e.g. a "nightlife" banner appears after evening activities).
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>CITY *</label>
              <input value={bannerForm.city} onChange={(e) => setBannerForm({ ...bannerForm, city: e.target.value })} placeholder="e.g. Miami" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>BUSINESS NAME *</label>
              <input value={bannerForm.businessName} onChange={(e) => setBannerForm({ ...bannerForm, businessName: e.target.value })} placeholder="e.g. Club Neon" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>CATEGORY (determines placement)</label>
              <select value={bannerForm.category} onChange={(e) => setBannerForm({ ...bannerForm, category: e.target.value })} style={inputStyle}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c === "hotel" ? "hotel (shown near booking button)" : c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>TAGLINE</label>
              <input value={bannerForm.tagline} onChange={(e) => setBannerForm({ ...bannerForm, tagline: e.target.value })} placeholder="Short promotional line" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>CTA BUTTON TEXT</label>
              <input value={bannerForm.ctaText} onChange={(e) => setBannerForm({ ...bannerForm, ctaText: e.target.value })} placeholder="e.g. Get 15% Off" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>CTA LINK</label>
              <input value={bannerForm.ctaLink} onChange={(e) => setBannerForm({ ...bannerForm, ctaLink: e.target.value })} placeholder="https://..." style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>PROMO CODE</label>
              <input value={bannerForm.promoCode} onChange={(e) => setBannerForm({ ...bannerForm, promoCode: e.target.value })} placeholder="e.g. COMPASSMIA" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>COMMISSION RATE (%)</label>
              <input
                type="number"
                value={bannerForm.commissionRate}
                onChange={(e) => setBannerForm({ ...bannerForm, commissionRate: Number(e.target.value) })}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>BANNER IMAGE *</label>
            {bannerForm.imageUrl && (
              <div style={{ marginBottom: 8 }}>
                <img src={bannerForm.imageUrl} alt="Banner" style={{ width: 160, height: 90, objectFit: "cover", borderRadius: 8 }} />
              </div>
            )}
            <input type="file" accept="image/*" onChange={handleBannerImageSelect} disabled={uploadingBannerImage} style={{ fontSize: 13, color: "#F5EFE6" }} />
            {uploadingBannerImage && <p style={{ fontSize: 12, color: "#1C9C9C", marginTop: 4 }}>Uploading...</p>}
          </div>

          {bannerError && <p style={{ color: "#B23A72", fontSize: 13, marginBottom: 10 }}>{bannerError}</p>}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleBannerSave}
              disabled={bannerSaving}
              style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 20px", borderRadius: 8, border: "none", cursor: bannerSaving ? "default" : "pointer" }}
            >
              {bannerSaving ? "Saving..." : bannerForm.id ? "Update Banner" : "Add Banner"}
            </button>
            {bannerForm.id && (
              <button
                onClick={() => setBannerForm(emptyBannerForm)}
                style={{ background: "transparent", color: "#F5EFE699", border: "1px solid #F5EFE633", padding: "10px 20px", borderRadius: 8, cursor: "pointer" }}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </div>

        {/* Banner filter + list */}
        <div style={{ marginBottom: 12 }}>
          <input
            value={bannerFilterCity}
            onChange={(e) => setBannerFilterCity(e.target.value)}
            placeholder="Filter by city..."
            style={{ ...inputStyle, maxWidth: 300 }}
          />
        </div>

        {banners.length === 0 && <p style={{ color: "#F5EFE699" }}>No banner ads yet — add one above.</p>}

        {banners.map((b) => (
          <div key={b.id} style={{ background: "#241640", borderRadius: 12, padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, opacity: b.active === false ? 0.5 : 1 }}>
            <div style={{ display: "flex", gap: 12 }}>
              {b.imageUrl && <img src={b.imageUrl} alt={b.businessName} style={{ width: 70, height: 52, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{b.businessName}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#D9662E22", color: "#D9662E" }}>{b.category.toUpperCase()}</span>
                  {b.active === false && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A7222", color: "#B23A72" }}>PAUSED</span>}
                </div>
                <p style={{ fontSize: 13, color: "#F5EFE6cc" }}>
                  {b.city} {b.promoCode && `· Code: ${b.promoCode}`} · {b.commissionRate}% commission
                </p>
                <p style={{ fontSize: 12.5, color: "#1C9C9C", marginTop: 4, fontWeight: 600 }}>{b.clicks || 0} clicks</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={() => toggleBannerActive(b)} style={{ background: "#1B1030", color: b.active === false ? "#1C9C9C" : "#F5EFE699", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                {b.active === false ? "Activate" : "Pause"}
              </button>
              <button onClick={() => startBannerEdit(b)} style={{ background: "#1B1030", color: "#1C9C9C", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                Edit
              </button>
              <button onClick={() => handleBannerDelete(b.id)} style={{ background: "#1B1030", color: "#B23A72", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                Delete
              </button>
            </div>
          </div>
        ))}
        </>
        )}
      </div>
    </div>
  );
}
