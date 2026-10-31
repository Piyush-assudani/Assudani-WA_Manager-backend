const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");

const DB_FILE = path.resolve(__dirname, "../data/db.json");

// Default initial state
const getInitialState = () => ({
  users: [
    {
      id: "usr_admin_piyush",
      username: "piyushassudani",
      password: bcrypt.hashSync("piyush@9413879444", 10),
      plain_fallback: "piyush@9413879444",
      role: "admin",
      name: "Piyush Assudani",
      created_at: new Date().toISOString(),
    },
  ],
  contacts: [],
  contact_lists: [],
  contact_list_members: [],
  messages: [],
  campaigns: [],
  templates: [],
  media_assets: [],
  auto_replies: [
    {
      id: "ar_price",
      keyword: "price",
      match_type: "contains",
      reply_text: "Namaste! Humare packages & pricing details ke liye kripya hamari website check karein ya humse connect karein. Hum aapko jald hi rate list bhej rahe hain.",
      is_active: true,
      created_at: new Date().toISOString(),
    },
    {
      id: "ar_offer",
      keyword: "offer",
      match_type: "contains",
      reply_text: "Dhamaka Offer! Aaj hi contact karne par payein special discount. Details jald aapse share ki jaayegi.",
      is_active: true,
      created_at: new Date().toISOString(),
    },
    {
      id: "ar_menu",
      keyword: "menu",
      match_type: "contains",
      reply_text: "Hamare services ka complete catalog aur menu dekhne ke liye dhanyawad. Team aapse sampark karegi.",
      is_active: true,
      created_at: new Date().toISOString(),
    },
    {
      id: "ar_location",
      keyword: "location",
      match_type: "contains",
      reply_text: "Hamara office location: Assudani Group Headquarters. Map link aur visit details ke liye reply karein.",
      is_active: true,
      created_at: new Date().toISOString(),
    },
    {
      id: "ar_help",
      keyword: "help",
      match_type: "contains",
      reply_text: "Namaste! Hamari support team aapki sahayata ke liye uplabdh hai. Kripya apna prashna likhein.",
      is_active: true,
      created_at: new Date().toISOString(),
    },
  ],
  away_settings: {
    away_enabled: true,
    away_start_hour: 19, // 7 PM
    away_end_hour: 9,    // 9 AM
    away_days: [0],      // Sunday
    away_message: "Namaste! Humara office abhi closed hai, kal subah 9 baje hum aapse connect karenge.",
    welcome_enabled: true,
    welcome_message: "Namaste! Assudani WA Manager me aapka swagat hai. Hum aapki kya sahayata kar sakte hain?",
  },
  quick_replies: [
    {
      id: "qr_bank",
      shortcut: "/bank",
      title: "Bank Account Details",
      content: "Bank: HDFC Bank\nAccount Name: Assudani Group\nA/C No: 50200012345678\nIFSC: HDFC0001234\nUPI ID: payment@hdfcbank",
    },
    {
      id: "qr_address",
      shortcut: "/address",
      title: "Office Address",
      content: "Assudani Group HQ, Commercial Tower, Main City Centre. Contact: Support Desk",
    },
    {
      id: "qr_pricing",
      shortcut: "/pricing",
      title: "Pricing Plans",
      content: "Hamare standard packages start hote hain ₹1,999/month se. Enterprise automation packages customized rehte hain.",
    },
  ],
});

class LocalDB {
  constructor() {
    this.data = getInitialState();
    this.indexes = {
      contactsById: new Map(),
      contactsByPhone: new Map(),
      usersByUsername: new Map(),
      messagesByContactId: new Map(),
    };
    this.saveTimer = null;
    this.isDirty = false;
    this.load();
  }

  rebuildIndexes() {
    this.indexes.contactsById.clear();
    this.indexes.contactsByPhone.clear();
    this.indexes.usersByUsername.clear();
    this.indexes.messagesByContactId.clear();

    const contacts = this.data.contacts || [];
    for (const c of contacts) {
      if (c.id) this.indexes.contactsById.set(String(c.id), c);
      if (c.phone_number) this.indexes.contactsByPhone.set(String(c.phone_number), c);
    }

    const users = this.data.users || [];
    for (const u of users) {
      if (u.username) this.indexes.usersByUsername.set(String(u.username).toLowerCase(), u);
    }

    const messages = this.data.messages || [];
    for (const m of messages) {
      if (m.contact_id) {
        if (!this.indexes.messagesByContactId.has(m.contact_id)) {
          this.indexes.messagesByContactId.set(m.contact_id, []);
        }
        this.indexes.messagesByContactId.get(m.contact_id).push(m);
      }
    }
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        this.data = { ...getInitialState(), ...parsed };

        // Ensure piyushassudani user is always properly configured
        const adminIndex = this.data.users.findIndex(
          (u) => u.username?.toLowerCase() === "piyushassudani"
        );
        if (adminIndex === -1) {
          this.data.users.push({
            id: "usr_admin_piyush",
            username: "piyushassudani",
            password: bcrypt.hashSync("piyush@9413879444", 10),
            plain_fallback: "piyush@9413879444",
            role: "admin",
            name: "Piyush Assudani",
            created_at: new Date().toISOString(),
          });
          this.saveImmediate();
        } else {
          // Verify password hash matches
          const user = this.data.users[adminIndex];
          user.plain_fallback = "piyush@9413879444";
          if (!bcrypt.compareSync("piyush@9413879444", user.password)) {
            user.password = bcrypt.hashSync("piyush@9413879444", 10);
            this.saveImmediate();
          }
        }
      } else {
        this.saveImmediate();
      }
    } catch (err) {
      console.error("LocalDB load error, initializing fresh:", err.message);
      this.data = getInitialState();
      this.saveImmediate();
    }
    this.rebuildIndexes();
  }

  save() {
    this.isDirty = true;
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        this.saveImmediate();
        this.saveTimer = null;
      }, 50); // Debounce 50ms for hyper-fast batch operations under heavy load
    }
  }

  saveImmediate() {
    try {
      fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
      const tempPath = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), "utf-8");
      fs.renameSync(tempPath, DB_FILE);
      this.isDirty = false;
    } catch (err) {
      console.error("LocalDB save error:", err.message);
    }
  }

  // Collection Accessors
  getCollection(name) {
    if (!this.data[name]) {
      this.data[name] = [];
    }
    return this.data[name];
  }

  find(collectionName, predicate = () => true) {
    const col = this.getCollection(collectionName);
    return col.filter(predicate);
  }

  findOne(collectionName, predicate) {
    const col = this.getCollection(collectionName);
    return col.find(predicate) || null;
  }

  insert(collectionName, item) {
    const col = this.getCollection(collectionName);
    const doc = {
      id: item.id || uuidv4(),
      ...item,
      created_at: item.created_at || new Date().toISOString(),
    };
    col.push(doc);

    // Sync Indexes for O(1) retrieval
    if (collectionName === "contacts") {
      if (doc.id) this.indexes.contactsById.set(String(doc.id), doc);
      if (doc.phone_number) this.indexes.contactsByPhone.set(String(doc.phone_number), doc);
    } else if (collectionName === "users") {
      if (doc.username) this.indexes.usersByUsername.set(String(doc.username).toLowerCase(), doc);
    } else if (collectionName === "messages" && doc.contact_id) {
      if (!this.indexes.messagesByContactId.has(doc.contact_id)) {
        this.indexes.messagesByContactId.set(doc.contact_id, []);
      }
      this.indexes.messagesByContactId.get(doc.contact_id).push(doc);
    }

    this.save();
    return doc;
  }

  update(collectionName, predicate, updates) {
    const col = this.getCollection(collectionName);
    let count = 0;
    for (let i = 0; i < col.length; i++) {
      if (predicate(col[i])) {
        col[i] = { ...col[i], ...updates, updated_at: new Date().toISOString() };
        count++;
      }
    }
    if (count > 0) {
      this.rebuildIndexes();
      this.save();
    }
    return count;
  }

  delete(collectionName, predicate) {
    const col = this.getCollection(collectionName);
    const initialLength = col.length;
    this.data[collectionName] = col.filter((item) => !predicate(item));
    const deletedCount = initialLength - this.data[collectionName].length;
    if (deletedCount > 0) {
      this.rebuildIndexes();
      this.save();
    }
    return deletedCount;
  }

  // --- Auto-Reply Rules Engine ---
  getAutoReplies() {
    return this.data.auto_replies || [];
  }

  saveAutoReply(rule) {
    if (rule.id) {
      this.update("auto_replies", (r) => r.id === rule.id, rule);
      return rule;
    }
    return this.insert("auto_replies", rule);
  }

  deleteAutoReply(id) {
    return this.delete("auto_replies", (r) => r.id === id);
  }

  matchAutoReply(incomingText) {
    if (!incomingText || typeof incomingText !== "string") return null;
    const clean = incomingText.trim().toLowerCase();
    const rules = this.data.auto_replies || [];

    for (const rule of rules) {
      if (!rule.is_active) continue;
      const kw = rule.keyword.trim().toLowerCase();
      if (rule.match_type === "exact") {
        if (clean === kw) return rule;
      } else {
        // contains
        if (clean.includes(kw)) return rule;
      }
    }
    return null;
  }

  // --- Out-of-Hours & Greeting Engine ---
  getAwaySettings() {
    return this.data.away_settings;
  }

  updateAwaySettings(settings) {
    this.data.away_settings = { ...this.data.away_settings, ...settings };
    this.save();
    return this.data.away_settings;
  }

  checkAwayOrWelcome(phone, isFirstMessage = false) {
    const settings = this.data.away_settings || {};
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 is Sunday

    // 1. Check Out-of-Hours
    if (settings.away_enabled) {
      const isSunday = (settings.away_days || [0]).includes(currentDay);
      const isAfterHours =
        currentHour >= settings.away_start_hour ||
        currentHour < settings.away_end_hour;

      if (isSunday || isAfterHours) {
        return {
          type: "away",
          message: settings.away_message,
        };
      }
    }

    // 2. Check Welcome Greeting for new contacts
    if (settings.welcome_enabled && isFirstMessage) {
      return {
        type: "welcome",
        message: settings.welcome_message,
      };
    }

    return null;
  }

  // --- Quick Replies (Canned Responses) ---
  getQuickReplies() {
    return this.data.quick_replies || [];
  }

  saveQuickReply(item) {
    if (item.id) {
      this.update("quick_replies", (q) => q.id === item.id, item);
      return item;
    }
    return this.insert("quick_replies", item);
  }

  deleteQuickReply(id) {
    return this.delete("quick_replies", (q) => q.id === id);
  }

  // --- Tagging & Notes ---
  updateContactNotesAndTags(contactId, { tags, notes }) {
    return this.update(
      "contacts",
      (c) => c.id === contactId,
      { tags: tags || [], notes: notes || "" }
    );
  }

  // --- Campaign Retry Logic ---
  retryFailedCampaignNumbers(campaignId) {
    const camp = this.findOne("campaigns", (c) => c.id === campaignId);
    if (!camp) return { success: false, error: "Campaign not found" };

    const failedNumbers = camp.failed_numbers || [];
    if (failedNumbers.length === 0) {
      return { success: false, error: "No failed numbers to retry." };
    }

    camp.status = "retrying";
    this.save();
    return {
      success: true,
      message: `Retrying ${failedNumbers.length} failed recipient(s).`,
      numbers: failedNumbers,
    };
  }
}

const localDbInstance = new LocalDB();
module.exports = localDbInstance;

