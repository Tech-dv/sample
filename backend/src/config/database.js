require('dotenv').config();
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER || "myuser",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "sack_count_db",
  password: process.env.DB_PASSWORD || "Dockervision01",
  port: parseInt(process.env.DB_PORT) || 5432,
});

module.exports = pool;
