const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");

const dotenv = require("dotenv");
const { Server } = require("socket.io");
const cors = require("cors");


dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;




const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true
  }
});


app.set("io", io);

io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});



app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

app.disable("x-powered-by");

const rateLimit = require("express-rate-limit");

// Global API rate limit: 1500 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

// Strict Auth rate limiter: 25 attempts per 15 minutes to prevent brute-forcing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts from this IP. Please try again after 15 minutes." },
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

const apiRoutes = require("./routes/api");
const contactRoutes = require("./routes/contacts");
const messageRoutes = require("./routes/messages");
const campaignRoutes = require("./routes/campaigns");
const webhookRoutes = require("./routes/webhook");
const authRoutes = require("./routes/auth");
const contactListsRoutes = require("./routes/contact_lists");
const templateRoutes = require("./routes/templates");
const mediaRoutes = require("./routes/media");
const dashboardRoutes = require("./routes/dashboard");

app.use("/api", apiLimiter, apiRoutes);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/contact_lists", contactListsRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/webhook", webhookRoutes);


// Privacy Policy Endpoint & Static Hosting
const privacyPath = path.join(__dirname, "privacy");
app.use("/privacy", express.static(privacyPath));
app.get("/privacy", (req, res) => {
  res.sendFile(path.join(privacyPath, "index.html"));
});

// Local Media & Uploads Static Hosting (Stored directly on server)
const uploadsPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use("/uploads", express.static(uploadsPath));

app.get("/", (req, res) => {
  res.json({
    message: "WP Automation Backend API",
    status: "running",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "GET /api/health",
      auth: "POST /api/auth/login",
      contact_lists: "GET/POST /api/contact_lists",
      contacts: "GET /api/contacts",
      messages: "GET /api/messages/:contactId",
      campaigns: "GET /api/campaigns",
      webhook: "GET/POST /webhook",
      privacy: "GET /privacy",
      uploads: "GET /uploads/:folder/:filename",
    },
  });
});






app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});


app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});




const { initBullMQ } = require("./services/campaignProcessor");


initBullMQ(io);

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔌 WebSocket server ready`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
});

process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Exception caught safely:", err.message || err);
});

process.on("unhandledRejection", (reason) => {
  console.error("🔥 Unhandled Rejection caught safely:", reason?.message || reason);
});

