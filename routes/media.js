const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../db");
const { uploadFileToServer, deleteFileFromServer } = require("../services/localStorageService");
const { uploadMediaToMeta } = require("../services/metaApi");
const os = require("os");

const isValidUuid = (val) =>
  typeof val === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 32 * 1024 * 1024 }, // 32MB limit for server storage
});

// GET /api/media - list all media assets
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM media_assets ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ List media error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/media - upload media directly to server storage
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    let resourceType = "auto";
    if (req.file.mimetype.startsWith("image/")) resourceType = "image";
    if (req.file.mimetype.startsWith("video/")) resourceType = "video";
    if (req.file.mimetype.startsWith("audio/")) resourceType = "audio";

    // Store file directly on local server filesystem
    const mediaUrl = await uploadFileToServer(req.file.path, "library", resourceType);

    // Optional Meta media upload if credentials are provided
    let metaMediaId = null;
    try {
      metaMediaId = await uploadMediaToMeta(req.file.path, req.file.mimetype);
    } catch (metaErr) {
      console.warn("⚠️ Meta upload skipped/failed, saved to server storage:", metaErr.message);
    }

    // Save to database
    const result = await db.query(
      `INSERT INTO media_assets (original_name, media_url, meta_media_id, resource_type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.file.originalname, mediaUrl, metaMediaId, resourceType]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Media upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/media/:id - delete media from DB and server filesystem
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({ error: "Invalid media ID format." });
    }

    const existing = await db.query(`SELECT media_url FROM media_assets WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Media asset not found." });
    }

    await deleteFileFromServer(existing.rows[0].media_url);
    await db.query(`DELETE FROM media_assets WHERE id = $1`, [id]);
    res.json({ message: "Media deleted successfully from server" });
  } catch (err) {
    console.error("❌ Media delete error:", err);
    res.status(500).json({ error: "Failed to delete media asset." });
  }
});

module.exports = router;
