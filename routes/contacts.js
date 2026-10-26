const express = require("express");
const router = express.Router();
const db = require("../db");




router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        c.id,
        c.phone_number,
        c.name,
        c.created_at,
        m.message_body as last_message,
        m.direction as last_message_direction,
        m.timestamp as last_message_time,
        (
          SELECT COUNT(*)
          FROM messages m2
          WHERE m2.contact_id = c.id
            AND m2.direction = 'inbound'
            AND m2.status IS DISTINCT FROM 'read'
        ) as unread_count,
        (
          SELECT timestamp
          FROM messages m3
          WHERE m3.contact_id = c.id
            AND m3.direction = 'inbound'
            AND m3.timestamp IS NOT NULL
          ORDER BY m3.timestamp DESC
          LIMIT 1
        ) as last_inbound_time
      FROM contacts c
      LEFT JOIN LATERAL (
        SELECT message_body, direction, timestamp
        FROM messages
        WHERE contact_id = c.id
        ORDER BY timestamp DESC NULLS LAST
        LIMIT 1
      ) m ON true
      ORDER BY m.timestamp DESC NULLS LAST`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ List contacts error:", err);
    res.status(500).json({ error: err.message });
  }
});




router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`SELECT * FROM contacts WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }

    
    const lastInbound = await db.query(
      `SELECT timestamp FROM messages
       WHERE contact_id = $1 AND direction = 'inbound' AND timestamp IS NOT NULL
       ORDER BY timestamp DESC NULLS LAST
       LIMIT 1`,
      [id]
    );

    const contact = result.rows[0];
    contact.last_inbound_at = lastInbound.rows[0]?.timestamp || null;
    contact.window_open = lastInbound.rows[0]?.timestamp
      ? Date.now() - new Date(lastInbound.rows[0].timestamp).getTime() < 24 * 60 * 60 * 1000
      : false;

    res.json(contact);
  } catch (err) {
    console.error("❌ Contact detail error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, phone_number, city } = req.body;
    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required." });
    }
    let cleanedPhone = String(phone_number).replace(/\D/g, "");
    if (cleanedPhone.startsWith("0") && cleanedPhone.length === 11) {
      cleanedPhone = "91" + cleanedPhone.slice(1);
    } else if (cleanedPhone.length === 10) {
      cleanedPhone = "91" + cleanedPhone;
    }

    if (cleanedPhone.length < 10 || cleanedPhone.length > 15) {
      return res.status(400).json({ error: "Please enter a valid 10-digit phone number." });
    }
    
    const checkResult = await db.query("SELECT id FROM contacts WHERE phone_number = $1", [cleanedPhone]);
    if (checkResult.rows.length > 0) {
      return res.status(400).json({ error: "A contact with this phone number already exists." });
    }

    const result = await db.query(
      "INSERT INTO contacts (name, phone_number, city) VALUES ($1, $2, $3) RETURNING *",
      [(name || "").trim() || "Unknown", cleanedPhone, (city || "").trim()]
    );

    res.status(201).json({ message: "Contact added successfully", contact: result.rows[0] });
  } catch (err) {
    console.error("❌ Add contact error:", err);
    res.status(500).json({ error: "Failed to add contact. Please try again." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone_number, city } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    const cleanedPhone = phone_number.replace(/\D/g, "");
    
    // Check if another contact has this phone number
    const checkResult = await db.query("SELECT id FROM contacts WHERE phone_number = $1 AND id != $2", [cleanedPhone, id]);
    if (checkResult.rows.length > 0) {
      return res.status(400).json({ error: "Another contact with this phone number already exists" });
    }

    const result = await db.query(
      "UPDATE contacts SET name = $1, phone_number = $2, city = $3 WHERE id = $4 RETURNING *",
      [name || "Unknown", cleanedPhone, city || "", id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }

    res.json({ message: "Contact updated successfully", contact: result.rows[0] });
  } catch (err) {
    console.error("❌ Update contact error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.query("DELETE FROM contact_list_members WHERE contact_id = $1", [id]);
    await db.query("DELETE FROM messages WHERE contact_id = $1", [id]);
    const result = await db.query("DELETE FROM contacts WHERE id = $1 RETURNING *", [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }

    res.json({ message: "Contact deleted successfully" });
  } catch (err) {
    console.error("❌ Contact deletion error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
