// Vercel serverless function — handles Premium tier venue image uploads.
// Stores the image in Vercel Blob storage and returns a public URL.
//
// Works with either of Vercel's two Blob auth methods automatically — the
// newer default (BLOB_STORE_ID + an auto-rotated OIDC token) or the older
// static BLOB_READ_WRITE_TOKEN — since the @vercel/blob SDK resolves whichever
// is actually present on its own. We don't need to check for one specifically.

const { put } = require("@vercel/blob");

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const MAX_BYTES = 2 * 1024 * 1024; // 2MB — plenty for a "small" venue photo, keeps things fast

const { getRedis, getAuth } = require("./_auth");

// Admins and sales reps can both upload images: a pending Partner or Deal
// submission with a photo attached is a normal part of the sales workflow.
async function checkAdmin(req) {
  const auth = await getAuth(req, getRedis());
  return !!auth;
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

  if (!await checkAdmin(req)) {
    res.status(401).json({ error: "Invalid admin key" });
    return;
  }

  try {
    // Copy an existing image from the current funmaps.com (WordPress) into
    // our own storage, so it keeps working after the old site moves.
    // Admins only; only funmaps.com addresses are fetched.
    if ((req.body || {}).copyFromUrl) {
      const auth = await getAuth(req, getRedis());
      if (!auth || auth.role !== "admin") {
        res.status(403).json({ error: "Only an admin can copy images" });
        return;
      }
      let src;
      try {
        src = new URL(String(req.body.copyFromUrl));
      } catch {
        res.status(400).json({ error: "Not a web address" });
        return;
      }
      if (src.protocol !== "https:" || !["funmaps.com", "www.funmaps.com"].includes(src.hostname)) {
        res.status(400).json({ error: "Only images on funmaps.com can be copied" });
        return;
      }
      const r = await fetch(src.href, { redirect: "error" });
      const type = (r.headers.get("content-type") || "").split(";")[0].trim();
      if (!r.ok || !/^image\/(jpeg|png|webp|avif|gif)$/.test(type)) {
        res.status(400).json({ error: `Couldn't fetch that image (${r.status})` });
        return;
      }
      const buffer = Buffer.from(await r.arrayBuffer());
      if (buffer.length > 5 * 1024 * 1024) {
        res.status(413).json({ error: "That image is over 5 MB" });
        return;
      }
      const name = src.pathname.split("/").pop().replace(/[^a-zA-Z0-9.-]/g, "_");
      const blob = await put(`venue-photos/${Date.now()}-${name}`, buffer, { access: "public", contentType: type });
      res.status(200).json({ url: blob.url });
      return;
    }

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
    res.status(500).json({ error: `Upload failed: ${err.message || "unknown error"}` });
  }
};
