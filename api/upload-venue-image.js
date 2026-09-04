// Vercel serverless function — handles Premium tier venue image uploads.
// Stores the image in Vercel Blob storage and returns a public URL.
//
// Requires the BLOB_READ_WRITE_TOKEN environment variable, which Vercel
// auto-provisions once you enable Blob storage on this project:
// Vercel Dashboard -> your project -> Storage tab -> Create Database -> Blob.

const { put } = require("@vercel/blob");

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const MAX_BYTES = 2 * 1024 * 1024; // 2MB — plenty for a "small" venue photo, keeps things fast

function checkAdmin(req) {
  const key = req.headers["x-admin-key"];
  return !!process.env.ADMIN_PASSWORD && key === process.env.ADMIN_PASSWORD;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!checkAdmin(req)) {
    res.status(401).json({ error: "Invalid admin key" });
    return;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res.status(501).json({ error: "Image storage not configured — enable Blob storage for this project in the Vercel dashboard (Storage tab)." });
    return;
  }

  try {
    const { imageDataUrl, filename } = req.body || {};
    if (!imageDataUrl || !filename) {
      res.status(400).json({ error: "Missing imageDataUrl or filename" });
      return;
    }

    const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: "Invalid image data" });
      return;
    }
    const [, mimeType, base64] = match;
    const buffer = Buffer.from(base64, "base64");

    if (buffer.length > MAX_BYTES) {
      res.status(413).json({ error: "Image too large — please use a smaller image (under 2MB)." });
      return;
    }

    const safeFilename = `venue-photos/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const blob = await put(safeFilename, buffer, {
      access: "public",
      contentType: mimeType,
    });

    res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
};
