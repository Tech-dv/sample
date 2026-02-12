const pool = require("../config/database");
const path = require("path");
const { updateExcelWithCustomers } = require("../services/excelService");

const getCustomers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, customer_name FROM customers ORDER BY customer_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("CUSTOMERS LOAD ERROR:", err);
    res.status(500).json({ message: "Failed to load customers" });
  }
};

const createCustomer = async (req, res) => {
  const { customer_name, password } = req.body || {};

  if (!customer_name || !customer_name.trim() || !password || !password.trim()) {
    return res.status(400).json({ message: "customer_name and password are required" });
  }

  const name = customer_name.trim();
  const pwd = password.trim();

  try {
    // Check if username already exists
    const existingUser = await pool.query(
      "SELECT 1 FROM users WHERE username = $1",
      [name]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Username already exists" });
    }

    // Generate next customer_code based on max(id)
    const seqRes = await pool.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM customers");
    const nextId = seqRes.rows[0].next_id;
    const customerCode = `CUST-${String(nextId).padStart(3, "0")}`;

    // Insert into customers
    const custRes = await pool.query(
      `
      INSERT INTO customers (customer_code, customer_name, created_at)
      VALUES ($1, $2, NOW())
      RETURNING id, customer_code, customer_name, created_at
      `,
      [customerCode, name]
    );

    const customerId = custRes.rows[0].id;

    // Insert corresponding CUSTOMER user
    await pool.query(
      `
      INSERT INTO users (username, password, role, customer_id, is_active, created_at)
      VALUES ($1, $2, 'CUSTOMER', $3, true, NOW())
      `,
      [name, pwd, customerId]
    );

    // Update both Excel template files with new customer
    const frontendPublicPath = path.join(__dirname, "..", "..", "..", "frontend", "public");
    const singleIndentPath = path.join(frontendPublicPath, "single_indent.xlsx");
    const multipleIndentPath = path.join(frontendPublicPath, "mulitple_indent.xlsx");

    // Update both files asynchronously (don't wait for completion)
    updateExcelWithCustomers(singleIndentPath).catch(err =>
      console.error("Failed to update single_indent.xlsx:", err)
    );
    updateExcelWithCustomers(multipleIndentPath).catch(err =>
      console.error("Failed to update mulitple_indent.xlsx:", err)
    );

    res.status(201).json({
      message: "Customer created successfully",
      customer: custRes.rows[0],
    });
  } catch (err) {
    console.error("CREATE CUSTOMER ERROR:", err);
    res.status(500).json({ message: "Failed to create customer" });
  }
};

module.exports = {
  getCustomers,
  createCustomer,
};
