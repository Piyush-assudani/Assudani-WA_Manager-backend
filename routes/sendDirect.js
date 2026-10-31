const express = require("express");
const router = express.Router();
const baileysService = require("../services/baileysService");
const metaApi = require("../services/metaApi");

/**
 * Middleware: Verify API Key for direct external project access
 */
const verifyApiKey = (req, res, next) => {
  const configuredKey =
    process.env.ASSUDANI_API_KEY ||
    process.env.QR_API_KEY ||
    "assudani_api_key_2026";

  const providedKey =
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.query.api_key;

  // Panel requests
  if (req.headers["x-from-panel"] === "true") {
    return next();
  }

  if (providedKey && providedKey === configuredKey) {
    return next();
  }

  // Also accept default development key if none set in .env
  if (!providedKey && !process.env.ASSUDANI_API_KEY && !process.env.QR_API_KEY) {
    return next();
  }

  if (providedKey !== configuredKey) {
    return res.status(401).json({
      error: "Unauthorized: Invalid or missing API Key. Pass 'x-api-key: assudani_api_key_2026' header.",
    });
  }

  next();
};

/**
 * GET /api/send/info
 * Documentation & integration endpoints for external projects
 */
router.get("/info", (req, res) => {
  const host = req.get("host") || "localhost:5001";
  const protocol = req.protocol || "http";
  const baseUrl = `${protocol}://${host}`;
  const apiKey =
    process.env.ASSUDANI_API_KEY ||
    process.env.QR_API_KEY ||
    "assudani_api_key_2026";

  const qrStatus = baileysService.getStatus();
  const hasMeta = Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.META_ACCESS_TOKEN
  );

  res.json({
    app: "Assudani WA Manager - Universal Dispatcher API",
    endpoint: `${baseUrl}/api/send`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    active_engines: {
      qr_session: qrStatus.status === "CONNECTED" ? "ONLINE" : "OFFLINE",
      qr_connected_user: qrStatus.userInfo,
      meta_cloud_api: hasMeta ? "CONFIGURED" : "PENDING_CONFIG",
    },
    example_payload: {
      to: "919876543210",
      message: "Hello from my external website / app!",
      mediaUrl: "https://example.com/image.jpg",
      caption: "Check this image",
      engine: "auto",
    },
    snippets: {
      curl: `curl -X POST "${baseUrl}/api/send" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey}" \\
  -d '{"to": "919876543210", "message": "Hello from external project!"}'`,
      node: `const axios = require('axios');

async function shootWhatsApp(to, message, mediaUrl = null) {
  const res = await axios.post('${baseUrl}/api/send', {
    to: to,
    message: message,
    mediaUrl: mediaUrl,
    engine: 'auto'
  }, {
    headers: { 'x-api-key': '${apiKey}' }
  });
  return res.data;
}`,
      python: `import requests

def shoot_whatsapp(to, message, media_url=None):
    url = "${baseUrl}/api/send"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": "${apiKey}"
    }
    payload = {
        "to": to,
        "message": message,
        "mediaUrl": media_url,
        "engine": "auto"
    }
    response = requests.post(url, json=payload, headers=headers)
    return response.json()`,
    },
  });
});

/**
 * POST /api/send
 * Direct WhatsApp Message Shooting API for ANY project!
 */
router.post("/", verifyApiKey, async (req, res) => {
  const { to, message, mediaUrl, caption, type, engine = "auto" } = req.body || {};

  if (!to) {
    return res.status(400).json({
      error: "Recipient phone number ('to') is required. Example: '919876543210'",
    });
  }

  if (!message && !mediaUrl) {
    return res.status(400).json({
      error: "Either 'message' (text) or 'mediaUrl' must be provided.",
    });
  }

  const qrStatus = baileysService.getStatus();
  const hasMeta = Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.META_ACCESS_TOKEN
  );

  // Determine which engine to use
  let selectedEngine = engine;
  if (selectedEngine === "auto") {
    if (qrStatus.status === "CONNECTED") {
      selectedEngine = "qr";
    } else if (hasMeta) {
      selectedEngine = "cloud";
    } else {
      return res.status(503).json({
        success: false,
        error:
          "Neither WhatsApp Web QR session nor Meta Cloud API is currently active. Open Assudani WA Manager panel to link WhatsApp.",
        engines: {
          qr_session: qrStatus.status,
          meta_cloud_api: hasMeta ? "READY" : "NOT_CONFIGURED",
        },
      });
    }
  }

  // Engine 1: WhatsApp Web QR Engine (Baileys)
  if (selectedEngine === "qr") {
    if (qrStatus.status !== "CONNECTED") {
      return res.status(503).json({
        success: false,
        error: "WhatsApp Web session is not currently connected. Please scan QR in panel.",
        status: qrStatus.status,
      });
    }

    try {
      let result;
      if (mediaUrl) {
        result = await baileysService.sendMediaMessage(to, {
          mediaUrl,
          caption: caption || message || "",
          type: type || "image",
        });
      } else {
        result = await baileysService.sendTextMessage(to, message);
      }

      if (!result.success) {
        return res.status(502).json({ success: false, ...result });
      }

      return res.json({
        success: true,
        engine: "qr_multi_device",
        messageId: result.messageId,
        to: result.to,
        timestamp: result.timestamp,
        message: "Message shot successfully via linked WhatsApp Web instance.",
      });
    } catch (err) {
      console.error("QR send direct error:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Engine 2: Meta WhatsApp Cloud API
  if (selectedEngine === "cloud") {
    if (!hasMeta) {
      return res.status(503).json({
        success: false,
        error: "Meta WhatsApp Cloud API credentials are not set in .env.",
      });
    }

    try {
      let result;
      if (mediaUrl) {
        result = await metaApi.sendMediaMessage(to, mediaUrl, type || "image", caption || message);
      } else {
        result = await metaApi.sendTextMessage(to, message);
      }

      if (!result.success) {
        return res.status(502).json({ success: false, error: result.error });
      }

      return res.json({
        success: true,
        engine: "meta_cloud_api",
        messageId: result.messageId,
        to,
        timestamp: new Date().toISOString(),
        message: "Message shot successfully via Meta Cloud API.",
      });
    } catch (err) {
      console.error("Meta send direct error:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(400).json({
    error: "Invalid engine specified. Choose 'auto', 'qr', or 'cloud'.",
  });
});

module.exports = router;

