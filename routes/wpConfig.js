const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const os = require("os");

const ENV_PATH = path.resolve(__dirname, "../.env");
const ALLOWED_WP_KEYS = [
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "META_ACCESS_TOKEN",
  "META_API_VERSION",
  "WEBHOOK_VERIFY_TOKEN",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1MB max for env file
});

/**
 * Safely parse an existing .env file into key-value map while preserving non-WP keys
 */
const readExistingEnv = () => {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  const envMap = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      // Remove enclosing quotes if present
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.substring(1, val.length - 1);
      }
      envMap[key] = val;
    }
  }
  return envMap;
};

/**
 * Write updated key-values into .env safely
 */
const saveEnvMap = (envMap) => {
  const lines = [
    "# ==============================================================",
    "# Assudani WA Manager - Configuration",
    `# Last updated: ${new Date().toISOString()}`,
    "# ==============================================================",
    "",
  ];

  // Group WhatsApp keys together cleanly
  const wpKeys = [];
  const otherKeys = [];

  for (const [k, v] of Object.entries(envMap)) {
    if (ALLOWED_WP_KEYS.includes(k)) {
      wpKeys.push(`${k}=${v}`);
    } else {
      otherKeys.push(`${k}=${v}`);
    }
  }

  if (otherKeys.length > 0) {
    lines.push("# Server & System Configuration");
    lines.push(...otherKeys);
    lines.push("");
  }

  lines.push("# Meta WhatsApp Cloud API Configuration");
  lines.push(...wpKeys);
  lines.push("");

  fs.writeFileSync(ENV_PATH, lines.join("\n"), "utf-8");
};

/**
 * Mask token for UI preview
 */
const maskToken = (token) => {
  if (!token) return "";
  if (token.length <= 12) return "••••••••••••";
  return `${token.substring(0, 6)}••••••••${token.substring(token.length - 4)}`;
};

/**
 * GET /api/wp-config
 * Fetch current WhatsApp configuration & Webhook URLs
 */
router.get("/", (req, res) => {
  const host = req.get("host") || "localhost:5001";
  const protocol = req.protocol || "http";
  const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;

  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
  const metaToken = process.env.META_ACCESS_TOKEN || "";
  const apiVersion = process.env.META_API_VERSION || "v17.0";
  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN || "";

  res.json({
    phone_number_id: phoneId,
    business_account_id: wabaId,
    meta_access_token_masked: maskToken(metaToken),
    has_meta_token: Boolean(metaToken),
    meta_api_version: apiVersion,
    webhook_verify_token: verifyToken,
    webhook_url: `${baseUrl}/webhook`,
    fallback_url: `${baseUrl}/webhook`,
    health_url: `${baseUrl}/api/health`,
    base_url: baseUrl,
    is_configured: Boolean(phoneId && metaToken),
  });
});

/**
 * POST /api/wp-config
 * Update WhatsApp configuration from form fields
 */
router.post("/", (req, res) => {
  try {
    const {
      phone_number_id,
      business_account_id,
      meta_access_token,
      meta_api_version,
      webhook_verify_token,
    } = req.body || {};

    const existing = readExistingEnv();

    if (phone_number_id !== undefined) {
      existing["WHATSAPP_PHONE_NUMBER_ID"] = String(phone_number_id).trim();
      process.env.WHATSAPP_PHONE_NUMBER_ID = String(phone_number_id).trim();
    }
    if (business_account_id !== undefined) {
      existing["WHATSAPP_BUSINESS_ACCOUNT_ID"] = String(business_account_id).trim();
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = String(business_account_id).trim();
    }
    if (meta_access_token !== undefined && meta_access_token.trim() !== "") {
      // Don't overwrite if user didn't change masked string
      if (!meta_access_token.includes("••••")) {
        existing["META_ACCESS_TOKEN"] = String(meta_access_token).trim();
        process.env.META_ACCESS_TOKEN = String(meta_access_token).trim();
      }
    }
    if (meta_api_version !== undefined) {
      existing["META_API_VERSION"] = String(meta_api_version).trim() || "v17.0";
      process.env.META_API_VERSION = String(meta_api_version).trim() || "v17.0";
    }
    if (webhook_verify_token !== undefined) {
      existing["WEBHOOK_VERIFY_TOKEN"] = String(webhook_verify_token).trim();
      process.env.WEBHOOK_VERIFY_TOKEN = String(webhook_verify_token).trim();
    }

    saveEnvMap(existing);

    return res.json({
      success: true,
      message: "WhatsApp Cloud API configuration updated successfully.",
      config: {
        phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
        business_account_id: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
        has_meta_token: Boolean(process.env.META_ACCESS_TOKEN),
        webhook_verify_token: process.env.WEBHOOK_VERIFY_TOKEN || "",
        meta_api_version: process.env.META_API_VERSION || "v17.0",
      },
    });
  } catch (err) {
    console.error("Save WP config error:", err.message);
    res.status(500).json({ error: "Failed to update configuration: " + err.message });
  }
});

/**
 * POST /api/wp-config/upload-env
 * Upload .env file or raw text to configure only WhatsApp variables
 */
router.post("/upload-env", upload.single("envFile"), (req, res) => {
  try {
    let rawContent = "";

    if (req.file) {
      rawContent = req.file.buffer.toString("utf-8");
    } else if (req.body && req.body.rawContent) {
      rawContent = req.body.rawContent;
    } else {
      return res.status(400).json({ error: "No .env file or content uploaded." });
    }

    const lines = rawContent.split(/\r?\n/);
    const updatedKeys = {};
    const existing = readExistingEnv();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const rawKey = trimmed.substring(0, eqIdx).trim();
        let rawVal = trimmed.substring(eqIdx + 1).trim();

        if (
          (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
          (rawVal.startsWith("'") && rawVal.endsWith("'"))
        ) {
          rawVal = rawVal.substring(1, rawVal.length - 1);
        }

        // Only allow WhatsApp related keys for safety!
        if (ALLOWED_WP_KEYS.includes(rawKey)) {
          existing[rawKey] = rawVal;
          process.env[rawKey] = rawVal;
          updatedKeys[rawKey] = rawKey === "META_ACCESS_TOKEN" ? maskToken(rawVal) : rawVal;
        }
      }
    }

    if (Object.keys(updatedKeys).length === 0) {
      return res.status(400).json({
        error:
          "No recognized WhatsApp configuration variables found in file. Supported keys: " +
          ALLOWED_WP_KEYS.join(", "),
      });
    }

    saveEnvMap(existing);

    return res.json({
      success: true,
      message: `Successfully loaded and saved ${Object.keys(updatedKeys).length} WhatsApp setting(s).`,
      updatedKeys,
    });
  } catch (err) {
    console.error("Upload env error:", err.message);
    res.status(500).json({ error: "Failed to parse env file: " + err.message });
  }
});

module.exports = router;

