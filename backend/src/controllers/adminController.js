const pool = require("../config/database");
const fs = require("fs");
const path = require("path");

const saveDraft = async (req, res) => {
  const { indent_number } = req.body;
  const train_id = req.params.train_id;

  const statusRes = await pool.query(
    "SELECT status FROM dashboard_records WHERE rake_serial_number = $1",
    [train_id]
  );

  if (!statusRes.rows.length) {
    return res.status(404).json({ message: "Train not found" });
  }

  if (["PENDING_APPROVAL", "APPROVED"].includes(statusRes.rows[0].status)) {
    return res.status(403).json({ message: "Cannot edit after submission" });
  }

  await pool.query(
    `
    UPDATE dashboard_records
    SET indent_number = $1,
        status = 'DRAFT'
    WHERE rake_serial_number = $2
    `,
    [indent_number || null, train_id]
  );

  res.json({ message: "Saved as draft" });
};

const applySequentialTrigger = async (req, res) => {
  try {
    const triggerSqlPath = path.join(__dirname, "..", "..", "assign_sequential_train_id_trigger.sql");
    const triggerSql = fs.readFileSync(triggerSqlPath, "utf8");

    await pool.query(triggerSql);

    const checkTrigger = await pool.query(
      "SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_assign_sequential_train_id')"
    );

    if (checkTrigger.rows[0].exists) {
      res.json({
        message: "Sequential train_id trigger applied successfully",
        triggerExists: true
      });
    } else {
      res.status(500).json({
        message: "Trigger SQL executed but trigger not found",
        triggerExists: false
      });
    }
  } catch (err) {
    console.error("[TRIGGER] Error applying trigger:", err);
    res.status(500).json({
      message: "Failed to apply trigger",
      error: err.message
    });
  }
};

const checkSequentialTrigger = async (req, res) => {
  try {
    const checkFunction = await pool.query(
      "SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'assign_sequential_train_id_on_count')"
    );

    const checkTrigger = await pool.query(
      "SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_assign_sequential_train_id')"
    );

    res.json({
      functionExists: checkFunction.rows[0].exists,
      triggerExists: checkTrigger.rows[0].exists,
      isActive: checkFunction.rows[0].exists && checkTrigger.rows[0].exists
    });
  } catch (err) {
    console.error("[TRIGGER] Error checking trigger:", err);
    res.status(500).json({
      message: "Failed to check trigger",
      error: err.message
    });
  }
};

const repairLegacySequentialTrainIds = async (req, res) => {
  try {
    const { base_train_id } = req.body || {};
    if (!base_train_id || typeof base_train_id !== "string") {
      return res.status(400).json({ message: "base_train_id is required" });
    }

    const legacyIdsRes = await pool.query(
      `
      SELECT DISTINCT rake_serial_number AS train_id
      FROM dashboard_records
      WHERE rake_serial_number LIKE $1
        AND rake_serial_number != $2
        AND rake_serial_number ~ ('^' || $2 || '-\\d+$')
      `,
      [`${base_train_id}-%`, base_train_id]
    );
    const legacyTrainIds = legacyIdsRes.rows.map(r => r.train_id);

    if (legacyTrainIds.length === 0) {
      return res.json({ message: "No legacy sequential train_ids found", updated: 0, legacyTrainIds: [] });
    }

    const dashUpdate = { rowCount: 0 };
    const wagonUpdate = { rowCount: 0 };
    const dispatchUpdate = { rowCount: 0 };

    res.json({
      message: "Legacy sequential train_ids repaired",
      legacyTrainIds,
      updated: legacyTrainIds.length,
      dashboard_rows: dashUpdate.rowCount,
      wagon_rows: wagonUpdate.rowCount,
      dispatch_rows: dispatchUpdate.rowCount,
    });
  } catch (err) {
    console.error("[TRIGGER] Error repairing legacy sequential train_ids:", err);
    res.status(500).json({ message: "Failed to repair legacy sequential train_ids", error: err.message });
  }
};

module.exports = {
  saveDraft,
  applySequentialTrigger,
  checkSequentialTrigger,
  repairLegacySequentialTrainIds,
};
