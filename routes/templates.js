const express = require("express");
const router = express.Router();
const { getTemplates, createTemplate } = require("../services/metaApi");
const localDb = require("../db/localDb");
const { v4: uuidv4 } = require("uuid");

// In-memory cache for Meta templates
let templateCache = null;
let templateCacheTime = 0;
const TEMPLATE_CACHE_TTL = 60 * 1000; // 60 seconds

// Default seeded direct templates if empty
const DEFAULT_DIRECT_TEMPLATES = [
  {
    id: "tpl_dir_order_confirm",
    name: "order_confirmation",
    title: "Order Confirmation Note",
    source: "direct",
    category: "UTILITY",
    language: "en_US",
    status: "APPROVED",
    text: "Namaste {{Name}}! Aapka order confirm ho gaya hai. Total bill amount ₹{{Amount}} hai. Delivery jald dispatch hogi.",
    components: [
      {
        type: "BODY",
        text: "Namaste {{Name}}! Aapka order confirm ho gaya hai. Total bill amount ₹{{Amount}} hai. Delivery jald dispatch hogi.",
      },
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: "tpl_dir_payment_reminder",
    name: "payment_reminder",
    title: "Payment Reminder Alert",
    source: "direct",
    category: "UTILITY",
    language: "en_US",
    status: "APPROVED",
    text: "Namaste {{Name}}, aapka pending payment ₹{{Amount}} due hai. Kripya jald se jald clear karein. Assudani Group.",
    components: [
      {
        type: "BODY",
        text: "Namaste {{Name}}, aapka pending payment ₹{{Amount}} due hai. Kripya jald se jald clear karein. Assudani Group.",
      },
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: "tpl_dir_festival_offer",
    name: "festival_special_offer",
    title: "Special Festival Discount",
    source: "direct",
    category: "MARKETING",
    language: "en_US",
    status: "APPROVED",
    text: "Dhamaka Festival Offer! Assudani Group ki taraf se special discount offer sirf aaj ke liye valid hai. Details ke liye reply karein.",
    components: [
      {
        type: "BODY",
        text: "Dhamaka Festival Offer! Assudani Group ki taraf se special discount offer sirf aaj ke liye valid hai. Details ke liye reply karein.",
      },
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: "tpl_dir_welcome_note",
    name: "customer_welcome",
    title: "Customer Welcome Greeting",
    source: "direct",
    category: "MARKETING",
    language: "en_US",
    status: "APPROVED",
    text: "Namaste {{Name}}! Assudani Group me aapka hardik swagat hai. Hum aapki kya sahayata kar sakte hain?",
    components: [
      {
        type: "BODY",
        text: "Namaste {{Name}}! Assudani Group me aapka hardik swagat hai. Hum aapki kya sahayata kar sakte hain?",
      },
    ],
    created_at: new Date().toISOString(),
  },
];

function getDirectTemplates() {
  let list = localDb.getCollection("templates");
  if (!list || list.length === 0) {
    for (const tpl of DEFAULT_DIRECT_TEMPLATES) {
      localDb.insert("templates", tpl);
    }
    list = localDb.getCollection("templates");
  }
  return list.map((t) => ({ ...t, source: "direct", status: t.status || "APPROVED" }));
}

/**
 * GET /api/templates
 * Supports ?type=direct, ?type=meta, or default combined list.
 * Supports ?format=split to return { direct: [], meta: [] }
 */
router.get("/", async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  const typeFilter = req.query.type; // "direct" | "meta" | undefined (all)
  const formatSplit = req.query.format === "split";
  const now = Date.now();

  const directTemplates = getDirectTemplates();

  let metaTemplates = [];
  try {
    if (!forceRefresh && templateCache && now - templateCacheTime < TEMPLATE_CACHE_TTL) {
      metaTemplates = templateCache;
    } else {
      metaTemplates = await getTemplates();
      templateCache = metaTemplates;
      templateCacheTime = now;
    }
  } catch (err) {
    console.warn("⚠️ Meta templates lookup note:", err.message);
    metaTemplates = templateCache || [];
  }

  const taggedMeta = (metaTemplates || []).map((t) => ({
    ...t,
    source: "meta",
    title: t.name ? t.name.replace(/_/g, " ") : "Meta Template",
  }));

  if (formatSplit) {
    return res.json({
      direct: directTemplates,
      meta: taggedMeta,
    });
  }

  if (typeFilter === "direct") {
    return res.json(directTemplates);
  }

  if (typeFilter === "meta") {
    return res.json(taggedMeta);
  }

  // Combined: direct templates first (instant, ready), followed by meta templates
  res.json([...directTemplates, ...taggedMeta]);
});

/**
 * GET /api/templates/direct
 * Returns only direct custom templates
 */
router.get("/direct", (req, res) => {
  res.json(getDirectTemplates());
});

/**
 * POST /api/templates/direct
 * Create a new direct custom template (Instant, no Meta approval required)
 */
router.post("/direct", (req, res) => {
  try {
    const { name, title, text, category, headerType, mediaUrl, buttons } = req.body || {};

    if (!name || !text) {
      return res.status(400).json({ error: "Template name and message text are required." });
    }

    const cleanName = String(name).trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const cleanText = String(text).trim();

    const components = [
      {
        type: "BODY",
        text: cleanText,
      },
    ];

    if (headerType && headerType !== "NONE") {
      components.unshift({
        type: "HEADER",
        format: headerType,
        media_url: mediaUrl || null,
      });
    }

    if (Array.isArray(buttons) && buttons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: buttons,
      });
    }

    const doc = localDb.insert("templates", {
      id: `tpl_dir_${uuidv4().substring(0, 8)}`,
      name: cleanName,
      title: title?.trim() || cleanName.replace(/_/g, " "),
      source: "direct",
      category: category || "MARKETING",
      language: "en_US",
      status: "APPROVED",
      text: cleanText,
      components,
      media_url: mediaUrl || null,
      created_at: new Date().toISOString(),
    });

    res.status(201).json({ success: true, template: doc });
  } catch (err) {
    console.error("❌ Create direct template error:", err);
    res.status(500).json({ error: "Failed to create direct custom template." });
  }
});

/**
 * PUT /api/templates/direct/:id
 * Update an existing direct template
 */
router.put("/direct/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { title, text, category, headerType, mediaUrl } = req.body || {};

    const existing = localDb.findOne("templates", (t) => t.id === id);
    if (!existing) {
      return res.status(404).json({ error: "Direct template not found." });
    }

    const cleanText = text ? String(text).trim() : existing.text;
    const components = [
      {
        type: "BODY",
        text: cleanText,
      },
    ];

    if (headerType && headerType !== "NONE") {
      components.unshift({
        type: "HEADER",
        format: headerType,
        media_url: mediaUrl || existing.media_url || null,
      });
    }

    localDb.update("templates", (t) => t.id === id, {
      ...(title ? { title: title.trim() } : {}),
      ...(text ? { text: cleanText, components } : {}),
      ...(category ? { category } : {}),
      ...(mediaUrl !== undefined ? { media_url: mediaUrl } : {}),
      updated_at: new Date().toISOString(),
    });

    const updated = localDb.findOne("templates", (t) => t.id === id);
    res.json({ success: true, template: updated });
  } catch (err) {
    console.error("❌ Update direct template error:", err);
    res.status(500).json({ error: "Failed to update direct template." });
  }
});

/**
 * DELETE /api/templates/direct/:id
 * Delete a direct custom template
 */
router.delete("/direct/:id", (req, res) => {
  try {
    const { id } = req.params;
    const deletedCount = localDb.delete("templates", (t) => t.id === id);
    if (deletedCount === 0) {
      return res.status(404).json({ error: "Direct template not found." });
    }
    res.json({ success: true, message: "Direct template deleted successfully." });
  } catch (err) {
    console.error("❌ Delete direct template error:", err);
    res.status(500).json({ error: "Failed to delete direct template." });
  }
});

/**
 * POST /api/templates
 * Submit a template: routes to Direct storage if source="direct", otherwise submits to Meta
 */
router.post("/", async (req, res) => {
  const { source, is_direct, name, language, category, text, headerType, headerText, footerText, buttons, title, mediaUrl } = req.body || {};

  // If user selected Direct / Instant template
  if (source === "direct" || is_direct === true) {
    if (!name || !text) {
      return res.status(400).json({ error: "Template name and message text are required." });
    }

    const cleanName = String(name).trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const cleanText = String(text).trim();

    const components = [
      {
        type: "BODY",
        text: cleanText,
      },
    ];

    if (headerType && headerType !== "NONE") {
      components.unshift({
        type: "HEADER",
        format: headerType,
        media_url: mediaUrl || null,
      });
    }

    if (Array.isArray(buttons) && buttons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: buttons,
      });
    }

    const doc = localDb.insert("templates", {
      id: `tpl_dir_${uuidv4().substring(0, 8)}`,
      name: cleanName,
      title: title?.trim() || cleanName.replace(/_/g, " "),
      source: "direct",
      category: category || "MARKETING",
      language: language || "en_US",
      status: "APPROVED",
      text: cleanText,
      components,
      media_url: mediaUrl || null,
      created_at: new Date().toISOString(),
    });

    return res.status(201).json({ success: true, data: doc });
  }

  // Meta Cloud API template submission
  try {
    if (!name || !language || !category || !text) {
      return res.status(400).json({ error: "Missing required fields: name, language, category, text." });
    }

    const cleanName = String(name).trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const cleanText = String(text).trim();

    if (!cleanName) {
      return res.status(400).json({ error: "Invalid template name format." });
    }

    const result = await createTemplate(
      cleanName,
      language,
      category,
      cleanText,
      headerType,
      headerText,
      footerText,
      buttons
    );

    templateCache = null;
    templateCacheTime = 0;

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error("❌ Create template error:", err.message);
    res.status(500).json({ error: err.message || "Failed to create template on Meta Cloud." });
  }
});

module.exports = router;
