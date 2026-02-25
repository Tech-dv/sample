const pool = require("../config/database");

const updateWagonStatus = async (req, res) => {
  const { trainId, towerNumber } = req.params;
  const decodedTrainId = trainId.replace(/_/g, "/");
  const { loading_status } = req.body;

  // When a user manually sets loading_status to false, mark the override flag so
  // the background poller does not automatically flip it back to true.
  // When manually set to true, clear the override flag so the poller can manage it normally.
  const manualOverride = loading_status === false || loading_status === "false";

  try {
    await pool.query(
      `
      UPDATE wagon_records
      SET loading_status = $1,
          loading_status_manual_override = $2
      WHERE rake_serial_number = $3 AND tower_number = $4
      `,
      [loading_status, manualOverride, decodedTrainId, towerNumber]
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
