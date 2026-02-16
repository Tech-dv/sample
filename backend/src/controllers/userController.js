const pool = require("../config/database");
const { validateEmail } = require("../utils/emailValidator");

const createReviewer = async (req, res) => {
  const { username, password, email } = req.body || {};

  if (!username || !username.trim() || !password || !password.trim()) {
    return res.status(400).json({ message: "username and password are required" });
  }

  // Validate email
  if (!email || !email.trim()) {
    return res.status(400).json({ message: "email is required" });
  }

  const emailValidation = validateEmail(email);
  if (!emailValidation.isValid) {
    return res.status(400).json({ message: emailValidation.error });
  }

  const name = username.trim();
  const pwd = password.trim();
  const normalizedEmail = emailValidation.normalized;

  try {
    // Check for existing username
    const existingUser = await pool.query(
      "SELECT 1 FROM users WHERE username = $1",
      [name]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    // Check for existing email
    const existingEmail = await pool.query(
      "SELECT 1 FROM users WHERE email = $1",
      [normalizedEmail]
    );
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ message: "Email already exists" });
    }

    await pool.query(
      `
      INSERT INTO users (username, password, role, customer_id, is_active, email, created_at)
      VALUES ($1, $2, 'REVIEWER', NULL, true, $3, NOW())
      `,
      [name, pwd, normalizedEmail]
    );

    res.status(201).json({ message: "Reviewer user created successfully" });
  } catch (err) {
    console.error("CREATE REVIEWER USER ERROR:", err);
    res.status(500).json({ message: "Failed to create reviewer user" });
  }
};

const createAdmin = async (req, res) => {
  const { username, password, email } = req.body || {};

  if (!username || !username.trim() || !password || !password.trim()) {
    return res.status(400).json({ message: "username and password are required" });
  }

  // Validate email
  if (!email || !email.trim()) {
    return res.status(400).json({ message: "email is required" });
  }

  const emailValidation = validateEmail(email);
  if (!emailValidation.isValid) {
    return res.status(400).json({ message: emailValidation.error });
  }

  const name = username.trim();
  const pwd = password.trim();
  const normalizedEmail = emailValidation.normalized;

  try {
    // Check for existing username
    const existingUser = await pool.query(
      "SELECT 1 FROM users WHERE username = $1",
      [name]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    // Check for existing email
    const existingEmail = await pool.query(
      "SELECT 1 FROM users WHERE email = $1",
      [normalizedEmail]
    );
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ message: "Email already exists" });
    }

    await pool.query(
      `
      INSERT INTO users (username, password, role, customer_id, is_active, email, created_at)
      VALUES ($1, $2, 'ADMIN', NULL, true, $3, NOW())
      `,
      [name, pwd, normalizedEmail]
    );

    res.status(201).json({ message: "Admin user created successfully" });
  } catch (err) {
    console.error("CREATE ADMIN USER ERROR:", err);
    res.status(500).json({ message: "Failed to create admin user" });
  }
};

const createSuperAdmin = async (req, res) => {
  const { username, password, email } = req.body || {};

  if (!username || !username.trim() || !password || !password.trim()) {
    return res.status(400).json({ message: "username and password are required" });
  }

  // Validate email
  if (!email || !email.trim()) {
    return res.status(400).json({ message: "email is required" });
  }

  const emailValidation = validateEmail(email);
  if (!emailValidation.isValid) {
    return res.status(400).json({ message: emailValidation.error });
  }

  const name = username.trim();
  const pwd = password.trim();
  const normalizedEmail = emailValidation.normalized;

  try {
    // Check for existing username
    const existingUser = await pool.query(
      "SELECT 1 FROM users WHERE username = $1",
      [name]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    // Check for existing email
    const existingEmail = await pool.query(
      "SELECT 1 FROM users WHERE email = $1",
      [normalizedEmail]
    );
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ message: "Email already exists" });
    }

    await pool.query(
      `
      INSERT INTO users (username, password, role, customer_id, is_active, email, created_at)
      VALUES ($1, $2, 'SUPER_ADMIN', NULL, true, $3, NOW())
      `,
      [name, pwd, normalizedEmail]
    );

    res.status(201).json({ message: "Super Admin user created successfully" });
  } catch (err) {
    console.error("CREATE SUPER_ADMIN USER ERROR:", err);
    res.status(500).json({ message: "Failed to create superadmin user" });
  }
};

// Get all users (for management)
const getAllUsers = async (req, res) => {
  const role = req.headers["x-user-role"];
  
  // Only reviewers can view all users
  if (role !== "REVIEWER") {
    return res.status(403).json({ message: "Only reviewers can view all users" });
  }

  try {
    const result = await pool.query(
      `
      SELECT 
        u.id,
        u.username,
        u.role,
        u.is_active,
        u.customer_id,
        u.email,
        u.created_at,
        c.customer_name,
        c.customer_code
      FROM users u
      LEFT JOIN customers c ON c.id = u.customer_id
      WHERE u.role IN ('CUSTOMER', 'REVIEWER', 'ADMIN', 'SUPER_ADMIN')
      ORDER BY 
        CASE u.role
          WHEN 'SUPER_ADMIN' THEN 1
          WHEN 'ADMIN' THEN 2
          WHEN 'REVIEWER' THEN 3
          WHEN 'CUSTOMER' THEN 4
        END,
        u.username
      `
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error("GET ALL USERS ERROR:", err);
    res.status(500).json({ message: "Failed to load users" });
  }
};

// Update user status (active/inactive)
const updateUserStatus = async (req, res) => {
  const { userId } = req.params;
  const { is_active } = req.body;
  const role = req.headers["x-user-role"];
  
  // Only reviewers can update user status
  if (role !== "REVIEWER") {
    return res.status(403).json({ message: "Only reviewers can update user status" });
  }

  if (typeof is_active !== "boolean") {
    return res.status(400).json({ message: "is_active must be a boolean" });
  }

  try {
    const result = await pool.query(
      `
      UPDATE users 
      SET is_active = $1
      WHERE id = $2
      RETURNING id, username, role, is_active
      `,
      [is_active, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: `User ${is_active ? "activated" : "deactivated"} successfully`,
      user: result.rows[0],
    });
  } catch (err) {
    console.error("UPDATE USER STATUS ERROR:", err);
    res.status(500).json({ message: "Failed to update user status" });
  }
};

// Update user email
const updateUserEmail = async (req, res) => {
  const { userId } = req.params;
  const { email } = req.body;
  const role = req.headers["x-user-role"];
  
  // Only reviewers can update user email
  if (role !== "REVIEWER") {
    return res.status(403).json({ message: "Only reviewers can update user email" });
  }

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ message: "email is required" });
  }

  // Validate email format
  const emailValidation = validateEmail(email);
  if (!emailValidation.isValid) {
    return res.status(400).json({ message: emailValidation.error });
  }

  const normalizedEmail = emailValidation.normalized;

  try {
    // Check if user exists
    const userCheck = await pool.query(
      "SELECT id, email FROM users WHERE id = $1",
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if email is already used by another user
    const existingEmail = await pool.query(
      "SELECT id FROM users WHERE email = $1 AND id != $2",
      [normalizedEmail, userId]
    );
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ message: "Email already exists" });
    }

    // Update email
    const result = await pool.query(
      `
      UPDATE users 
      SET email = $1
      WHERE id = $2
      RETURNING id, username, role, email
      `,
      [normalizedEmail, userId]
    );

    res.json({
      message: "User email updated successfully",
      user: result.rows[0],
    });
  } catch (err) {
    console.error("UPDATE USER EMAIL ERROR:", err);
    res.status(500).json({ message: "Failed to update user email" });
  }
};

module.exports = {
  createReviewer,
  createAdmin,
  createSuperAdmin,
  getAllUsers,
  updateUserStatus,
  updateUserEmail,
};
