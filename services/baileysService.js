const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
} = require("@whiskeysockets/baileys");

const SESSIONS_DIR = path.resolve(__dirname, "../wa_credentials/session");
const CONFIG_FILE = path.resolve(__dirname, "../wa_credentials/config.json");

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

let sock = null;
let ioInstance = null;
let isStarting = false;
let reconnectTimer = null;
let currentStatus = "DISCONNECTED"; // DISCONNECTED | SCAN_QR | CONNECTING | CONNECTED
let currentQrRaw = null;
let currentQrDataUrl = null;
let connectedUser = null;
let connectedAt = null;
let lastError = null;
let activeMode = "qr"; // Default to qr or api

// Load persisted mode if exists
try {
  if (fs.existsSync(CONFIG_FILE)) {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.activeMode) activeMode = parsed.activeMode;
  }
} catch (e) {
  // Ignore
}

const saveConfig = () => {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ activeMode }, null, 2));
  } catch (e) {
    console.error("Failed to save WA config:", e.message);
  }
};

const sanitizePhone = (phone) => {
  if (!phone) return "";
  let cleaned = String(phone).replace(/\D/g, "");
  // If starts with 0, remove it
  if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
  return cleaned;
};

const formatJid = (phone) => {
  const cleaned = sanitizePhone(phone);
  if (cleaned.includes("@")) return cleaned;
  return `${cleaned}@s.whatsapp.net`;
};

/**
 * Initialize Baileys Socket Engine
 */
const initBaileys = async (io) => {
  if (io) ioInstance = io;

  // Don't restart if already running
  if (isStarting) return;
  if (sock && currentStatus === "CONNECTED") return;

  isStarting = true;
  currentStatus = "CONNECTING";
  lastError = null;

  if (ioInstance) {
    ioInstance.emit("wa_status", { status: currentStatus, userInfo: null });
  }

  try {
    const logger = pino({ level: "silent" });
    const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);

    sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: Browsers.macOS("Chrome"),
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // New QR Code emitted
      if (qr) {
        currentQrRaw = qr;
        try {
          currentQrDataUrl = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: "M",
            margin: 2,
            scale: 8,
          });
          currentStatus = "SCAN_QR";
          console.log("📲 New WhatsApp QR Code generated for Assudani WA Manager");

          if (ioInstance) {
            ioInstance.emit("wa_qr", {
              qr: currentQrRaw,
              qrDataUrl: currentQrDataUrl,
              status: "SCAN_QR",
            });
          }
        } catch (qrErr) {
          console.error("❌ Failed to generate QR data URL:", qrErr.message);
        }
      }

      // Connection opened successfully!
      if (connection === "open") {
        currentStatus = "CONNECTED";
        currentQrRaw = null;
        currentQrDataUrl = null;
        connectedAt = new Date().toISOString();

        const rawId = sock?.user?.id || "";
        const phone = rawId.split(":")[0]?.replace("@s.whatsapp.net", "") || "";
        const name = sock?.user?.name || sock?.user?.notify || "Assudani User";

        connectedUser = {
          id: rawId,
          phone,
          name,
          platform: "WhatsApp Multi-Device",
        };

        console.log(`✅ WhatsApp Web Linked Successfully! Phone: ${phone} (${name})`);

        if (ioInstance) {
          ioInstance.emit("wa_status", {
            status: "CONNECTED",
            userInfo: connectedUser,
            connectedAt,
          });
        }
      }

      // Connection closed
      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || "Connection closed";
        console.warn(`⚠️ WhatsApp connection closed. Reason: ${reason} (Code: ${statusCode})`);

        const isLoggedOut =
          statusCode === DisconnectReason.loggedOut ||
          statusCode === 401;

        if (isLoggedOut) {
          console.log("🚪 Logged out from WhatsApp session. Clearing stored session files...");
          cleanupSessionFiles();
          currentStatus = "DISCONNECTED";
          connectedUser = null;
          currentQrRaw = null;
          currentQrDataUrl = null;

          if (ioInstance) {
            ioInstance.emit("wa_status", {
              status: "DISCONNECTED",
              error: "Logged out from device",
            });
          }
        } else {
          // Reconnect automatically on drops
          currentStatus = "CONNECTING";
          if (ioInstance) {
            ioInstance.emit("wa_status", {
              status: "CONNECTING",
              error: "Reconnecting to WhatsApp...",
            });
          }
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            initBaileys(ioInstance).catch((e) => console.error("Reconnect error:", e.message));
          }, 3000);
        }
      }
    });

    // Inbound messages handler
    sock.ev.on("messages.upsert", async (m) => {
      try {
        if (!m || !m.messages || m.messages.length === 0) return;
        const msg = m.messages[0];
        if (msg.key.fromMe) return; // ignore our own messages

        const senderJid = msg.key.remoteJid || "";
        const senderPhone = senderJid.replace("@s.whatsapp.net", "");
        const pushName = msg.pushName || "";
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          "";

        console.log(`📩 Inbound WhatsApp message from ${senderPhone} (${pushName}): ${text}`);

        if (ioInstance) {
          ioInstance.emit("wa_inbound_message", {
            from: senderPhone,
            pushName,
            text,
            timestamp: new Date().toISOString(),
            raw: msg,
          });
        }
      } catch (inboundErr) {
        console.error("Error processing inbound Baileys message:", inboundErr.message);
      }
    });
  } catch (err) {
    console.error("❌ Error starting Baileys engine:", err.message);
    currentStatus = "DISCONNECTED";
    lastError = err.message;
    if (ioInstance) {
      ioInstance.emit("wa_status", { status: "DISCONNECTED", error: err.message });
    }
  } finally {
    isStarting = false;
  }
};

/**
 * Remove session files on logout
 */
const cleanupSessionFiles = () => {
  try {
    if (fs.existsSync(SESSIONS_DIR)) {
      const files = fs.readdirSync(SESSIONS_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(SESSIONS_DIR, file));
      }
    }
  } catch (e) {
    console.error("Error cleaning session files:", e.message);
  }
};

/**
 * Force manual logout / disconnect
 */
const logoutBaileys = async () => {
  if (reconnectTimer) clearTimeout(reconnectTimer);

  try {
    if (sock) {
      await sock.logout().catch(() => {});
      sock.end(new Error("Manual logout by user"));
      sock = null;
    }
  } catch (e) {
    // Ignore error
  }

  cleanupSessionFiles();
  currentStatus = "DISCONNECTED";
  connectedUser = null;
  currentQrRaw = null;
  currentQrDataUrl = null;

  if (ioInstance) {
    ioInstance.emit("wa_status", { status: "DISCONNECTED" });
  }

  return { success: true, message: "Logged out successfully." };
};

/**
 * Send text message through linked WhatsApp Web session
 */
const sendTextMessage = async (to, text) => {
  if (currentStatus !== "CONNECTED" || !sock) {
    return {
      success: false,
      error: "WhatsApp Web session is not connected. Please scan the QR code first.",
    };
  }

  try {
    const jid = formatJid(to);
    if (!jid || jid === "@s.whatsapp.net") {
      return { success: false, error: "Invalid recipient phone number." };
    }

    const res = await sock.sendMessage(jid, { text });

    return {
      success: true,
      messageId: res?.key?.id,
      timestamp: new Date().toISOString(),
      to: sanitizePhone(to),
    };
  } catch (err) {
    console.error(`❌ Baileys sendTextMessage error to ${to}:`, err.message);
    return {
      success: false,
      error: err.message || "Failed to send WhatsApp message via linked session.",
    };
  }
};

/**
 * Send media message through linked WhatsApp Web session
 */
const sendMediaMessage = async (to, { mediaUrl, caption, type = "image" }) => {
  if (currentStatus !== "CONNECTED" || !sock) {
    return {
      success: false,
      error: "WhatsApp Web session is not connected. Please scan the QR code first.",
    };
  }

  try {
    const jid = formatJid(to);
    if (!jid || jid === "@s.whatsapp.net") {
      return { success: false, error: "Invalid recipient phone number." };
    }

    let payload = {};
    if (type === "video") {
      payload = { video: { url: mediaUrl }, caption: caption || "" };
    } else if (type === "document") {
      payload = { document: { url: mediaUrl }, caption: caption || "", mimetype: "application/pdf" };
    } else {
      payload = { image: { url: mediaUrl }, caption: caption || "" };
    }

    const res = await sock.sendMessage(jid, payload);

    return {
      success: true,
      messageId: res?.key?.id,
      timestamp: new Date().toISOString(),
      to: sanitizePhone(to),
    };
  } catch (err) {
    console.error(`❌ Baileys sendMediaMessage error to ${to}:`, err.message);
    return {
      success: false,
      error: err.message || "Failed to send media message via linked session.",
    };
  }
};

/**
 * Get current session state & user details
 */
const getStatus = () => {
  return {
    status: currentStatus,
    qr: currentQrRaw,
    qrDataUrl: currentQrDataUrl,
    userInfo: connectedUser,
    connectedAt,
    activeMode,
    lastError,
  };
};

/**
 * Set active mode (api | qr)
 */
const setActiveMode = (mode) => {
  if (mode === "api" || mode === "qr") {
    activeMode = mode;
    saveConfig();
    if (ioInstance) {
      ioInstance.emit("wa_mode_changed", { activeMode });
    }
    return { success: true, activeMode };
  }
  return { success: false, error: "Mode must be 'api' or 'qr'" };
};

module.exports = {
  initBaileys,
  logoutBaileys,
  sendTextMessage,
  sendMediaMessage,
  getStatus,
  setActiveMode,
  formatJid,
  sanitizePhone,
};

