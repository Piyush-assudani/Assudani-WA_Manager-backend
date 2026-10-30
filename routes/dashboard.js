const express = require("express");
const router = express.Router();
const db = require("../db");

// In-memory cache for dashboard stats (10-second TTL to handle traffic spikes)
const dashboardCache = new Map();
const DASHBOARD_CACHE_TTL = 10 * 1000;

router.get("/", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const cacheKey = `${startDate || "all"}_${endDate || "all"}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < DASHBOARD_CACHE_TTL) {
      return res.json(cached.data);
    }

    let campaignWhere = "";
    let messageWhere = "";
    const params = [];

    if (startDate && endDate) {
      campaignWhere = "WHERE DATE(created_at) >= $1 AND DATE(created_at) <= $2";
      messageWhere = "WHERE DATE(timestamp) >= $1 AND DATE(timestamp) <= $2";
      params.push(startDate, endDate);
    }

    // 1. Total Contacts
    const contactsRes = await db.query("SELECT COUNT(*) FROM contacts");
    const totalLeads = parseInt(contactsRes.rows[0]?.count || 0, 10);

    // 2. Total Contact Lists
    const listsRes = await db.query("SELECT COUNT(*) FROM contact_lists");
    const totalLists = parseInt(listsRes.rows[0]?.count || 0, 10);

    // 3. Campaigns count and totals
    const campaignsRes = await db.query(
      `SELECT 
        COUNT(*) as total_campaigns,
        COALESCE(SUM(total_sent), 0) as total_sent
      FROM campaigns
      ${campaignWhere}`,
      params
    );
    const c = campaignsRes.rows[0] || {};
    const totalCampaigns = parseInt(c.total_campaigns || 0, 10);
    const campaignsSent = parseInt(c.total_sent || 0, 10);

    // 4. Message counts from messages table for live accuracy
    const msgsRes = await db.query(
      `SELECT 
        direction,
        status,
        COUNT(*) as count
      FROM messages
      ${messageWhere}
      GROUP BY direction, status`,
      params
    );

    let totalMessagesSent = 0;
    let totalMessagesReceived = 0;
    let exactSent = 0;
    let exactDelivered = 0;
    let exactRead = 0;
    let exactFailed = 0;

    msgsRes.rows.forEach((row) => {
      const count = parseInt(row.count, 10);
      if (row.direction === "inbound") {
        totalMessagesReceived += count;
      } else {
        totalMessagesSent += count;
        if (row.status === "sent") exactSent += count;
        else if (row.status === "delivered") exactDelivered += count;
        else if (row.status === "read") exactRead += count;
        else if (row.status === "failed") exactFailed += count;
      }
    });

    const finalSent = Math.max(campaignsSent, totalMessagesSent);
    const finalDelivered = exactDelivered + exactRead;
    const finalRead = exactRead;
    const finalFailed = exactFailed;

    let deliveryRate = "0.0";
    if (finalSent > 0) {
      deliveryRate = ((finalDelivered / finalSent) * 100).toFixed(1);
    }

    const payload = {
      totalLeads,
      totalLists,
      totalCampaigns,
      totalMessagesSent: finalSent,
      totalMessagesReceived,
      deliveryRate,
      campaignStatus: {
        sent: finalSent,
        delivered: finalDelivered,
        read: finalRead,
        failed: finalFailed,
      },
    };

    // Cache the result
    dashboardCache.set(cacheKey, { timestamp: Date.now(), data: payload });

    res.json(payload);
  } catch (err) {
    console.error("❌ Dashboard stats error:", err);
    res.status(500).json({ error: "Failed to generate dashboard analytics." });
  }
});

module.exports = router;
