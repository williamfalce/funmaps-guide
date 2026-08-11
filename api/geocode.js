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

  const q = req.query.q;
  if (!q || q.length > 200) {
    res.status(400).json({ error: "Missing or invalid 'q' param" });
    return;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "FunMapsCompass/1.0 (https://funmaps.com)" },
    });
    const data = await response.json();

    const result = data?.[0];
    if (!result) {
      res.status(404).json({ error: "No location found" });
      return;
    }

    res.status(200).json({ lat: parseFloat(result.lat), lon: parseFloat(result.lon) });
  } catch (err) {
    res.status(500).json({ error: "Failed to reach geocoding service" });
  }
};
