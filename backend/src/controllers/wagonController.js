const pool = require("../config/database");

const updateWagonStatus = async (req, res) => {
  const { trainId, towerNumber } = req.params;
  const decodedTrainId = trainId.replace(/_/g, "/");
  const { loading_status } = req.body;

  try {
    await pool.query(
      `
      UPDATE wagon_records
      SET loading_status = $1
      WHERE rake_serial_number = $2 AND tower_number = $3
      `,
      [loading_status, decodedTrainId, towerNumber]
    );

    res.json({ message: "Wagon status updated" });
  } catch (err) {
    console.error("WAGON STATUS UPDATE ERROR:", err);
    res.status(500).json({ message: "Failed to update wagon status" });
  }
};

module.exports = {
  updateWagonStatus,
};
