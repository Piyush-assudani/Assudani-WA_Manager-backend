const express = require("express");
const router = express.Router();
const localDb = require("../db/localDb");
const baileysService = require("../services/baileysService");
const metaApi = require("../services/metaApi");

/**
 * POST /api/integrations/lead
 * Universal incoming webhook for Google Sheets / Google Forms / Zapier
 * Automatically registers contact and shoots instant WhatsApp confirmation!
 */
router.post("/lead", async (req, res) => {
  const { name, phone, email, notes, custom_message } = req.body || {};

  if (!phone) {
    return res.status(400).json({ error: "Phone number is required." });
  }

  const cleanPhone = String(phone).replace(/\D/g, "");

  // Find or create contact
  let contact = localDb.findOne("contacts", (c) => c.phone_number === cleanPhone);
  if (!contact) {
    contact = localDb.insert("contacts", {
      name: name || "Google Form Lead",
      phone_number: cleanPhone,
      email: email || "",
      tags: ["Google Lead", "New Lead"],
      notes: notes || "Auto-imported from Google Sheets / Form integration",
    });
  } else {
    // Append tag
    const currentTags = Array.isArray(contact.tags) ? contact.tags : [];
    if (!currentTags.includes("Google Lead")) currentTags.push("Google Lead");
    localDb.update("contacts", (c) => c.id === contact.id, {
      name: name || contact.name,
      tags: currentTags,
    });
  }

  // Construct instant message
  const clientName = name || "Sir/Madam";
  const defaultText = `Namaste ${clientName}! Assudani Group me aapka swagat hai. Aapki enquiry hume prapt ho gayi hai. Humari team aapse jald hi sampark karegi. Dhanyawad!`;
  const messageToSend = custom_message || defaultText;

  let shootResult = null;
  const qrStatus = baileysService.getStatus();

  try {
    if (qrStatus.status === "CONNECTED") {
      shootResult = await baileysService.sendTextMessage(cleanPhone, messageToSend);
    } else if (process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.META_ACCESS_TOKEN) {
      shootResult = await metaApi.sendTextMessage(cleanPhone, messageToSend);
    }
  } catch (err) {
    console.error("Auto-sync message shoot error:", err.message);
  }

  return res.json({
    success: true,
    message: "Lead processed successfully.",
    contact,
    auto_message_dispatched: Boolean(shootResult?.success),
    shoot_details: shootResult,
  });
});

/**
 * POST /api/campaigns/:id/retry
 * 1-click retry for failed numbers in a campaign
 */
router.post("/campaigns/:id/retry", async (req, res) => {
  const result = localDb.retryFailedCampaignNumbers(req.params.id);
  if (!result.success) {
    return res.status(400).json(result);
  }

  // Background dispatch retries
  const failedNumbers = result.numbers;
  let reDelivered = 0;

  for (const phone of failedNumbers) {
    try {
      const qrStatus = baileysService.getStatus();
      if (qrStatus.status === "CONNECTED") {
        await baileysService.sendTextMessage(phone, "Resending your message - Assudani WA Manager");
        reDelivered++;
      }
    } catch (e) {
      // Continue
    }
  }

  localDb.update("campaigns", (c) => c.id === req.params.id, {
    status: "completed",
    sent_count: (localDb.findOne("campaigns", (c) => c.id === req.params.id)?.sent_count || 0) + reDelivered,
  });

  res.json({
    success: true,
    message: `Retried ${failedNumbers.length} recipient(s). ${reDelivered} redelivered.`,
  });
});

module.exports = router;
