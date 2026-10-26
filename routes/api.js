const express = require("express");
const router = express.Router();

const { getAccountHealth } = require("../services/metaApi");

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

router.get("/account-health", async (req, res) => {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!phoneId || !accessToken) {
    return res.json({
      status: "PENDING_CONFIG",
      display_phone_number: "Not Configured",
      quality_rating: "UNKNOWN",
      messaging_limit_tier: "TIER_250",
      configured: false,
      message: "Meta Cloud API credentials (WHATSAPP_PHONE_NUMBER_ID / META_ACCESS_TOKEN) not yet set in backend .env.",
    });
  }

  try {
    const result = await getAccountHealth();
    if (result.success && result.data) {
      return res.json({
        ...result.data,
        configured: true,
      });
    } else {
      return res.json({
        status: "DISCONNECTED",
        display_phone_number: "Unavailable",
        quality_rating: "UNKNOWN",
        messaging_limit_tier: "TIER_250",
        configured: false,
        error: result.error,
        message: result.error || "Unable to reach Meta Cloud API. Please verify token.",
      });
    }
  } catch (err) {
    console.error("❌ Account health route error:", err);
    return res.json({
      status: "ERROR",
      quality_rating: "UNKNOWN",
      messaging_limit_tier: "TIER_250",
      configured: false,
      error: err.message,
      message: "Failed to connect to Meta Cloud API.",
    });
  }
});

module.exports = router;
