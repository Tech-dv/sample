const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "34.180.34.20",
  database: "sack_count_db",
  password: "postgres",
  port: 5432,
});

module.exports = pool;
