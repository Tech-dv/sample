const pool = require("../config/database");

const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    // First check if user exists with correct password (regardless of active status)
    const userCheck = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.customer_id,
        u.is_active,
        c.customer_name
      FROM users u
      LEFT JOIN customers c ON c.id = u.customer_id
      WHERE u.username=$1 AND u.password=$2
      `,
      [username, password]
    );

    // If user doesn't exist or password is wrong
    if (!userCheck.rows.length) {
      return res.status(401).json({ message: "Invalid credentials", errorType: "INVALID_CREDENTIALS" });
    }

    const user = userCheck.rows[0];

    // If user exists but is inactive
    if (!user.is_active) {
      return res.status(403).json({ message: "Your account is inactive. Please contact your administrator.", errorType: "INACTIVE_ACCOUNT" });
    }

    // User is active, return user data (without is_active field for security)
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      customer_id: user.customer_id,
      customer_name: user.customer_name,
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  login,
};
