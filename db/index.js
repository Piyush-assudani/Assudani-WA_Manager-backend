const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("connect", () => {
  // Connected
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL pool error:", err.message);
});

const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === "development") {
    console.log("🔍 Query:", { text: text.substring(0, 80), duration: `${duration}ms`, rows: res.rowCount });
  }
  return res;
};

const getClient = async () => {
  return await pool.connect();
};

module.exports = { query, getClient, pool };
