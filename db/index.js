const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { Pool } = require("pg");

let pool = null;

if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL.trim(),
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err) => {
      console.error("❌ PostgreSQL pool error:", err.message);
    });
  } catch (err) {
    console.error("⚠️ Failed to initialize PostgreSQL pool:", err.message);
    pool = null;
  }
} else {
  console.log("ℹ️ No DATABASE_URL set. Database operations will wait for configuration.");
}

const query = async (text, params) => {
  if (!pool) {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "") {
      // Lazy re-initialization if DATABASE_URL was populated
      try {
        pool = new Pool({
          connectionString: process.env.DATABASE_URL.trim(),
          ssl: { rejectUnauthorized: false },
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
      } catch (e) {
        console.warn("⚠️ Re-init DB pool failed:", e.message);
      }
    }
  }

  if (!pool) {
    console.warn("⚠️ Database query attempted but DATABASE_URL is not set.");
    return { rows: [], rowCount: 0 };
  }

  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === "development") {
    console.log("🔍 Query:", { text: text.substring(0, 80), duration: `${duration}ms`, rows: res.rowCount });
  }
  return res;
};

const getClient = async () => {
  if (!pool) {
    throw new Error("Database not configured. Please set DATABASE_URL in .env");
  }
  return await pool.connect();
};

module.exports = { query, getClient, pool };
