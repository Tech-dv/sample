const pool = require("../config/database");

// Helper function for activity timeline
const addActivityTimelineEntry = async (trainId, indentNumber, activityType, username, notes = null, rakeSerialNumberParam = null) => {
  try {
    let rakeSerialNumber = rakeSerialNumberParam;
    if (!rakeSerialNumber) {
      try {
        const trainSessionRes = await pool.query(
          "SELECT rake_serial_number FROM train_session WHERE rake_serial_number = $1 LIMIT 1",
          [trainId]
        );
        if (trainSessionRes.rows.length > 0 && trainSessionRes.rows[0].rake_serial_number) {
          rakeSerialNumber = trainSessionRes.rows[0].rake_serial_number;
        } else {
          const dashboardRes = await pool.query(
            "SELECT rake_serial_number FROM dashboard_records WHERE rake_serial_number = $1 LIMIT 1",
            [trainId]
          );
          if (dashboardRes.rows.length > 0 && dashboardRes.rows[0].rake_serial_number) {
            rakeSerialNumber = dashboardRes.rows[0].rake_serial_number;
          }
        }
      } catch (err) {
        console.error("[ACTIVITY] Error resolving rake_serial_number:", err);
      }
    }

    const finalRakeSerialNumber = rakeSerialNumber || trainId;
    
    await pool.query(
      `
      INSERT INTO activity_timeline (indent_number, activity_type, username, activity_time, notes, rake_serial_number)
      VALUES ($1, $2, $3, NOW(), $4, $5)
      `,
      [indentNumber || null, activityType, username, notes, finalRakeSerialNumber]
    );
    console.log(`[ACTIVITY] Added ${activityType} activity for train ${finalRakeSerialNumber} by ${username}`);
  } catch (err) {
    console.error("[ACTIVITY] Error adding activity timeline entry:", err);
  }
};

const getTasks = async (req, res) => {
  const { tab } = req.query; // open, assigned, completed
  const reviewerUsername = req.headers["x-reviewer-username"];

  try {
    let query, params;

    if (tab === "open") {
      query = `
        SELECT 
          d.rake_serial_number,
          d.indent_number,
          d.siding,
          d.status,
          d.created_time,
          COALESCE(dp.rake_loading_start_datetime, MIN(w.loading_start_time)) AS rake_loading_start_datetime,
          COALESCE(dp.rake_loading_end_actual, MAX(w.loading_end_time)) AS rake_loading_end_actual,
          MAX(rc.random_count_start_time) AS random_count_start_time,
          COALESCE(SUM(w.loaded_bag_count), 0) AS total_bags_loaded
        FROM dashboard_records d
        LEFT JOIN dispatch_records dp ON dp.rake_serial_number = d.rake_serial_number
          AND (
            d.single_indent = true 
            OR dp.indent_number = d.indent_number 
            OR (dp.indent_number IS NULL AND (d.indent_number IS NULL OR d.indent_number = ''))
          )
        LEFT JOIN random_counting_records rc ON rc.rake_serial_number = d.rake_serial_number
        LEFT JOIN wagon_records w ON w.rake_serial_number = d.rake_serial_number
          AND (d.single_indent = true OR w.indent_number = d.indent_number)
        WHERE d.status = 'PENDING_APPROVAL' 
          AND (d.assigned_reviewer IS NULL OR d.assigned_reviewer = '')
        GROUP BY d.rake_serial_number, d.indent_number, d.siding, d.status, d.created_time,
          dp.rake_loading_start_datetime, dp.rake_loading_end_actual
        ORDER BY d.created_time DESC
`;
      params = [];
    } else if (tab === "assigned") {
      query = `
        SELECT 
          d.rake_serial_number,
          d.indent_number,
          d.siding,
          d.status,
          d.created_time,
          COALESCE(dp.rake_loading_start_datetime, MIN(w.loading_start_time)) AS rake_loading_start_datetime,
          COALESCE(dp.rake_loading_end_actual, MAX(w.loading_end_time)) AS rake_loading_end_actual,
          MAX(rc.random_count_start_time) AS random_count_start_time,
          COALESCE(SUM(w.loaded_bag_count), 0) AS total_bags_loaded
        FROM dashboard_records d
        LEFT JOIN dispatch_records dp ON dp.rake_serial_number = d.rake_serial_number
          AND (
            d.single_indent = true 
            OR dp.indent_number = d.indent_number 
            OR (dp.indent_number IS NULL AND (d.indent_number IS NULL OR d.indent_number = ''))
          )
        LEFT JOIN random_counting_records rc ON rc.rake_serial_number = d.rake_serial_number
        LEFT JOIN wagon_records w ON w.rake_serial_number = d.rake_serial_number
          AND (d.single_indent = true OR w.indent_number = d.indent_number)
        WHERE d.assigned_reviewer = $1
          AND d.status IN ('PENDING_APPROVAL', 'LOADING_IN_PROGRESS')
        GROUP BY d.rake_serial_number, d.indent_number, d.siding, d.status, d.created_time,
          dp.rake_loading_start_datetime, dp.rake_loading_end_actual
        ORDER BY d.created_time DESC
      `;
      params = [reviewerUsername];
    } else if (tab === "completed") {
      query = `
        SELECT 
          d.rake_serial_number,
          d.indent_number,
          d.siding,
          d.status,
          d.created_time,
          COALESCE(dp.rake_loading_start_datetime, MIN(w.loading_start_time)) AS rake_loading_start_datetime,
          COALESCE(dp.rake_loading_end_actual, MAX(w.loading_end_time)) AS rake_loading_end_actual,
          MAX(rc.random_count_start_time) AS random_count_start_time,
          COALESCE(SUM(w.loaded_bag_count), 0) AS total_bags_loaded
        FROM dashboard_records d
        LEFT JOIN dispatch_records dp ON dp.rake_serial_number = d.rake_serial_number
          AND (
            d.single_indent = true 
            OR dp.indent_number = d.indent_number 
            OR (dp.indent_number IS NULL AND (d.indent_number IS NULL OR d.indent_number = ''))
          )
        LEFT JOIN random_counting_records rc ON rc.rake_serial_number = d.rake_serial_number
        LEFT JOIN wagon_records w ON w.rake_serial_number = d.rake_serial_number
          AND (d.single_indent = true OR w.indent_number = d.indent_number)
        WHERE d.status IN ('APPROVED', 'CANCELLED')
          AND d.assigned_reviewer = $1
        GROUP BY d.rake_serial_number, d.indent_number, d.siding, d.status, d.created_time,
          dp.rake_loading_start_datetime, dp.rake_loading_end_actual
        ORDER BY d.created_time DESC
      `;
      params = [reviewerUsername];
    } else {
      return res.status(400).json({ message: "Invalid tab parameter" });
    }

    const result = await pool.query(query, params);
    res.json({ tasks: result.rows });
  } catch (err) {
    console.error("REVIEWER TASKS ERROR:", err);
    res.status(500).json({ message: "Failed to fetch tasks" });
  }
};

const assignTask = async (req, res) => {
  const { trainId } = req.params;
  const rawIndentNumber = req.body && req.body.indent_number;
  const indent_number = rawIndentNumber && rawIndentNumber.trim() !== "" ? rawIndentNumber.trim() : null;
  const reviewerUsername = req.headers["x-reviewer-username"];

  try {
    const decodedTrainId = decodeURIComponent(trainId);
    const rakeSerialNumber = decodedTrainId;

    let updateQuery, updateParams;

    if (indent_number) {
      updateQuery = `
        UPDATE dashboard_records 
        SET assigned_reviewer = $1,
            status = 'LOADING_IN_PROGRESS'
        WHERE rake_serial_number = $2 AND indent_number = $3
      `;
      updateParams = [reviewerUsername, rakeSerialNumber, indent_number];
    } else {
      updateQuery = `
        UPDATE dashboard_records 
        SET assigned_reviewer = $1,
            status = 'LOADING_IN_PROGRESS'
        WHERE rake_serial_number = $2
        AND (indent_number IS NULL OR indent_number = '')
      `;
      updateParams = [reviewerUsername, rakeSerialNumber];
    }

    const result = await pool.query(updateQuery, updateParams);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json({ message: "Task assigned successfully" });
  } catch (err) {
    console.error("ASSIGN TASK ERROR:", err);
    res.status(500).json({ message: "Failed to assign task" });
  }
};

const approveTask = async (req, res) => {
  const { trainId } = req.params;
  const { indent_number } = req.body;
  const reviewerUsername = req.headers["x-reviewer-username"];

  try {
    const decodedTrainId = decodeURIComponent(trainId);
    const rakeSerialNumber = decodedTrainId;
    const indentNum = indent_number && indent_number.trim() !== "" ? indent_number.trim() : null;

    let dispatchQuery, dispatchParams;
    if (indentNum) {
      dispatchQuery = `
        SELECT indent_wagon_count, vessel_name, rake_type, rake_placement_datetime,
               rake_clearance_datetime, rake_idle_time, loading_start_officer,
               loading_completion_officer, remarks, rr_number, rake_loading_end_railway,
               rake_loading_start_datetime, rake_loading_end_actual, status
        FROM dispatch_records
        WHERE rake_serial_number = $1 AND indent_number = $2
      `;
      dispatchParams = [rakeSerialNumber, indentNum];
    } else {
      dispatchQuery = `
        SELECT indent_wagon_count, vessel_name, rake_type, rake_placement_datetime,
               rake_clearance_datetime, rake_idle_time, loading_start_officer,
               loading_completion_officer, remarks, rr_number, rake_loading_end_railway,
               rake_loading_start_datetime, rake_loading_end_actual, status
        FROM dispatch_records
        WHERE rake_serial_number = $1 AND (indent_number IS NULL OR indent_number = '')
      `;
      dispatchParams = [rakeSerialNumber];
    }

    const dispatchRes = await pool.query(dispatchQuery, dispatchParams);
    const dispatchRecord = dispatchRes.rows[0];

    let checkQuery, checkParams;
    if (indentNum) {
      checkQuery = `SELECT rake_serial_number, assigned_reviewer, status FROM dashboard_records 
                    WHERE (rake_serial_number = $1 OR rake_serial_number LIKE $2)
                    AND indent_number = $3`;
      checkParams = [rakeSerialNumber, `${rakeSerialNumber}-%`, indentNum];
    } else {
      checkQuery = `SELECT rake_serial_number, assigned_reviewer, status FROM dashboard_records 
                    WHERE (rake_serial_number = $1 OR rake_serial_number LIKE $2)
                    AND (indent_number IS NULL OR indent_number = '')`;
      checkParams = [rakeSerialNumber, `${rakeSerialNumber}-%`];
    }

    const checkResult = await pool.query(checkQuery, checkParams);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        message: "Task not found. Please check the train ID and indent number."
      });
    }

    const existingRecord = checkResult.rows[0];
    const assignedTo = existingRecord.assigned_reviewer;
    const currentStatus = existingRecord.status;
    const actualRakeSerialNumber = existingRecord.rake_serial_number;

    if (assignedTo && assignedTo !== reviewerUsername) {
      return res.status(403).json({
        message: `Task is assigned to a different reviewer: ${assignedTo}`
      });
    }

    let updateQuery, updateParams;
    if (indentNum) {
      if (assignedTo === null || assignedTo === '') {
        updateQuery = `
          UPDATE dashboard_records 
          SET status = 'APPROVED', assigned_reviewer = $3
          WHERE rake_serial_number = $1
            AND indent_number = $2
        `;
        updateParams = [actualRakeSerialNumber, indentNum, reviewerUsername];
      } else {
        updateQuery = `
        UPDATE dashboard_records 
        SET status = 'APPROVED'
          WHERE rake_serial_number = $1
            AND indent_number = $2 
            AND assigned_reviewer = $3
      `;
        updateParams = [actualRakeSerialNumber, indentNum, reviewerUsername];
      }
    } else {
      if (assignedTo === null || assignedTo === '') {
        updateQuery = `
          UPDATE dashboard_records 
          SET status = 'APPROVED', assigned_reviewer = $2
          WHERE rake_serial_number = $1
            AND (indent_number IS NULL OR indent_number = '')
        `;
        updateParams = [actualRakeSerialNumber, reviewerUsername];
      } else {
        updateQuery = `
        UPDATE dashboard_records 
        SET status = 'APPROVED'
          WHERE rake_serial_number = $1
            AND assigned_reviewer = $2
        AND (indent_number IS NULL OR indent_number = '')
      `;
        updateParams = [actualRakeSerialNumber, reviewerUsername];
      }
    }

    const result = await pool.query(updateQuery, updateParams);

    if (result.rowCount === 0) {
      return res.status(500).json({
        message: "Failed to approve task. Please try again."
      });
    }

    let activityNotes = 'Dispatch submitted and approved by reviewer';

    if (dispatchRecord && dispatchRecord.status === 'DRAFT') {
      activityNotes = 'Dispatch reviewed and approved by reviewer';
    } else if (dispatchRecord && dispatchRecord.status === 'PENDING_APPROVAL') {
      activityNotes = 'Dispatch approved by reviewer (no changes made)';
    }

    await addActivityTimelineEntry(
      actualRakeSerialNumber,
      indentNum || null,
      'REVIEWER_SUBMITTED',
      reviewerUsername,
      activityNotes
    );

    res.json({ message: "Task approved successfully" });
  } catch (err) {
    console.error("APPROVE TASK ERROR:", err);
    res.status(500).json({ message: "Failed to approve task" });
  }
};

const rejectTask = async (req, res) => {
  const { trainId } = req.params;
  const { indent_number } = req.body;
  const reviewerUsername = req.headers["x-reviewer-username"];

  try {
    let updateQuery, updateParams;

    if (indent_number) {
      updateQuery = `
        UPDATE dashboard_records 
        SET status = 'REJECTED',
            assigned_reviewer = NULL
        WHERE rake_serial_number = $1 AND indent_number = $2 AND assigned_reviewer = $3
      `;
      updateParams = [trainId, indent_number, reviewerUsername];
    } else {
      updateQuery = `
        UPDATE dashboard_records 
        SET status = 'REJECTED',
            assigned_reviewer = NULL
        WHERE rake_serial_number = $1 AND assigned_reviewer = $2
      `;
      updateParams = [trainId, reviewerUsername];
    }

    const result = await pool.query(updateQuery, updateParams);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Task not found or not assigned to you" });
    }

    const { remarks } = req.body;
    await addActivityTimelineEntry(
      trainId,
      indent_number || null,
      'REJECTED',
      reviewerUsername,
      remarks ? `Task rejected: ${remarks}` : 'Task rejected by reviewer'
    );

    res.json({ message: "Task rejected successfully" });
  } catch (err) {
    console.error("REJECT TASK ERROR:", err);
    res.status(500).json({ message: "Failed to reject task" });
  }
};

const cancelTask = async (req, res) => {
  const { trainId } = req.params;
  const { indent_number, remarks } = req.body;
  const reviewerUsername = req.headers["x-reviewer-username"];

  try {
    const decodedTrainId = decodeURIComponent(trainId);
    const rakeSerialNumber = decodedTrainId;

    let updateQuery, updateParams;

    if (indent_number) {
      updateQuery = `
        UPDATE dashboard_records 
        SET status = 'CANCELLED',
            cancellation_remarks = $1,
            cancelled_by = $2,
            cancelled_at = NOW()
        WHERE rake_serial_number = $3 AND indent_number = $4 AND assigned_reviewer = $5
      `;
      updateParams = [remarks, reviewerUsername, rakeSerialNumber, indent_number, reviewerUsername];
    } else {
      updateQuery = `
        UPDATE dashboard_records 
        SET status = 'CANCELLED',
            cancellation_remarks = $1,
            cancelled_by = $2,
            cancelled_at = NOW()
        WHERE rake_serial_number = $3 AND assigned_reviewer = $4
      `;
      updateParams = [remarks, reviewerUsername, rakeSerialNumber, reviewerUsername];
    }

    const result = await pool.query(updateQuery, updateParams);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Task not found or not assigned to you" });
    }

    await addActivityTimelineEntry(
      rakeSerialNumber,
      indent_number || null,
      'CANCELLED',
      reviewerUsername,
      remarks ? `Indent cancelled: ${remarks}` : 'Indent cancelled by reviewer'
    );

    res.json({ message: "Task cancelled successfully" });
  } catch (err) {
    console.error("CANCEL TASK ERROR:", err);
    res.status(500).json({ message: "Failed to cancel task" });
  }
};

const getReviewerTrain = async (req, res) => {
  const { trainId } = req.params;
  const indentNumber = req.query.indent_number;

  try {
    const decodedTrainId = decodeURIComponent(trainId);
    const rakeSerialNumber = decodedTrainId;

    let headerQuery, headerParams;
    if (indentNumber) {
      headerQuery = `
        SELECT d.*, c.customer_name
        FROM dashboard_records d
        LEFT JOIN customers c ON c.id = d.customer_id
        WHERE d.rake_serial_number = $1 AND d.indent_number = $2
        LIMIT 1
      `;
      headerParams = [rakeSerialNumber, indentNumber];
    } else {
      headerQuery = `
        SELECT d.*, c.customer_name
        FROM dashboard_records d
        LEFT JOIN customers c ON c.id = d.customer_id
        WHERE d.rake_serial_number = $1
        LIMIT 1
      `;
      headerParams = [rakeSerialNumber];
    }

    const headerRes = await pool.query(headerQuery, headerParams);

    if (headerRes.rows.length === 0) {
      return res.status(404).json({ message: "Train not found" });
    }

    let wagonQuery, wagonParams;
    if (indentNumber) {
      wagonQuery = `
        SELECT * FROM wagon_records
        WHERE rake_serial_number = $1 AND indent_number = $2
        ORDER BY tower_number
      `;
      wagonParams = [rakeSerialNumber, indentNumber];
    } else {
      wagonQuery = `
        SELECT * FROM wagon_records
        WHERE rake_serial_number = $1
        ORDER BY tower_number
      `;
      wagonParams = [rakeSerialNumber];
    }

    const wagonRes = await pool.query(wagonQuery, wagonParams);

    const dispatchRes = await pool.query(
      "SELECT * FROM dispatch_records WHERE rake_serial_number = $1",
      [rakeSerialNumber]
    );

    res.json({
      header: headerRes.rows[0],
      wagons: wagonRes.rows,
      dispatch: dispatchRes.rows[0] || null,
    });
  } catch (err) {
    console.error("REVIEWER LOAD ERROR:", err);
    res.status(500).json({ message: "Failed to load train data" });
  }
};

module.exports = {
  getTasks,
  assignTask,
  approveTask,
  rejectTask,
  cancelTask,
  getReviewerTrain,
};
