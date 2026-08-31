// Vercel serverless function.
// Keeps ANTHROPIC_API_KEY on the server — never exposed to the browser.
// Set ANTHROPIC_API_KEY in your Vercel project's Environment Variables.

// Only your own site is allowed to call this — stops other websites from
// embedding calls to your API and running up your bill on their traffic.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*"; // set to https://guide.funmaps.com (or your real domain) in Vercel env vars once ready

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { system, messages, max_tokens } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "Missing 'messages' in request body" });
    return;
  }

  // Basic size caps — prevents someone sending huge payloads to run up cost/load.
  const totalLen = JSON.stringify(messages).length + (system || "").length;
  if (totalLen > 20000) {
    res.status(413).json({ error: "Request too large" });
    return;
  }
  const cappedTokens = Math.min(max_tokens || 4096, 8000);

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server" });
    return;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: cappedTokens,
        system,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to reach Claude API" });
  }
}

// Explicitly request the maximum function duration Vercel's Hobby plan allows
// (60s) instead of relying on the default, which can be as low as 5-10s —
// itinerary generation for longer/multi-city trips can genuinely take longer
// than that default, causing the request to be killed mid-generation.
handler.config = { maxDuration: 60 };

module.exports = handler;
