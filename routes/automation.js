const express = require("express");
const router = express.Router();
const localDb = require("../db/localDb");
const baileysService = require("../services/baileysService");
const metaApi = require("../services/metaApi");

/**
 * GET /api/automation/rules
 * Fetch all chatbot keyword auto-reply rules
 */
router.get("/rules", (req, res) => {
  res.json(localDb.getAutoReplies());
});

/**
 * POST /api/automation/rules
 * Create or update keyword rule
 */
router.post("/rules", (req, res) => {
  const { id, keyword, match_type, reply_text, reply_media_url, is_active } = req.body || {};

  if (!keyword || !reply_text) {
    return res.status(400).json({ error: "Keyword and reply_text are required." });
  }

  const rule = localDb.saveAutoReply({
    id,
    keyword: String(keyword).trim().toLowerCase(),
    match_type: match_type || "contains",
    reply_text,
    reply_media_url: reply_media_url || null,
    is_active: is_active !== false,
  });

  res.json({ success: true, rule });
});

/**
 * DELETE /api/automation/rules/:id
 * Delete a rule
 */
router.delete("/rules/:id", (req, res) => {
  const count = localDb.deleteAutoReply(req.params.id);
  res.json({ success: true, deleted: count > 0 });
});

/**
 * GET /api/automation/settings
 * Fetch Away & Greeting message configuration
 */
router.get("/settings", (req, res) => {
  res.json(localDb.getAwaySettings());
});

/**
 * POST /api/automation/settings
 * Update Away & Greeting settings
 */
router.post("/settings", (req, res) => {
  const updated = localDb.updateAwaySettings(req.body || {});
  res.json({ success: true, settings: updated });
});

/**
 * GET /api/automation/quick-replies
 * Fetch all canned shortcuts (/bank, /address, /pricing, etc.)
 */
router.get("/quick-replies", (req, res) => {
  res.json(localDb.getQuickReplies());
});

/**
 * POST /api/automation/quick-replies
 * Save a canned shortcut
 */
router.post("/quick-replies", (req, res) => {
  const { id, shortcut, title, content } = req.body || {};
  if (!shortcut || !content) {
    return res.status(400).json({ error: "Shortcut (e.g. /bank) and content are required." });
  }

  const item = localDb.saveQuickReply({
    id,
    shortcut: shortcut.startsWith("/") ? shortcut : `/${shortcut}`,
    title: title || shortcut,
    content,
  });

  res.json({ success: true, quick_reply: item });
});

/**
 * DELETE /api/automation/quick-replies/:id
 * Delete a canned shortcut
 */
router.delete("/quick-replies/:id", (req, res) => {
  const count = localDb.deleteQuickReply(req.params.id);
  res.json({ success: true, deleted: count > 0 });
});

/**
 * POST /api/automation/test-incoming
 * Helper endpoint to test chatbot rules against any incoming text!
 */
router.post("/test-incoming", (req, res) => {
  const { text, phone = "919413879444" } = req.body || {};
  const matched = localDb.matchAutoReply(text);
  const awayOrWelcome = !matched ? localDb.checkAwayOrWelcome(phone, false) : null;

  res.json({
    incoming_text: text,
    matched_rule: matched,
    away_or_welcome: awayOrWelcome,
    triggered_reply: matched ? matched.reply_text : (awayOrWelcome ? awayOrWelcome.message : null),
  });
});

module.exports = router;
