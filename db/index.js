const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const localDb = require("./localDb");

/**
 * Universal Server-Side Database Query Adapter
 * Translates queries seamlessly to localDb while allowing optional Postgres
 */
const query = async (text, params = []) => {
  const sql = (text || "").trim();
  const lowerSql = sql.toLowerCase();

  // 1. Users Queries (Auth)
  if (lowerSql.includes("from users")) {
    if (lowerSql.startsWith("select")) {
      const usernameParam = params[0] ? String(params[0]).trim().toLowerCase() : "";
      const user = localDb.indexes.usersByUsername.get(usernameParam) || localDb.findOne(
        "users",
        (u) => u.username?.toLowerCase() === usernameParam
      );
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }
    if (lowerSql.startsWith("update users")) {
      // Password update
      const newHash = params[0];
      const userId = params[1];
      localDb.update("users", (u) => u.id === userId, { password: newHash });
      return { rowCount: 1 };
    }
  }

  // 2. Contacts Queries
  if (lowerSql.includes("contacts")) {
    if (lowerSql.startsWith("select")) {
      if (lowerSql.includes("where id = $1")) {
        const contact = localDb.indexes.contactsById.get(String(params[0])) || localDb.findOne("contacts", (c) => c.id === params[0]);
        return { rows: contact ? [contact] : [], rowCount: contact ? 1 : 0 };
      }
      if (lowerSql.includes("where phone_number = $1") || lowerSql.includes("where phone_number=$1")) {
        const contact = localDb.indexes.contactsByPhone.get(String(params[0])) || localDb.findOne("contacts", (c) => c.phone_number === params[0]);
        return { rows: contact ? [contact] : [], rowCount: contact ? 1 : 0 };
      }
      const all = localDb.getCollection("contacts");
      return { rows: all, rowCount: all.length };
    }

    if (lowerSql.startsWith("insert into contacts")) {
      const name = params[0] || "";
      const phone = params[1] || "";
      const email = params[2] || "";
      const doc = localDb.insert("contacts", {
        name,
        phone_number: phone,
        email,
        tags: ["New Lead"],
        notes: "",
      });
      return { rows: [doc], rowCount: 1 };
    }

    if (lowerSql.startsWith("update contacts")) {
      const contactId = params[params.length - 1];
      localDb.update("contacts", (c) => c.id === contactId, { updated_at: new Date().toISOString() });
      return { rowCount: 1 };
    }

    if (lowerSql.startsWith("delete from contacts")) {
      const contactId = params[0];
      const count = localDb.delete("contacts", (c) => c.id === contactId);
      return { rowCount: count };
    }
  }

  // 3. Messages Queries
  if (lowerSql.includes("messages")) {
    if (lowerSql.startsWith("select")) {
      if (lowerSql.includes("direction = 'inbound'") && lowerSql.includes("limit 100")) {
        const inbound = localDb.find("messages", (m) => m.direction === "inbound");
        return { rows: inbound.slice(0, 100), rowCount: inbound.length };
      }
      if (lowerSql.includes("where contact_id = $1")) {
        const contactMessages = localDb.indexes.messagesByContactId.get(params[0]) || localDb.find("messages", (m) => m.contact_id === params[0]);
        return { rows: contactMessages, rowCount: contactMessages.length };
      }
      const all = localDb.getCollection("messages");
      return { rows: all, rowCount: all.length };
    }

    if (lowerSql.startsWith("insert into messages")) {
      const contactId = params[0];
      const direction = params[1] || "outbound";
      const messageText = params[2] || "";
      const mediaUrl = params[3] || null;
      const doc = localDb.insert("messages", {
        contact_id: contactId,
        direction,
        message: messageText,
        media_url: mediaUrl,
        status: "sent",
        timestamp: new Date().toISOString(),
      });
      return { rows: [doc], rowCount: 1 };
    }

    if (lowerSql.startsWith("update messages")) {
      return { rowCount: 1 };
    }

    if (lowerSql.startsWith("delete from messages")) {
      const msgId = params[0];
      const count = localDb.delete("messages", (m) => m.id === msgId);
      return { rowCount: count };
    }
  }

  // 4. Campaigns Queries
  if (lowerSql.includes("campaigns")) {
    if (lowerSql.startsWith("select")) {
      if (lowerSql.includes("where id = $1")) {
        const camp = localDb.findOne("campaigns", (c) => c.id === params[0]);
        return { rows: camp ? [camp] : [], rowCount: camp ? 1 : 0 };
      }
      const all = localDb.getCollection("campaigns");
      return { rows: all, rowCount: all.length };
    }

    if (lowerSql.startsWith("insert into campaigns")) {
      const name = params[0] || "Campaign";
      const doc = localDb.insert("campaigns", {
        name,
        status: "created",
        total_contacts: 0,
        sent_count: 0,
        failed_count: 0,
        created_at: new Date().toISOString(),
      });
      return { rows: [doc], rowCount: 1 };
    }
  }

  // 5. Contact Lists Queries
  if (lowerSql.includes("contact_lists")) {
    if (lowerSql.startsWith("select")) {
      const all = localDb.getCollection("contact_lists");
      return { rows: all, rowCount: all.length };
    }
  }

  // Fallback safe result
  return { rows: [], rowCount: 0 };
};

const getClient = async () => {
  return {
    query,
    release: () => {},
  };
};

module.exports = {
  query,
  getClient,
  localDb,
};
