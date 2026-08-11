// Vercel serverless function — proxies image search requests to Unsplash.
// Set UNSPLASH_ACCESS_KEY in your Vercel project's Environment Variables.
// Get a free key at https://unsplash.com/developers (create an app, use its Access Key).

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

  const query = req.query.query;
  if (!query || query.length > 200) {
    res.status(400).json({ error: "Missing or invalid 'query' param" });
    return;
  }

  if (!process.env.UNSPLASH_ACCESS_KEY) {
    // Fail quietly with a clear reason — the frontend just skips the image if this happens.
    res.status(501).json({ error: "UNSPLASH_ACCESS_KEY is not configured on the server" });
    return;
  }

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` },
    });
    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    const photo = data.results?.[0];
    if (!photo) {
      res.status(404).json({ error: "No image found" });
      return;
    }

    // Required by Unsplash API guidelines: attribute the photographer and Unsplash.
    res.status(200).json({
      url: photo.urls.regular,
      photographer: photo.user?.name || "Unsplash",
      photographerUrl: `${photo.user?.links?.html}?utm_source=funmaps&utm_medium=referral`,
      unsplashUrl: "https://unsplash.com/?utm_source=funmaps&utm_medium=referral",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to reach Unsplash" });
  }
};
