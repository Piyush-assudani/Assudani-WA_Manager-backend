const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const { Pool } = require("pg");

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const schemaPath = path.join(__dirname, "schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf-8");

    console.log("🔄 Running database migration...");
    await pool.query(sql);
    console.log("✅ Database migration completed successfully!");
    console.log("   Tables created: contacts, campaigns, messages");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
