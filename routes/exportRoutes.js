const express = require("express");
const router = express.Router();
const xlsx = require("xlsx");
const localDb = require("../db/localDb");

/**
 * GET /api/export/contacts
 * Export contacts to Excel (.xlsx)
 */
router.get("/contacts", (req, res) => {
  try {
    const contacts = localDb.getCollection("contacts");
    const data = contacts.map((c, i) => ({
      "S.No": i + 1,
      Name: c.name || "N/A",
      "Phone Number": c.phone_number || "",
      Email: c.email || "",
      Tags: Array.isArray(c.tags) ? c.tags.join(", ") : (c.tags || ""),
      "Admin Notes": c.notes || "",
      "Created At": c.created_at || "",
    }));

    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Contacts");

    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="assudani_contacts_${Date.now()}.xlsx"`
    );
    return res.send(buffer);
  } catch (err) {
    console.error("Export contacts error:", err.message);
    res.status(500).json({ error: "Failed to export contacts." });
  }
});

/**
 * GET /api/export/campaigns/:id
 * Export specific campaign performance to Excel (.xlsx)
 */
router.get("/campaigns/:id", (req, res) => {
  try {
    const camp = localDb.findOne("campaigns", (c) => c.id === req.params.id);
    if (!camp) return res.status(404).json({ error: "Campaign not found" });

    const summary = [
      { Metric: "Campaign Name", Value: camp.name },
      { Metric: "Status", Value: camp.status },
      { Metric: "Total Target Contacts", Value: camp.total_contacts || 0 },
      { Metric: "Delivered Messages", Value: camp.sent_count || 0 },
      { Metric: "Failed Deliveries", Value: camp.failed_count || 0 },
      { Metric: "Created At", Value: camp.created_at },
      { Metric: "Scheduled At", Value: camp.scheduled_at || "Instant" },
    ];

    const failed = (camp.failed_numbers || []).map((num, i) => ({
      "S.No": i + 1,
      "Failed Phone Number": num,
      Status: "Failed",
    }));

    const wb = xlsx.utils.book_new();
    const wsSummary = xlsx.utils.json_to_sheet(summary);
    xlsx.utils.book_append_sheet(wb, wsSummary, "Overview");

    if (failed.length > 0) {
      const wsFailed = xlsx.utils.json_to_sheet(failed);
      xlsx.utils.book_append_sheet(wb, wsFailed, "Failed Numbers");
    }

    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="campaign_${camp.name.replace(/\s+/g, "_")}_${Date.now()}.xlsx"`
    );
    return res.send(buffer);
  } catch (err) {
    console.error("Export campaign error:", err.message);
    res.status(500).json({ error: "Failed to export campaign report." });
  }
});

module.exports = router;
