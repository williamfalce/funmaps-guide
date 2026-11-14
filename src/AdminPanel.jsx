import { useState, useEffect } from "react";
import { US_STATES, COUNTRIES, parseCityString, buildCityString, withPending, PendingChangesNote, SendBackButton, ReviewNoteBox, saveLabel, EditingBanner, apiCall } from "./adminShared.jsx";
import { WebsiteListingsPanel, RateCardPanel } from "./WebsiteListingsPanel.jsx";
import { StoriesPanel } from "./StoriesPanel.jsx";
import { LatestLinksPanel } from "./LatestLinksPanel.jsx";
import { DestinationCardsPanel } from "./DestinationCardsPanel.jsx";

const CATEGORIES = ["Accommodations", "Arts&Entertainment", "Attractions", "Bars&Clubs", "Events", "Resources", "Restaurants", "Shopping&Services", "Weddings"];
const BUDGET_OPTIONS = [
  { value: "$", label: "Budget" },
  { value: "$$", label: "Mid-Range" },
  { value: "$$$", label: "Luxury" },
];

const ADMIN_KEY_STORAGE = "compass-admin-key";

const emptyPartnerForm = {
  id: null,
  cityName: "",
  country: "United States",
  state: "",
  businessName: "",
  category: "Attractions",
  tier: "basic",
  priceTier: "$$",
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

const emptySponsorshipForm = { id: null, cityName: "", country: "United States", state: "", businessName: "", tagline: "", address: "", phone: "", imageUrl: "", ctaText: "Learn More", ctaLink: "", annualPrice: 3000, startDate: "", endDate: "" };
const emptyDealForm = { id: null, cityName: "", country: "United States", state: "", businessName: "", dealDescription: "", discountCode: "", dealLink: "", imageUrl: "", startDate: "", endDate: "" };

function generatePromoCode(businessName, existingCodes) {
  const cleaned = (businessName || "").replace(/[^a-zA-Z]/g, "").toUpperCase();
  const slug = cleaned.slice(0, 6) || "PARTNER";
  const year = new Date().getFullYear().toString().slice(-2);
  const base = `Compass_${slug}${year}`;
  if (!existingCodes.has(base.toUpperCase())) return base;
  let suffix = 2;
  while (existingCodes.has(`${base}-${suffix}`.toUpperCase())) suffix++;
  return `${base}-${suffix}`;
}

export default function AdminPanel() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) || "");
  const [adminRole, setAdminRole] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [adminName, setAdminName] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  // "signin" | "forgot" | "reset" (opened from an emailed reset link)
  const [authMode, setAuthMode] = useState(() => (new URLSearchParams(window.location.search).get("reset") ? "reset" : "signin"));
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get("reset") || "");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMessage, setPwMessage] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState("partners"); // "partners" | "sponsorships" | "deals" | "listings" | "ratecard" | "team"

  // The rate card's Compass section: default partner commission by tier and
  // the sponsor banner price, filled into new entries.
  const [compassCard, setCompassCard] = useState([]);
  const compassRate = (tier) => compassCard.find((x) => x.kind === "partner" && x.tier === tier)?.commissionRate ?? emptyPartnerForm.commissionRate;
  const compassItem = (tier) => compassCard.find((x) => x.kind === "partner" && x.tier === tier);
  const sponsorItem = compassCard.find((x) => x.kind === "sponsorship");
  const newPartnerForm = () => ({ ...emptyPartnerForm, commissionRate: compassRate("basic") });
  const newSponsorshipForm = () => ({ ...emptySponsorshipForm, annualPrice: sponsorItem?.price ?? emptySponsorshipForm.annualPrice });

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
  const [deals, setDeals] = useState([]);
  const [dealForm, setDealForm] = useState(emptyDealForm);
  const [dealSaving, setDealSaving] = useState(false);
  const [dealError, setDealError] = useState("");
  const [dealFilterCity, setDealFilterCity] = useState("");
  const [uploadingDealImage, setUploadingDealImage] = useState(false);

  useEffect(() => {
    document.title = "FunMaps Advertising Admin";
  }, []);

  useEffect(() => {
    if (adminKey && authMode !== "reset") tryUnlock(adminKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryUnlock(key) {
    setAuthError("");
    try {
      const data = await apiCall("banners", "GET", null, key, "");
      if (!data.role) {
        setAuthError("Incorrect password.");
        return;
      }
      setAdminKey(key);
      setAdminRole(data.role);
      sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
      try {
        const me = await apiCall("auth", "GET", null, key, "action=me");
        setAdminName(me.name || "");
      } catch (e) {
        setAdminName("");
      }
      setUnlocked(true);
    } catch (e) {
      setAuthError("Couldn't connect — check your connection and try again.");
    }
  }

  // Team members sign in with email + password and get a session token.
  // Leaving email blank signs in with the owner's admin password instead.
  async function signIn() {
    setAuthError("");
    if (!emailInput.trim()) {
      await tryUnlock(keyInput);
      return;
    }
    setSigningIn(true);
    try {
      const res = await fetch("/api/auth?action=login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput, password: keyInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Couldn't sign in.");
        return;
      }
      await tryUnlock(data.token);
    } catch (e) {
      setAuthError("Couldn't connect — check your connection and try again.");
    } finally {
      setSigningIn(false);
    }
  }

  async function requestReset() {
    setAuthError("");
    setAuthNotice("");
    if (!emailInput.trim()) {
      setAuthError("Enter the email you sign in with.");
      return;
    }
    setSigningIn(true);
    try {
      const res = await fetch("/api/auth?action=forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput }),
      });
      const data = await res.json();
      if (!res.ok) setAuthError(data.error || "Couldn't send a reset link.");
      else setAuthNotice(data.message);
    } catch (e) {
      setAuthError("Couldn't connect — check your connection and try again.");
    } finally {
      setSigningIn(false);
    }
  }

  async function completeReset() {
    setAuthError("");
    setSigningIn(true);
    try {
      const res = await fetch("/api/auth?action=reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: newPasswordInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Couldn't reset your password.");
        return;
      }
      window.history.replaceState(null, "", window.location.pathname);
      setEmailInput(data.email || "");
      setKeyInput("");
      setNewPasswordInput("");
      setAuthMode("signin");
      setAuthNotice("Password changed. Sign in with your new password.");
    } catch (e) {
      setAuthError("Couldn't connect — check your connection and try again.");
    } finally {
      setSigningIn(false);
    }
  }

  async function changeOwnPassword() {
    setPwMessage("");
    try {
      const data = await apiCall("auth", "POST", { currentPassword: pwCurrent, newPassword: pwNew }, adminKey, "action=change-password");
      setAdminKey(data.token);
      sessionStorage.setItem(ADMIN_KEY_STORAGE, data.token);
      setPwCurrent("");
      setPwNew("");
      setPwMessage("Password changed. You've been signed out on your other devices.");
    } catch (e) {
      setPwMessage(e.message);
    }
  }

  function logOut() {
    if (adminKey && adminKey.startsWith("sess_")) {
      fetch("/api/auth?action=logout", { method: "POST", headers: { "x-admin-key": adminKey } }).catch(() => {});
    }
    setAdminName("");
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey("");
    setAdminRole("");
    setUnlocked(false);
    setKeyInput("");
  }

  // ---------- Partners ----------

  async function reviewChanges(endpoint, rec, approve, reload, setErr) {
    if (!approve && !window.confirm(`Discard the proposed changes to "${rec.businessName}"? The live listing stays as it is.`)) return;
    try {
      await apiCall(endpoint, "PUT", { id: rec.id, [approve ? "approveChanges" : "rejectChanges"]: true }, adminKey);
      await reload();
    } catch (e) {
      setErr("Couldn't update that entry.");
    }
  }

  async function loadPartners() {
    try {
      const data = await apiCall("banners", "GET", null, adminKey, partnerFilterCity ? `city=${encodeURIComponent(partnerFilterCity)}` : "");
      setPartners(data.banners || []);
    } catch (e) {
      setPartnerError("Couldn't load partners.");
    }
  }

  useEffect(() => {
    if (!unlocked) return;
    apiCall("rate-card", "GET", null, adminKey, "")
      .then((d) => {
        const items = d.rateCard?.compass || [];
        setCompassCard(items);
        const basic = items.find((x) => x.kind === "partner" && x.tier === "basic");
        const sponsor = items.find((x) => x.kind === "sponsorship");
        // Blank "new" forms pick up the rate card values.
        if (basic) setPartnerForm((f) => (f.id || f.commissionRate !== emptyPartnerForm.commissionRate ? f : { ...f, commissionRate: basic.commissionRate }));
        if (sponsor) setSponsorshipForm((f) => (f.id || f.annualPrice !== emptySponsorshipForm.annualPrice ? f : { ...f, annualPrice: sponsor.price }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

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
      setPartnerError(err.message?.includes("Invalid admin key") ? "Your admin key was rejected — click Log Out and re-enter it." : err.message || "Image upload failed — try a smaller image.");
    } finally {
      setUploadingPartnerImage(false);
    }
  }

  async function handleGenerateCode() {
    if (!partnerForm.businessName.trim()) {
      setPartnerError("Enter a business name first, so the code can be based on it.");
      return;
    }
    try {
      // Fetch the full, unfiltered list to check uniqueness against ALL existing codes,
      // not just whatever's currently showing under the active city filter.
      const data = await apiCall("banners", "GET", null, adminKey, "");
      const existingCodes = new Set((data.banners || []).map((b) => (b.promoCode || "").toUpperCase()).filter(Boolean));
      const code = generatePromoCode(partnerForm.businessName, existingCodes);
      setPartnerForm((f) => ({ ...f, promoCode: code }));
    } catch (e) {
      setPartnerError("Couldn't generate a code — try again.");
    }
  }

  async function handlePartnerSave() {
    if (!partnerForm.cityName.trim() || !partnerForm.businessName.trim()) {
      setPartnerError("City and business name are required.");
      return;
    }
    if (partnerForm.country === "United States" && !partnerForm.state) {
      setPartnerError("Please select a state.");
      return;
    }
    if (partnerForm.tier === "premium" && !partnerForm.imageUrl) {
      setPartnerError("Recommended Partner (Premium) requires an uploaded image or logo.");
      return;
    }
    setPartnerSaving(true);
    setPartnerError("");
    try {
      const payload = { ...partnerForm, city: buildCityString(partnerForm.cityName, partnerForm.country, partnerForm.state) };
      // An admin editing and saving a pending entry IS the approval — no separate
      // click needed. (Sales-role saves still get forced back to "pending" by
      // the server regardless of what's sent here, so this only matters for admin.)
      if (adminRole === "admin") { payload.status = "approved"; payload.approveChanges = true; }
      if (partnerForm.id) {
        await apiCall("banners", "PUT", payload, adminKey);
      } else {
        await apiCall("banners", "POST", payload, adminKey);
      }
      setPartnerForm(newPartnerForm());
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

  async function approvePartner(p) {
    try {
      await apiCall("banners", "PUT", { id: p.id, status: "approved" }, adminKey);
      await loadPartners();
    } catch (e) {
      setPartnerError("Couldn't approve that partner.");
    }
  }

  function startPartnerEdit(orig) {
    const p = withPending(orig);
    const { cityName, country, state } = parseCityString(p.city);
    setPartnerForm({
      id: p.id,
      status: p.status || "approved",
      cityName,
      country,
      state,
      businessName: p.businessName,
      category: p.category,
      tier: p.tier || "basic",
      priceTier: p.priceTier || "$$",
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
      setSponsorshipError(err.message?.includes("Invalid admin key") ? "Your admin key was rejected — click Log Out and re-enter it." : err.message || "Image upload failed — try a smaller image.");
    } finally {
      setUploadingSponsorshipImage(false);
    }
  }

  async function handleSponsorshipSave() {
    if (!sponsorshipForm.cityName.trim() || !sponsorshipForm.businessName.trim() || !sponsorshipForm.imageUrl) {
      setSponsorshipError("City, business name, and an uploaded image are all required.");
      return;
    }
    if (sponsorshipForm.country === "United States" && !sponsorshipForm.state) {
      setSponsorshipError("Please select a state.");
      return;
    }
    setSponsorshipSaving(true);
    setSponsorshipError("");
    try {
      const payload = { ...sponsorshipForm, city: buildCityString(sponsorshipForm.cityName, sponsorshipForm.country, sponsorshipForm.state) };
      if (adminRole === "admin") { payload.status = "approved"; payload.approveChanges = true; }
      if (sponsorshipForm.id) {
        await apiCall("sponsorships", "PUT", payload, adminKey);
      } else {
        await apiCall("sponsorships", "POST", payload, adminKey);
      }
      setSponsorshipForm(newSponsorshipForm());
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

  async function approveSponsorship(s) {
    try {
      await apiCall("sponsorships", "PUT", { id: s.id, status: "approved" }, adminKey);
      await loadSponsorships();
    } catch (e) {
      setSponsorshipError("Couldn't approve that sponsorship.");
    }
  }

  function startSponsorshipEdit(orig) {
    const s = withPending(orig);
    const { cityName, country, state } = parseCityString(s.city);
    setSponsorshipForm({
      id: s.id,
      status: s.status || "approved",
      cityName,
      country,
      state,
      businessName: s.businessName,
      tagline: s.tagline || "",
      address: s.address || "",
      phone: s.phone || "",
      imageUrl: s.imageUrl || "",
      ctaText: s.ctaText || "Learn More",
      ctaLink: s.ctaLink || "",
      annualPrice: s.annualPrice || 3000,
      startDate: s.startDate || "",
      endDate: s.endDate || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- Deals ----------

  async function loadDeals() {
    try {
      const data = await apiCall("deals", "GET", null, adminKey, dealFilterCity ? `city=${encodeURIComponent(dealFilterCity)}` : "");
      setDeals(data.deals || []);
    } catch (e) {
      setDealError("Couldn't load deals.");
    }
  }

  useEffect(() => {
    if (unlocked && activeTab === "deals") loadDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, activeTab, dealFilterCity]);

  async function handleDealImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setDealError("Please choose an image file.");
      return;
    }
    setUploadingDealImage(true);
    setDealError("");
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
      setDealForm((f) => ({ ...f, imageUrl: data.url }));
    } catch (err) {
      setDealError(err.message?.includes("Invalid admin key") ? "Your admin key was rejected — click Log Out and re-enter it." : err.message || "Image upload failed — try a smaller image.");
    } finally {
      setUploadingDealImage(false);
    }
  }

  async function handleDealSave() {
    if (!dealForm.cityName.trim() || !dealForm.businessName.trim() || !dealForm.dealDescription.trim()) {
      setDealError("City, business name, and deal description are all required.");
      return;
    }
    if (dealForm.country === "United States" && !dealForm.state) {
      setDealError("Please select a state.");
      return;
    }
    setDealSaving(true);
    setDealError("");
    try {
      const payload = { ...dealForm, city: buildCityString(dealForm.cityName, dealForm.country, dealForm.state) };
      if (adminRole === "admin") { payload.status = "approved"; payload.approveChanges = true; }
      if (dealForm.id) {
        await apiCall("deals", "PUT", payload, adminKey);
      } else {
        await apiCall("deals", "POST", payload, adminKey);
      }
      setDealForm(emptyDealForm);
      await loadDeals();
    } catch (e) {
      if (e.message.includes("Invalid admin key")) {
        setDealError("Your admin key was rejected — click Log Out and re-enter it.");
      } else {
        setDealError("Couldn't save that deal — try again.");
      }
    } finally {
      setDealSaving(false);
    }
  }

  async function handleDealDelete(id) {
    if (!window.confirm("Remove this deal?")) return;
    try {
      await apiCall("deals", "DELETE", null, adminKey, `id=${encodeURIComponent(id)}`);
      await loadDeals();
    } catch (e) {
      setDealError("Couldn't delete that deal.");
    }
  }

  async function toggleDealActive(d) {
    try {
      await apiCall("deals", "PUT", { id: d.id, active: !d.active }, adminKey);
      await loadDeals();
    } catch (e) {
      setDealError("Couldn't update that deal.");
    }
  }

  async function approveDeal(d) {
    try {
      await apiCall("deals", "PUT", { id: d.id, status: "approved" }, adminKey);
      await loadDeals();
    } catch (e) {
      setDealError("Couldn't approve that deal.");
    }
  }

  function startDealEdit(orig) {
    const d = withPending(orig);
    const { cityName, country, state } = parseCityString(d.city);
    setDealForm({
      id: d.id,
      status: d.status || "approved",
      cityName,
      country,
      state,
      businessName: d.businessName,
      dealDescription: d.dealDescription || "",
      discountCode: d.discountCode || "",
      dealLink: d.dealLink || "",
      imageUrl: d.imageUrl || "",
      startDate: d.startDate || "",
      endDate: d.endDate || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function isDealUpcoming(d) {
    if (!d.startDate) return false;
    return new Date(d.startDate + "T00:00:00").getTime() > Date.now();
  }

  function isDealExpired(d) {
    if (!d.endDate) return false;
    return new Date(d.endDate + "T23:59:59").getTime() < Date.now();
  }

  const inputStyle = { width: "100%", background: "#C9AEC7", border: "1px solid #1B103015", borderRadius: 8, padding: "9px 12px", outline: "none", color: "#1B1030", fontSize: 14 };
  const labelStyle = { fontSize: 11.5, color: "#D9662E", fontWeight: 600, display: "block", marginBottom: 4 };

  if (!unlocked) {
    return (
      <div style={{ background: "#1B1030", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", padding: 24 }}>
        <div style={{ background: "#241640", borderRadius: 16, padding: 32, maxWidth: 360, width: "100%" }}>
          <h1 style={{ color: "#F5EFE6", fontSize: 20, fontWeight: 700, marginBottom: 16 }}>FunMaps Advertising Admin</h1>
          {authMode === "signin" && (
            <>
              <label htmlFor="login-email" style={labelStyle}>EMAIL</label>
              <input id="login-email" type="email" autoComplete="username" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()} style={{ ...inputStyle, marginBottom: 12 }} />
              <label htmlFor="login-password" style={labelStyle}>PASSWORD</label>
              <input id="login-password" type="password" autoComplete="current-password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()} style={inputStyle} />
              <p style={{ color: "#F5EFE699", fontSize: 11.5, marginTop: 8 }}>Owner: leave email blank and enter the admin password.</p>
              {authNotice && <p style={{ color: "#1C9C9C", fontSize: 13, marginTop: 8 }}>{authNotice}</p>}
              {authError && <p style={{ color: "#B23A72", fontSize: 13, marginTop: 8 }}>{authError}</p>}
              <button onClick={signIn} disabled={signingIn} style={{ width: "100%", marginTop: 16, background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 0", borderRadius: 8, border: "none", cursor: signingIn ? "default" : "pointer" }}>
                {signingIn ? "Signing in..." : "Sign In"}
              </button>
              <button onClick={() => { setAuthMode("forgot"); setAuthError(""); setAuthNotice(""); }} style={{ width: "100%", marginTop: 10, background: "transparent", color: "#1C9C9C", border: "none", fontSize: 13, cursor: "pointer" }}>
                Forgot password?
              </button>
            </>
          )}
          {authMode === "forgot" && (
            <>
              <p style={{ color: "#F5EFE6cc", fontSize: 13, marginBottom: 12 }}>Enter the email you sign in with and we'll email you a link to choose a new password.</p>
              <label htmlFor="forgot-email" style={labelStyle}>EMAIL</label>
              <input id="forgot-email" type="email" autoComplete="username" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && requestReset()} style={inputStyle} />
              {authNotice && <p style={{ color: "#1C9C9C", fontSize: 13, marginTop: 8 }}>{authNotice}</p>}
              {authError && <p style={{ color: "#B23A72", fontSize: 13, marginTop: 8 }}>{authError}</p>}
              <button onClick={requestReset} disabled={signingIn} style={{ width: "100%", marginTop: 16, background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 0", borderRadius: 8, border: "none", cursor: signingIn ? "default" : "pointer" }}>
                {signingIn ? "Sending..." : "Email me a reset link"}
              </button>
              <button onClick={() => { setAuthMode("signin"); setAuthError(""); setAuthNotice(""); }} style={{ width: "100%", marginTop: 10, background: "transparent", color: "#1C9C9C", border: "none", fontSize: 13, cursor: "pointer" }}>
                Back to sign in
              </button>
            </>
          )}
          {authMode === "reset" && (
            <>
              <p style={{ color: "#F5EFE6cc", fontSize: 13, marginBottom: 12 }}>Choose a new password (at least 10 characters).</p>
              <label htmlFor="reset-password" style={labelStyle}>NEW PASSWORD</label>
              <input id="reset-password" type="password" autoComplete="new-password" value={newPasswordInput} onChange={(e) => setNewPasswordInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && completeReset()} style={inputStyle} />
              {authError && <p style={{ color: "#B23A72", fontSize: 13, marginTop: 8 }}>{authError}</p>}
              <button onClick={completeReset} disabled={signingIn} style={{ width: "100%", marginTop: 16, background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 0", borderRadius: 8, border: "none", cursor: signingIn ? "default" : "pointer" }}>
                {signingIn ? "Saving..." : "Set new password"}
              </button>
              <button onClick={() => { window.history.replaceState(null, "", window.location.pathname); setAuthMode("forgot"); setAuthError(""); }} style={{ width: "100%", marginTop: 10, background: "transparent", color: "#1C9C9C", border: "none", fontSize: 13, cursor: "pointer" }}>
                Link expired? Request a new one
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#1B1030", minHeight: "100vh", fontFamily: "Inter, sans-serif", color: "#F5EFE6", padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div className="flex items-center gap-2" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>FunMaps Advertising Admin</h1>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 999,
                background: adminRole === "admin" ? "#D9662E22" : "#1C9C9C22",
                color: adminRole === "admin" ? "#D9662E" : "#1C9C9C",
              }}
            >
              {adminRole === "admin" ? "ADMIN" : "SALES"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {adminName && <span style={{ fontSize: 13, color: "#F5EFE6cc" }}>Signed in as {adminName}</span>}
            {adminKey.startsWith("sess_") && (
              <button onClick={() => { setShowChangePassword(!showChangePassword); setPwMessage(""); }} style={{ background: "transparent", color: "#1C9C9C", border: "none", fontSize: 13, cursor: "pointer" }}>
                Change password
              </button>
            )}
            <button onClick={logOut} style={{ background: "#241640", color: "#F5EFE6", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>
              Log Out
            </button>
          </div>
        </div>

        {showChangePassword && (
          <div style={{ background: "#241640", borderRadius: 12, padding: 16, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 200px" }}>
              <label htmlFor="pw-current" style={labelStyle}>CURRENT PASSWORD</label>
              <input id="pw-current" type="password" autoComplete="current-password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label htmlFor="pw-new" style={labelStyle}>NEW PASSWORD (10+ CHARACTERS)</label>
              <input id="pw-new" type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} style={inputStyle} />
            </div>
            <button onClick={changeOwnPassword} style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 18px", borderRadius: 8, border: "none", cursor: "pointer" }}>
              Save new password
            </button>
            {pwMessage && <p style={{ flexBasis: "100%", fontSize: 13, color: pwMessage.startsWith("Password changed") ? "#1C9C9C" : "#B23A72" }}>{pwMessage}</p>}
          </div>
        )}

        {adminRole === "sales" && (
          <div style={{ background: "#1C9C9C15", border: "1px solid #1C9C9C40", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#F5EFE6cc" }}>
            Entries you add or edit go into <strong>Pending Review</strong> and won't be visible to travelers until an admin approves them. If an admin sends one back, it's marked <strong>Needs changes</strong> with their note: click <strong>Edit</strong>, make the changes, then click <strong>Resubmit for review</strong> at the bottom of the form.
            {adminName === "Sales (shared login)" && (
              <> You're using the old shared sales password, so your entries can't be credited to you. Ask an admin for your own login.</>
            )}
          </div>
        )}

        {/* Tabs grouped by product: Compass, FunMaps.com, and settings (admins only). */}
        <nav aria-label="Admin sections" style={{ display: "flex", gap: 18, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          {[
            { group: "Compass", tabs: [["partners", "Partners (Commission)"], ["sponsorships", "Sponsorships (Flat Fee)"], ["deals", "Deals (Self-Expiring)"]] },
            { group: "FunMaps.com & Printed Guide", tabs: [["listings", "Website & Print Listings"], ...(adminRole === "admin" ? [["stories", "Traveler Stories"], ["destcards", "Destination Cards"]] : [])] },
            ...(adminRole === "admin" ? [{ group: "Settings", tabs: [["ratecard", "Rate Card"], ["latestlinks", "Newsletter & Guide"], ["team", "Team"]] }] : []),
          ].map(({ group, tabs }) => (
            <div key={group} role="group" aria-label={group}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#F5EFE699", marginBottom: 6 }}>{group}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {tabs.map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    aria-current={activeTab === id ? "page" : undefined}
                    style={{ background: activeTab === id ? "#D9662E" : "#241640", color: activeTab === id ? "#1B1030" : "#F5EFE6b3", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {activeTab === "team" && adminRole === "admin" && <TeamPanel adminKey={adminKey} inputStyle={inputStyle} labelStyle={labelStyle} />}
        {activeTab === "listings" && <WebsiteListingsPanel adminKey={adminKey} adminRole={adminRole} inputStyle={inputStyle} labelStyle={labelStyle} />}
        {activeTab === "destcards" && adminRole === "admin" && <DestinationCardsPanel adminKey={adminKey} inputStyle={inputStyle} labelStyle={labelStyle} />}
        {activeTab === "latestlinks" && adminRole === "admin" && <LatestLinksPanel adminKey={adminKey} inputStyle={inputStyle} labelStyle={labelStyle} />}
        {activeTab === "stories" && adminRole === "admin" && <StoriesPanel adminKey={adminKey} inputStyle={inputStyle} labelStyle={labelStyle} />}
        {activeTab === "ratecard" && adminRole === "admin" && <RateCardPanel adminKey={adminKey} inputStyle={inputStyle} labelStyle={labelStyle} />}

        {activeTab === "partners" && (
          <>
            <div style={{ background: "#241640", borderRadius: 14, padding: 20, marginBottom: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1C9C9C" }}>{partnerForm.id ? "Edit Partner" : "Add New Partner"}</h2>
              <EditingBanner record={(partnerForm.id ? partners.find((x) => x.id === partnerForm.id) : null)} isAdmin={adminRole === "admin"} label={saveLabel(adminRole === "admin", (partnerForm.id ? partners.find((x) => x.id === partnerForm.id) : null), "Partner")} />
              <p style={{ fontSize: 12, color: "#F5EFE699", marginBottom: 14 }}>
                Commission-based. Tier controls the <strong>visual style</strong> only — <strong>Recommended Partner (Premium)</strong> gets a white border and image/logo shown first. The commission rate below is fully independent — set it to whatever you actually negotiate with each partner (15% and 22% are just common starting points, not fixed values).
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>CITY *</label>
                  <input value={partnerForm.cityName} onChange={(e) => setPartnerForm({ ...partnerForm, cityName: e.target.value })} placeholder="e.g. Miami" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>COUNTRY *</label>
                  <select value={partnerForm.country} onChange={(e) => setPartnerForm({ ...partnerForm, country: e.target.value, state: e.target.value === "United States" ? partnerForm.state : "" })} style={inputStyle}>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                {partnerForm.country === "United States" && (
                  <div>
                    <label style={labelStyle}>STATE *</label>
                    <select value={partnerForm.state} onChange={(e) => setPartnerForm({ ...partnerForm, state: e.target.value })} style={inputStyle}>
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
                  <label style={labelStyle}>BUSINESS NAME *</label>
                  <input value={partnerForm.businessName} onChange={(e) => setPartnerForm({ ...partnerForm, businessName: e.target.value })} placeholder="e.g. Club Neon" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>TIER (controls visual style — border, image layout, badge — not pricing)</label>
                  <select
                    value={partnerForm.tier}
                    onChange={(e) => {
                      const tier = e.target.value;
                      // Follow the rate card's commission for the new tier unless a negotiated rate was typed in.
                      const followRate = Number(partnerForm.commissionRate) === Number(compassRate(partnerForm.tier));
                      setPartnerForm({ ...partnerForm, tier, commissionRate: followRate ? compassRate(tier) : partnerForm.commissionRate });
                    }}
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
                  <label style={labelStyle}>PRICE TIER (shown to travelers, used for budget filtering)</label>
                  <select value={partnerForm.priceTier} onChange={(e) => setPartnerForm({ ...partnerForm, priceTier: e.target.value })} style={inputStyle}>
                    {BUDGET_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.value} — {opt.label}
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
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={partnerForm.promoCode} onChange={(e) => setPartnerForm({ ...partnerForm, promoCode: e.target.value })} placeholder="e.g. Compass_CLUBNE26" style={{ ...inputStyle, flex: 1 }} />
                    <button
                      type="button"
                      onClick={handleGenerateCode}
                      style={{ background: "#1C9C9C", color: "#1B1030", border: "none", borderRadius: 8, padding: "0 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      Generate
                    </button>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>{adminRole === "admin" ? "COMMISSION RATE (%) — set whatever you negotiated with this partner" : "COMMISSION RATE (%) — the rate you negotiated; an admin approves it"}</label>
                  <input type="number" min={0} max={100} value={partnerForm.commissionRate} onChange={(e) => setPartnerForm({ ...partnerForm, commissionRate: Number(e.target.value) })} style={inputStyle} />
                  {compassItem(partnerForm.tier) && (
                    <p style={{ fontSize: 11.5, marginTop: 4, color: Number(partnerForm.commissionRate) !== Number(compassRate(partnerForm.tier)) ? "#E8B84B" : "#F5EFE699" }}>
                      Rate card: {compassItem(partnerForm.tier).name}, {compassRate(partnerForm.tier)}%.
                      {Number(partnerForm.commissionRate) !== Number(compassRate(partnerForm.tier)) && " This differs; an admin approves negotiated rates."}
                    </p>
                  )}
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

              {partnerForm.tier !== "premium" ? (
                <p style={{ fontSize: 12, color: "#F5EFE699", marginBottom: 14 }}>Basic partners are text only: Compass shows no image. Choose Recommended Partner (Premium) to include an image or logo.</p>
              ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>IMAGE / LOGO *</label>
                {partnerForm.imageUrl && (
                  <div style={{ marginBottom: 8 }}>
                    <img src={partnerForm.imageUrl} alt="Partner" style={{ width: 160, height: 90, objectFit: "cover", borderRadius: 8 }} />
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handlePartnerImageSelect} disabled={uploadingPartnerImage} style={{ fontSize: 13, color: "#F5EFE6" }} />
                {uploadingPartnerImage && <p style={{ fontSize: 12, color: "#1C9C9C", marginTop: 4 }}>Uploading...</p>}
              </div>
              )}

              {partnerError && <p style={{ color: "#B23A72", fontSize: 13, marginBottom: 10 }}>{partnerError}</p>}

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handlePartnerSave}
                  disabled={partnerSaving}
                  style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 20px", borderRadius: 8, border: "none", cursor: partnerSaving ? "default" : "pointer" }}
                >
                  {partnerSaving ? "Saving..." : saveLabel(adminRole === "admin", (partnerForm.id ? partners.find((x) => x.id === partnerForm.id) : null), "Partner")}
                </button>
                {partnerForm.id && (
                  <button
                    onClick={() => setPartnerForm(newPartnerForm())}
                    style={{ background: "transparent", color: "#F5EFE699", border: "1px solid #F5EFE633", padding: "10px 20px", borderRadius: 8, cursor: "pointer" }}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <input value={partnerFilterCity} onChange={(e) => setPartnerFilterCity(e.target.value)} placeholder="Filter by city (e.g. Miami, FL)..." style={{ ...inputStyle, maxWidth: 300 }} />
            </div>

            {partners.length === 0 && <p style={{ color: "#F5EFE699" }}>No partners yet — add one above.</p>}

            {partners.map((p) => (
              <div key={p.id} style={{ background: "#241640", borderRadius: 12, padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, opacity: p.active === false ? 0.5 : 1, border: p.status === "pending" ? "1px solid #D9662E60" : "none" }}>
                <div style={{ display: "flex", gap: 12 }}>
                  {p.imageUrl && <img src={p.imageUrl} alt={p.businessName} style={{ width: 70, height: 52, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{p.businessName}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: p.tier === "premium" ? "#F5EFE622" : "#1C9C9C22", color: p.tier === "premium" ? "#F5EFE6" : "#1C9C9C" }}>
                        {p.tier === "premium" ? "RECOMMENDED (PREMIUM)" : "FEATURED (BASIC)"}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#D9662E22", color: "#D9662E" }}>{p.category?.toUpperCase()}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#E8B84B22", color: "#E8B84B" }}>{p.priceTier || "$$"}</span>
                      {p.status === "pending" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#D9662E", color: "#1B1030" }}>⏳ PENDING REVIEW</span>}
                      {p.status === "needs_changes" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A72", color: "#FFFFFF" }}>↩ NEEDS CHANGES</span>}
                      {p.pendingChanges && !p.changesSentBack && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#E8B84B", color: "#1B1030" }}>CHANGES PENDING REVIEW</span>}
                      {p.pendingChanges && p.changesSentBack && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A72", color: "#FFFFFF" }}>↩ CHANGES SENT BACK</span>}
                      {p.pendingChanges && <PendingChangesNote rec={p} />}
                      <ReviewNoteBox rec={p} />
                      {p.active === false && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A7222", color: "#B23A72" }}>PAUSED</span>}
                    </div>
                    <p style={{ fontSize: 13, color: "#F5EFE6cc" }}>
                      {p.city} {p.address && `· ${p.address}`} {p.phone && `· ${p.phone}`}
                    </p>
                    <p style={{ fontSize: 12.5, color: "#1C9C9C", marginTop: 4, fontWeight: 600 }}>
                      {p.commissionRate}% commission · {p.promoCode && `Code: ${p.promoCode} · `}
                      {p.clicks || 0} clicks
                      {(p.createdByName || p.createdBy) && ` · added by ${p.createdByName || p.createdBy}`}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
                  {adminRole === "admin" && p.pendingChanges && !p.changesSentBack && (
                    <>
                      <button onClick={() => reviewChanges("banners", p, true, loadPartners, setPartnerError)} style={{ background: "#1C9C9C", color: "#1B1030", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Approve changes
                      </button>
                      <SendBackButton endpoint="banners" rec={p} adminKey={adminKey} onDone={loadPartners} style={{ background: "#1B1030", color: "#E58AB5", border: "1px solid #B23A7260", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }} />
                    </>
                  )}
                  {adminRole === "admin" && p.status === "pending" && (
                    <>
                      <button onClick={() => approvePartner(p)} style={{ background: "#1C9C9C", color: "#1B1030", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Approve
                      </button>
                      <SendBackButton endpoint="banners" rec={p} adminKey={adminKey} onDone={loadPartners} style={{ background: "#1B1030", color: "#E58AB5", border: "1px solid #B23A7260", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }} />
                    </>
                  )}
                  <button onClick={() => togglePartnerActive(p)} style={{ background: "#1B1030", color: p.active === false ? "#1C9C9C" : "#F5EFE699", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                    {p.active === false ? "Activate" : "Pause"}
                  </button>
                  <button onClick={() => startPartnerEdit(p)} style={{ background: "#1B1030", color: "#1C9C9C", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                    Edit
                  </button>
                  {adminRole === "admin" && (
                    <button onClick={() => handlePartnerDelete(p.id)} style={{ background: "#1B1030", color: "#B23A72", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === "sponsorships" && (
          <>
            <div style={{ background: "#241640", borderRadius: 14, padding: 20, marginBottom: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1C9C9C" }}>{sponsorshipForm.id ? "Edit Sponsorship" : "Add New Sponsorship"}</h2>
              <EditingBanner record={(sponsorshipForm.id ? sponsorships.find((x) => x.id === sponsorshipForm.id) : null)} isAdmin={adminRole === "admin"} label={saveLabel(adminRole === "admin", (sponsorshipForm.id ? sponsorships.find((x) => x.id === sponsorshipForm.id) : null), "Sponsorship")} />
              <p style={{ fontSize: 12, color: "#F5EFE699", marginBottom: 14 }}>
                Flat annual fee, destination-specific. If a city has more than one sponsor, the banner rotates between them each time someone plans a trip there.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>CITY *</label>
                  <input value={sponsorshipForm.cityName} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, cityName: e.target.value })} placeholder="e.g. Miami" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>COUNTRY *</label>
                  <select
                    value={sponsorshipForm.country}
                    onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, country: e.target.value, state: e.target.value === "United States" ? sponsorshipForm.state : "" })}
                    style={inputStyle}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                {sponsorshipForm.country === "United States" && (
                  <div>
                    <label style={labelStyle}>STATE *</label>
                    <select value={sponsorshipForm.state} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, state: e.target.value })} style={inputStyle}>
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
                  <label style={labelStyle}>BUSINESS NAME *</label>
                  <input value={sponsorshipForm.businessName} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, businessName: e.target.value })} placeholder="e.g. Grand Resort Miami" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>TAGLINE</label>
                  <input value={sponsorshipForm.tagline} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, tagline: e.target.value })} placeholder="Short promotional line" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>ADDRESS</label>
                  <input value={sponsorshipForm.address} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, address: e.target.value })} placeholder="Street address (for map pin)" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>PHONE NUMBER</label>
                  <input value={sponsorshipForm.phone} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, phone: e.target.value })} placeholder="(555) 123-4567" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>ANNUAL PRICE ($)</label>
                  <input type="number" value={sponsorshipForm.annualPrice} onChange={(e) => setSponsorshipForm({ ...sponsorshipForm, annualPrice: Number(e.target.value) })} style={inputStyle} />
                  {sponsorItem && (
                    <p style={{ fontSize: 11.5, marginTop: 4, color: Number(sponsorshipForm.annualPrice) !== Number(sponsorItem.price) ? "#E8B84B" : "#F5EFE699" }}>
                      Rate card: {sponsorItem.name}, ${Number(sponsorItem.price).toLocaleString("en-US")} / year.
                      {Number(sponsorshipForm.annualPrice) !== Number(sponsorItem.price) && " This differs; an admin approves negotiated prices."}
                    </p>
                  )}
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
                  {sponsorshipSaving ? "Saving..." : saveLabel(adminRole === "admin", (sponsorshipForm.id ? sponsorships.find((x) => x.id === sponsorshipForm.id) : null), "Sponsorship")}
                </button>
                {sponsorshipForm.id && (
                  <button
                    onClick={() => setSponsorshipForm(newSponsorshipForm())}
                    style={{ background: "transparent", color: "#F5EFE699", border: "1px solid #F5EFE633", padding: "10px 20px", borderRadius: 8, cursor: "pointer" }}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <input value={sponsorshipFilterCity} onChange={(e) => setSponsorshipFilterCity(e.target.value)} placeholder="Filter by city (e.g. Miami, FL)..." style={{ ...inputStyle, maxWidth: 300 }} />
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
                  <div key={s.id} style={{ background: "#241640", borderRadius: 12, padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, opacity: s.active === false ? 0.5 : 1, border: s.status === "pending" ? "1px solid #D9662E60" : "none" }}>
                    <div style={{ display: "flex", gap: 12 }}>
                      {s.imageUrl && <img src={s.imageUrl} alt={s.businessName} style={{ width: 90, height: 60, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{s.businessName}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#F5EFE622", color: "#F5EFE6" }}>${s.annualPrice || 3000}/YR</span>
                          {rotating && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#D9662E22", color: "#D9662E" }}>ROTATING</span>}
                          {s.status === "pending" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#D9662E", color: "#1B1030" }}>⏳ PENDING REVIEW</span>}
                      {s.status === "needs_changes" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A72", color: "#FFFFFF" }}>↩ NEEDS CHANGES</span>}
                      {s.pendingChanges && !s.changesSentBack && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#E8B84B", color: "#1B1030" }}>CHANGES PENDING REVIEW</span>}
                      {s.pendingChanges && s.changesSentBack && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A72", color: "#FFFFFF" }}>↩ CHANGES SENT BACK</span>}
                      {s.pendingChanges && <PendingChangesNote rec={s} />}
                      <ReviewNoteBox rec={s} />
                          {s.active === false && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A7222", color: "#B23A72" }}>PAUSED</span>}
                        </div>
                        <p style={{ fontSize: 13, color: "#F5EFE6cc" }}>
                          {s.city} {s.address && `· ${s.address}`} {s.phone && `· ${s.phone}`} {s.startDate && s.endDate && `· ${s.startDate} to ${s.endDate}`}
                        </p>
                        <p style={{ fontSize: 12.5, color: "#1C9C9C", marginTop: 4, fontWeight: 600 }}>
                          {s.clicks || 0} clicks{(s.createdByName || s.createdBy) && ` · added by ${s.createdByName || s.createdBy}`}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
                      {adminRole === "admin" && s.pendingChanges && !s.changesSentBack && (
                    <>
                      <button onClick={() => reviewChanges("sponsorships", s, true, loadSponsorships, setSponsorshipError)} style={{ background: "#1C9C9C", color: "#1B1030", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Approve changes
                      </button>
                      <SendBackButton endpoint="sponsorships" rec={s} adminKey={adminKey} onDone={loadSponsorships} style={{ background: "#1B1030", color: "#E58AB5", border: "1px solid #B23A7260", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }} />
                    </>
                  )}
                  {adminRole === "admin" && s.status === "pending" && (
                        <>
                          <button onClick={() => approveSponsorship(s)} style={{ background: "#1C9C9C", color: "#1B1030", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            Approve
                          </button>
                          <SendBackButton endpoint="sponsorships" rec={s} adminKey={adminKey} onDone={loadSponsorships} style={{ background: "#1B1030", color: "#E58AB5", border: "1px solid #B23A7260", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }} />
                        </>
                      )}
                      <button onClick={() => toggleSponsorshipActive(s)} style={{ background: "#1B1030", color: s.active === false ? "#1C9C9C" : "#F5EFE699", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                        {s.active === false ? "Activate" : "Pause"}
                      </button>
                      <button onClick={() => startSponsorshipEdit(s)} style={{ background: "#1B1030", color: "#1C9C9C", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                        Edit
                      </button>
                      {adminRole === "admin" && (
                        <button onClick={() => handleSponsorshipDelete(s.id)} style={{ background: "#1B1030", color: "#B23A72", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </>
        )}

        {activeTab === "deals" && (
          <>
            <div style={{ background: "#241640", borderRadius: 14, padding: 20, marginBottom: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1C9C9C" }}>{dealForm.id ? "Edit Deal" : "Add New Deal"}</h2>
              <EditingBanner record={(dealForm.id ? deals.find((x) => x.id === dealForm.id) : null)} isAdmin={adminRole === "admin"} label={saveLabel(adminRole === "admin", (dealForm.id ? deals.find((x) => x.id === dealForm.id) : null), "Deal")} />
              <p style={{ fontSize: 12, color: "#F5EFE699", marginBottom: 14 }}>
                Time-limited offers only. Set an expiration date and the deal automatically stops showing to travelers once it passes — no manual cleanup needed.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>CITY *</label>
                  <input value={dealForm.cityName} onChange={(e) => setDealForm({ ...dealForm, cityName: e.target.value })} placeholder="e.g. Miami" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>COUNTRY *</label>
                  <select
                    value={dealForm.country}
                    onChange={(e) => setDealForm({ ...dealForm, country: e.target.value, state: e.target.value === "United States" ? dealForm.state : "" })}
                    style={inputStyle}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                {dealForm.country === "United States" && (
                  <div>
                    <label style={labelStyle}>STATE *</label>
                    <select value={dealForm.state} onChange={(e) => setDealForm({ ...dealForm, state: e.target.value })} style={inputStyle}>
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
                  <label style={labelStyle}>BUSINESS NAME *</label>
                  <input value={dealForm.businessName} onChange={(e) => setDealForm({ ...dealForm, businessName: e.target.value })} placeholder="e.g. Fairmont Austin" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>DISCOUNT CODE (optional)</label>
                  <input value={dealForm.discountCode} onChange={(e) => setDealForm({ ...dealForm, discountCode: e.target.value })} placeholder="e.g. PRIDE10" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>DEAL LINK</label>
                  <input value={dealForm.dealLink} onChange={(e) => setDealForm({ ...dealForm, dealLink: e.target.value })} placeholder="https://..." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>VALID FROM (optional — shown to travelers, doesn't hide the deal beforehand)</label>
                  <input type="date" value={dealForm.startDate} onChange={(e) => setDealForm({ ...dealForm, startDate: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>VALID UNTIL (optional — leave blank for no expiration)</label>
                  <input type="date" value={dealForm.endDate} onChange={(e) => setDealForm({ ...dealForm, endDate: e.target.value })} style={inputStyle} />
                </div>
              </div>

              <label style={labelStyle}>DEAL DESCRIPTION *</label>
              <textarea
                value={dealForm.dealDescription}
                onChange={(e) => setDealForm({ ...dealForm, dealDescription: e.target.value })}
                placeholder='e.g. "10% off your stay — book direct and mention this offer"'
                rows={2}
                style={{ ...inputStyle, resize: "none", marginBottom: 14 }}
              />

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>IMAGE (optional)</label>
                {dealForm.imageUrl && (
                  <div style={{ marginBottom: 8 }}>
                    <img src={dealForm.imageUrl} alt="Deal" style={{ width: 160, height: 90, objectFit: "cover", borderRadius: 8 }} />
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handleDealImageSelect} disabled={uploadingDealImage} style={{ fontSize: 13, color: "#F5EFE6" }} />
                {uploadingDealImage && <p style={{ fontSize: 12, color: "#1C9C9C", marginTop: 4 }}>Uploading...</p>}
              </div>

              {dealError && <p style={{ color: "#B23A72", fontSize: 13, marginBottom: 10 }}>{dealError}</p>}

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handleDealSave}
                  disabled={dealSaving}
                  style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 20px", borderRadius: 8, border: "none", cursor: dealSaving ? "default" : "pointer" }}
                >
                  {dealSaving ? "Saving..." : saveLabel(adminRole === "admin", (dealForm.id ? deals.find((x) => x.id === dealForm.id) : null), "Deal")}
                </button>
                {dealForm.id && (
                  <button
                    onClick={() => setDealForm(emptyDealForm)}
                    style={{ background: "transparent", color: "#F5EFE699", border: "1px solid #F5EFE633", padding: "10px 20px", borderRadius: 8, cursor: "pointer" }}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <input value={dealFilterCity} onChange={(e) => setDealFilterCity(e.target.value)} placeholder="Filter by city (e.g. Miami, FL)..." style={{ ...inputStyle, maxWidth: 300 }} />
            </div>

            {deals.length === 0 && <p style={{ color: "#F5EFE699" }}>No deals yet — add one above.</p>}

            {deals.map((d) => {
              const expired = isDealExpired(d);
              const upcoming = isDealUpcoming(d);
              return (
                <div key={d.id} style={{ background: "#241640", borderRadius: 12, padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, opacity: d.active === false || expired ? 0.5 : 1, border: d.status === "pending" ? "1px solid #D9662E60" : "none" }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    {d.imageUrl && <img src={d.imageUrl} alt={d.businessName} style={{ width: 70, height: 52, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{d.businessName}</span>
                        {d.status === "pending" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#D9662E", color: "#1B1030" }}>⏳ PENDING REVIEW</span>}
                      {d.status === "needs_changes" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A72", color: "#FFFFFF" }}>↩ NEEDS CHANGES</span>}
                      {d.pendingChanges && !d.changesSentBack && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#E8B84B", color: "#1B1030" }}>CHANGES PENDING REVIEW</span>}
                      {d.pendingChanges && d.changesSentBack && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A72", color: "#FFFFFF" }}>↩ CHANGES SENT BACK</span>}
                      {d.pendingChanges && <PendingChangesNote rec={d} />}
                      <ReviewNoteBox rec={d} />
                        {upcoming && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#1C9C9C22", color: "#1C9C9C" }}>UPCOMING — visible now, valid from {d.startDate}</span>}
                        {expired && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#6B6478", color: "#F5EFE6" }}>EXPIRED</span>}
                        {d.active === false && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A7222", color: "#B23A72" }}>PAUSED</span>}
                      </div>
                      <p style={{ fontSize: 13, color: "#F5EFE6cc" }}>
                        {d.city} · {d.dealDescription}
                      </p>
                      <p style={{ fontSize: 12.5, color: "#1C9C9C", marginTop: 4, fontWeight: 600 }}>
                        {d.discountCode && `Code: ${d.discountCode} · `}
                        {d.startDate && `From ${d.startDate} `}
                        {d.endDate ? `Until ${d.endDate}` : d.startDate ? "· No end date" : "No date range set"} · {d.clicks || 0} clicks
                        {(d.createdByName || d.createdBy) && ` · added by ${d.createdByName || d.createdBy}`}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
                    {adminRole === "admin" && d.pendingChanges && !d.changesSentBack && (
                    <>
                      <button onClick={() => reviewChanges("deals", d, true, loadDeals, setDealError)} style={{ background: "#1C9C9C", color: "#1B1030", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Approve changes
                      </button>
                      <SendBackButton endpoint="deals" rec={d} adminKey={adminKey} onDone={loadDeals} style={{ background: "#1B1030", color: "#E58AB5", border: "1px solid #B23A7260", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }} />
                    </>
                  )}
                  {adminRole === "admin" && d.status === "pending" && (
                      <>
                        <button onClick={() => approveDeal(d)} style={{ background: "#1C9C9C", color: "#1B1030", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          Approve
                        </button>
                        <SendBackButton endpoint="deals" rec={d} adminKey={adminKey} onDone={loadDeals} style={{ background: "#1B1030", color: "#E58AB5", border: "1px solid #B23A7260", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }} />
                      </>
                    )}
                    <button onClick={() => toggleDealActive(d)} style={{ background: "#1B1030", color: d.active === false ? "#1C9C9C" : "#F5EFE699", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                      {d.active === false ? "Activate" : "Pause"}
                    </button>
                    <button onClick={() => startDealEdit(d)} style={{ background: "#1B1030", color: "#1C9C9C", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                      Edit
                    </button>
                    {adminRole === "admin" && (
                      <button onClick={() => handleDealDelete(d.id)} style={{ background: "#1B1030", color: "#B23A72", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Team (admin only) ----------
// Each admin and sales rep gets their own sign-in, so every entry records who
// made it (needed for commissions) and access can be removed per person.
function TeamPanel({ adminKey, inputStyle, labelStyle }) {
  const emptyForm = { name: "", email: "", role: "sales", password: "" };
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const [resetPassword, setResetPassword] = useState("");

  async function load() {
    try {
      const data = await apiCall("auth", "GET", null, adminKey, "action=users");
      setUsers(data.users || []);
    } catch (e) {
      setError("Couldn't load the team.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addMember() {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      await apiCall("auth", "POST", form, adminKey, "action=users");
      setNotice(`${form.name} can now sign in with ${form.email.trim().toLowerCase()} and the password you set. Share it with them privately.`);
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function update(id, changes, message) {
    setError("");
    setNotice("");
    try {
      await apiCall("auth", "PUT", { id, ...changes }, adminKey, "action=users");
      if (message) setNotice(message);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  const btn = { background: "#1B1030", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" };

  return (
    <>
      <div style={{ background: "#241640", borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1C9C9C" }}>Add Team Member</h2>
        <p style={{ fontSize: 12, color: "#F5EFE699", marginBottom: 14 }}>
          Give each sales rep and admin their own sign-in. Every partner, sponsorship and deal records who added it, so commissions can be credited to the right rep.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div>
            <label htmlFor="tm-name" style={labelStyle}>NAME *</label>
            <input id="tm-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="tm-email" style={labelStyle}>EMAIL *</label>
            <input id="tm-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="tm-role" style={labelStyle}>ROLE</label>
            <select id="tm-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inputStyle}>
              <option value="sales">Sales rep — entries need approval</option>
              <option value="admin">Admin — approves entries, manages team</option>
            </select>
          </div>
          <div>
            <label htmlFor="tm-pass" style={labelStyle}>STARTING PASSWORD * (10+ characters)</label>
            <input id="tm-pass" type="text" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inputStyle} />
          </div>
        </div>
        {error && <p style={{ color: "#B23A72", fontSize: 13, marginBottom: 10 }}>{error}</p>}
        {notice && <p style={{ color: "#1C9C9C", fontSize: 13, marginBottom: 10 }}>{notice}</p>}
        <button
          onClick={addMember}
          disabled={saving}
          style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "10px 20px", borderRadius: 8, border: "none", cursor: saving ? "default" : "pointer" }}
        >
          {saving ? "Adding..." : "Add Team Member"}
        </button>
      </div>

      {users.length === 0 && <p style={{ color: "#F5EFE699" }}>No team members yet — add your first sales rep above.</p>}

      {users.map((u) => (
        <div key={u.id} style={{ background: "#241640", borderRadius: 12, padding: 16, marginBottom: 10, opacity: u.active === false ? 0.55 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{u.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: u.role === "admin" ? "#D9662E22" : "#1C9C9C22", color: u.role === "admin" ? "#D9662E" : "#1C9C9C" }}>
                  {u.role === "admin" ? "ADMIN" : "SALES REP"}
                </span>
                {u.active === false && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#B23A7222", color: "#B23A72" }}>DEACTIVATED</span>}
              </div>
              <p style={{ fontSize: 13, color: "#F5EFE6cc" }}>
                {u.email} · {u.lastLoginAt ? `last signed in ${new Date(u.lastLoginAt).toLocaleDateString()}` : "hasn't signed in yet"}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => { setResetFor(resetFor === u.id ? null : u.id); setResetPassword(""); }} style={{ ...btn, color: "#1C9C9C" }}>
                Reset password
              </button>
              <button
                onClick={() => update(u.id, { role: u.role === "admin" ? "sales" : "admin" }, `${u.name} is now ${u.role === "admin" ? "a sales rep" : "an admin"}.`)}
                style={{ ...btn, color: "#F5EFE699" }}
              >
                Make {u.role === "admin" ? "sales rep" : "admin"}
              </button>
              <button
                onClick={() => {
                  if (u.active !== false && !window.confirm(`Deactivate ${u.name}? They'll be signed out and can't sign in until reactivated. Their entries stay.`)) return;
                  update(u.id, { active: u.active === false }, u.active === false ? `${u.name} can sign in again.` : `${u.name} has been deactivated.`);
                }}
                style={{ ...btn, color: u.active === false ? "#1C9C9C" : "#B23A72" }}
              >
                {u.active === false ? "Reactivate" : "Deactivate"}
              </button>
            </div>
          </div>
          {resetFor === u.id && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <input
                type="text"
                autoComplete="new-password"
                aria-label={`New password for ${u.name}`}
                placeholder="New password (10+ characters)"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                style={{ ...inputStyle, maxWidth: 280 }}
              />
              <button
                onClick={async () => {
                  await update(u.id, { password: resetPassword }, `Password updated for ${u.name}. Share it with them privately.`);
                  setResetFor(null);
                  setResetPassword("");
                }}
                style={{ background: "#D9662E", color: "#1B1030", fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer" }}
              >
                Save password
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
