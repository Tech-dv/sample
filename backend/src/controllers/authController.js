const pool = require("../config/database");

const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.customer_id,
        c.customer_name
      FROM users u
      LEFT JOIN customers c ON c.id = u.customer_id
      WHERE u.username=$1 AND u.password=$2 AND u.is_active = true
      `,
      [username, password]
    );

    if (!result.rows.length) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  login,
};
