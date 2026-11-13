// Vercel serverless function — proxies geocoding requests to Nominatim (OpenStreetMap).
// Free, no API key required. Nominatim's usage policy requires a descriptive
// User-Agent identifying the app — do not remove it or bulk-request without delay.
// Policy: https://operations.osmfoundation.org/policies/nominatim/

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*"; // set to https://guide.funmaps.com (or your real domain) in Vercel env vars once ready

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const q = String(req.query.q || "").trim();
  if (!q || q.length > 300) {
    res.status(400).json({ error: "Missing or invalid 'q' param" });
    return;
  }

  // Try the address as written, then simplified versions: a full address
  // with the city added twice, or ending in the country, often finds nothing.
  const parts = q.split(",").map((x) => x.trim()).filter(Boolean);
  const seen = new Set();
  const deduped = parts.filter((p) => {
    const k = p.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const noCountry = deduped.filter((p) => !/^(united states|usa|us)$/i.test(p));
  const candidates = [...new Set([q, deduped.join(", "), noCountry.join(", "), noCountry.slice(0, 3).join(", ")])].filter(Boolean);

  try {
    for (const candidate of candidates) {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(candidate)}`;
      const response = await fetch(url, {
        headers: { "User-Agent": "FunMapsCompass/1.0 (https://funmaps.com)" },
      });
      const data = await response.json();
      const result = data?.[0];
      if (result) {
        res.status(200).json({ lat: parseFloat(result.lat), lon: parseFloat(result.lon), matched: result.display_name });
        return;
      }
      await new Promise((r) => setTimeout(r, 1100)); // Nominatim allows about one request a second
    }
    res.status(404).json({ error: "No location found" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reach geocoding service" });
  }
};
