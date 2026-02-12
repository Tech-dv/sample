const pool = require("../config/database");

const createReviewer = async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !username.trim() || !password || !password.trim()) {
    return res.status(400).json({ message: "username and password are required" });
  }

  const name = username.trim();
  const pwd = password.trim();

  try {
    const existingUser = await pool.query(
      "SELECT 1 FROM users WHERE username = $1",
      [name]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    await pool.query(
      `
      INSERT INTO users (username, password, role, customer_id, is_active, created_at)
      VALUES ($1, $2, 'REVIEWER', NULL, true, NOW())
      `,
      [name, pwd]
    );

    res.status(201).json({ message: "Reviewer user created successfully" });
  } catch (err) {
    console.error("CREATE REVIEWER USER ERROR:", err);
    res.status(500).json({ message: "Failed to create reviewer user" });
  }
};

const createAdmin = async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !username.trim() || !password || !password.trim()) {
    return res.status(400).json({ message: "username and password are required" });
  }

  const name = username.trim();
  const pwd = password.trim();

  try {
    const existingUser = await pool.query(
      "SELECT 1 FROM users WHERE username = $1",
      [name]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    await pool.query(
      `
      INSERT INTO users (username, password, role, customer_id, is_active, created_at)
      VALUES ($1, $2, 'ADMIN', NULL, true, NOW())
      `,
      [name, pwd]
    );

    res.status(201).json({ message: "Admin user created successfully" });
  } catch (err) {
    console.error("CREATE ADMIN USER ERROR:", err);
    res.status(500).json({ message: "Failed to create admin user" });
  }
};

const createSuperAdmin = async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !username.trim() || !password || !password.trim()) {
    return res.status(400).json({ message: "username and password are required" });
  }

  const name = username.trim();
  const pwd = password.trim();

  try {
    const existingUser = await pool.query(
      "SELECT 1 FROM users WHERE username = $1",
      [name]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    await pool.query(
      `
      INSERT INTO users (username, password, role, customer_id, is_active, created_at)
      VALUES ($1, $2, 'SUPER_ADMIN', NULL, true, NOW())
      `,
      [name, pwd]
    );

    res.status(201).json({ message: "Super Admin user created successfully" });
  } catch (err) {
    console.error("CREATE SUPER_ADMIN USER ERROR:", err);
    res.status(500).json({ message: "Failed to create superadmin user" });
  }
};

module.exports = {
  createReviewer,
  createAdmin,
  createSuperAdmin,
};
