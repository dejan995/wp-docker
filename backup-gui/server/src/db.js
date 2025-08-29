// server/src/db.js
import mysql from "mysql2/promise";

const pool = await mysql.createPool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "example",
  multipleStatements: true
});

// Auto-create backup_gui database + users table
async function initDatabase() {
  await pool.query(`USE backup_gui;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      gravatar_email VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

await initDatabase();

// Export pool bound to backup_gui
const db = await mysql.createPool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "example",
  database: "backup_gui"
});

export default db;
