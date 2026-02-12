const pool = require("../config/database");

const getCameras = async (req, res) => {
  const { siding, search = "", status } = req.query;

  if (!siding) {
    return res.status(400).json({ message: "siding is required" });
  }

  try {
    const conditions = ["siding = $1"];
    const values = [siding];
    let idx = 2;

    if (search) {
      conditions.push(`LOWER(camera_name) LIKE $${idx}`);
      values.push(`%${search.toLowerCase()}%`);
      idx++;
    }

    if (status === "active") {
      conditions.push(`status = true`);
    }

    if (status === "inactive") {
      conditions.push(`status = false`);
    }

    const query = `
      SELECT
        id,
        camera_name,
        siding,
        status
      FROM camera_records
      WHERE ${conditions.join(" AND ")}
      ORDER BY camera_name
    `;

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error("CAMERA LIST ERROR:", err);
    res.status(500).json({ message: "Failed to load cameras" });
  }
};

module.exports = {
  getCameras,
};
