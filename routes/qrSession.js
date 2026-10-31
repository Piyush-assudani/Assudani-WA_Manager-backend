const express = require("express");
const router = express.Router();
const baileysService = require("../services/baileysService");

/**
 * Middleware: Verify API key for external project requests (if configured)
 */
const verifyApiKey = (req, res, next) => {
  const configuredKey = process.env.QR_API_KEY || "assudani_qr_external_key_2026";
  const providedKey =
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.query.api_key;

  // If user passed from frontend with auth token or internal request, allow
  if (req.headers["x-from-panel"] === "true") {
    return next();
  }

  // If external key matches
  if (providedKey && providedKey === configuredKey) {
    return next();
  }

  // Also allow if no key is enforced or default dev key matches
  if (!providedKey && !process.env.QR_API_KEY) {
    return next();
  }

  if (providedKey !== configuredKey) {
    return res.status(401).json({
      error: "Unauthorized: Invalid or missing API Key. Pass 'x-api-key: your_key' header.",
    });
  }

  next();
};

/**
 * GET /api/qr-session/status
 * Get current session state, QR code (if any), and linked user details
 */
router.get("/status", (req, res) => {
  const status = baileysService.getStatus();
  res.json({
    ...status,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/qr-session/start
 * Initiate or refresh Baileys QR generation
 */
router.post("/start", async (req, res) => {
  try {
    const io = req.app.get("io");
    baileysService.initBaileys(io);
    res.json({
      success: true,
      message: "WhatsApp session connection initiated.",
      status: baileysService.getStatus(),
    });
  } catch (err) {
    console.error("Failed to start session:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/qr-session/logout
 * Disconnect and wipe WhatsApp Web session
 */
router.post("/logout", async (req, res) => {
  try {
    const result = await baileysService.logoutBaileys();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/qr-session/mode
 * Change active WhatsApp mode ('qr' or 'api')
 */
router.post("/mode", (req, res) => {
  const { mode } = req.body || {};
  if (mode !== "api" && mode !== "qr") {
    return res.status(400).json({ error: "Invalid mode. Choose 'api' or 'qr'." });
  }

  const result = baileysService.setActiveMode(mode);
  res.json(result);
});

/**
 * POST /api/qr-session/send-message
 * External & internal API to send WhatsApp messages through the linked session!
 * Usable by other projects, scripts, or automations!
 */
router.post("/send-message", verifyApiKey, async (req, res) => {
  const { to, message, mediaUrl, caption, type } = req.body || {};

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

  const status = baileysService.getStatus();
  if (status.status !== "CONNECTED") {
    return res.status(503).json({
      error: "WhatsApp Web is not currently connected. Please link your WhatsApp in the Assudani WA Manager panel first.",
      status: status.status,
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
      return res.status(502).json(result);
    }

    return res.json({
      success: true,
      message: "WhatsApp message dispatched successfully via linked session.",
      details: result,
    });
  } catch (err) {
    console.error("Send message error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/qr-session/integration-info
 * Returns copy-paste integration endpoints & code snippets for other projects
 */
router.get("/integration-info", (req, res) => {
  const host = req.get("host") || "localhost:5001";
  const protocol = req.protocol || "http";
  const baseUrl = `${protocol}://${host}`;
  const apiKey = process.env.QR_API_KEY || "assudani_qr_external_key_2026";
  const status = baileysService.getStatus();

  res.json({
    app: "Assudani WA Manager",
    connection_status: status.status,
    connected_user: status.userInfo,
    active_mode: status.activeMode,
    external_api: {
      send_message_url: `${baseUrl}/api/qr-session/send-message`,
      status_url: `${baseUrl}/api/qr-session/status`,
      method: "POST",
      api_key: apiKey,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      curl_example: `curl -X POST "${baseUrl}/api/qr-session/send-message" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey}" \\
  -d '{"to": "919876543210", "message": "Hello from external project!"}'`,
      node_example: `const axios = require('axios');

async function sendWhatsApp(to, message) {
  const res = await axios.post('${baseUrl}/api/qr-session/send-message', {
    to: to,
    message: message
  }, {
    headers: { 'x-api-key': '${apiKey}' }
  });
  return res.data;
}`,
      python_example: `import requests

def send_whatsapp(to, message):
    url = "${baseUrl}/api/qr-session/send-message"
    headers = {"x-api-key": "${apiKey}", "Content-Type": "application/json"}
    payload = {"to": to, "message": message}
    response = requests.post(url, json=payload, headers=headers)
    return response.json()`,
    },
  });
});

module.exports = router;

