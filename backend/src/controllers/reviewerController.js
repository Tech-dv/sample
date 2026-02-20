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

    // ─── Notify super admins when reviewer approves/submits a task ───
    (async () => {
      try {
        const { sendAlertEmail } = require("../services/emailService");
        const { isValidEmail } = require("../utils/emailValidator");

        const superAdminRes = await pool.query(
          `SELECT u.email, u.username
           FROM users u
           WHERE u.role = 'SUPER_ADMIN'
             AND u.is_active = true
             AND u.email IS NOT NULL
             AND u.email <> ''`
        );

        if (superAdminRes.rows.length === 0) {
          console.log(`[APPROVE-NOTIFY] No active super admins found to notify`);
          return;
        }

        const validRecipients = superAdminRes.rows.filter(u => isValidEmail(u.email));
        if (validRecipients.length === 0) {
          console.log(`[APPROVE-NOTIFY] No valid super admin email addresses found`);
          return;
        }

        // Resolve indent_number from dashboard_records if not provided
        let resolvedIndentNumber = indentNum;
        if (!resolvedIndentNumber) {
          const indentRes = await pool.query(
            `SELECT indent_number FROM dashboard_records
             WHERE rake_serial_number = $1
             AND indent_number IS NOT NULL
             AND indent_number <> ''
             ORDER BY indent_number
             LIMIT 1`,
            [actualRakeSerialNumber]
          );
          resolvedIndentNumber = indentRes.rows[0]?.indent_number || null;
        }

        const recipientEmails = validRecipients.map(u => u.email);
        const subject = `Reviewer Approved – Rake ${actualRakeSerialNumber}`;

        const html = `
          <div style="font-family:Arial,sans-serif;max-width:700px;">
            <h2 style="color:#27ae60;">✅ Record Approved by Reviewer</h2>
            <p>A rake entry has been reviewed and approved. Your final sign-off may be required.</p>
            <table style="border-collapse:collapse;width:100%;margin:16px 0;">
              <thead>
                <tr style="background:#0B3A6E;color:#fff;">
                  <th style="padding:8px 12px;text-align:left;">Rake Serial</th>
                  <th style="padding:8px 12px;text-align:left;">Indent</th>
                  <th style="padding:8px 12px;text-align:left;">Approved By</th>
                  <th style="padding:8px 12px;text-align:left;">Approved At</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding:8px 12px;border:1px solid #ddd;">${actualRakeSerialNumber}</td>
                  <td style="padding:8px 12px;border:1px solid #ddd;">${resolvedIndentNumber || "-"}</td>
                  <td style="padding:8px 12px;border:1px solid #ddd;">${reviewerUsername}</td>
                  <td style="padding:8px 12px;border:1px solid #ddd;">${new Date().toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            <p style="color:#555;font-size:13px;">
              Please log in to the system to complete final approval for this entry.
            </p>
          </div>
        `;

        await sendAlertEmail(recipientEmails, subject, html);
        console.log(`[APPROVE-NOTIFY] Approval notification sent to ${recipientEmails.join(", ")} for rake ${actualRakeSerialNumber} by reviewer ${reviewerUsername}`);
      } catch (emailErr) {
        console.error(`[APPROVE-NOTIFY] Failed to send approval notification:`, emailErr.message);
      }
    })();

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

    // ─── Notify admins when reviewer cancels an indent ───
    (async () => {
      try {
        const { sendAlertEmail } = require("../services/emailService");
        const { isValidEmail } = require("../utils/emailValidator");

        const adminRes = await pool.query(
          `SELECT u.email, u.username
           FROM users u
           WHERE u.role = 'ADMIN'
             AND u.is_active = true
             AND u.email IS NOT NULL
             AND u.email <> ''`
        );

        if (adminRes.rows.length === 0) {
          console.log(`[CANCEL-NOTIFY] No active admins found to notify`);
          return;
        }

        const validRecipients = adminRes.rows.filter(u => isValidEmail(u.email));
        if (validRecipients.length === 0) {
          console.log(`[CANCEL-NOTIFY] No valid admin email addresses found`);
          return;
        }

        // Resolve indent_number from dashboard_records if not provided
        let resolvedIndentNumber = indent_number || null;
        if (!resolvedIndentNumber) {
          const indentRes = await pool.query(
            `SELECT indent_number FROM dashboard_records
             WHERE rake_serial_number = $1
             AND indent_number IS NOT NULL
             AND indent_number <> ''
             ORDER BY indent_number
             LIMIT 1`,
            [rakeSerialNumber]
          );
          resolvedIndentNumber = indentRes.rows[0]?.indent_number || null;
        }

        const recipientEmails = validRecipients.map(u => u.email);
        const subject = `Indent Cancelled – Rake ${rakeSerialNumber}`;

        const html = `
          <div style="font-family:Arial,sans-serif;max-width:700px;">
            <h2 style="color:#c0392b;">🚫 Indent Cancelled by Reviewer</h2>
            <p>A rake indent has been cancelled by reviewer <strong>${reviewerUsername}</strong>.</p>
            <table style="border-collapse:collapse;width:100%;margin:16px 0;">
              <thead>
                <tr style="background:#0B3A6E;color:#fff;">
                  <th style="padding:8px 12px;text-align:left;">Rake Serial</th>
                  <th style="padding:8px 12px;text-align:left;">Indent</th>
                  <th style="padding:8px 12px;text-align:left;">Cancelled By</th>
                  <th style="padding:8px 12px;text-align:left;">Cancelled At</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding:8px 12px;border:1px solid #ddd;">${rakeSerialNumber}</td>
                  <td style="padding:8px 12px;border:1px solid #ddd;">${resolvedIndentNumber || "-"}</td>
                  <td style="padding:8px 12px;border:1px solid #ddd;">${reviewerUsername}</td>
                  <td style="padding:8px 12px;border:1px solid #ddd;">${new Date().toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            ${remarks ? `
            <table style="border-collapse:collapse;width:100%;margin:8px 0;">
              <thead>
                <tr style="background:#0B3A6E;color:#fff;">
                  <th style="padding:8px 12px;text-align:left;">Cancellation Reason</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding:8px 12px;border:1px solid #ddd;">${remarks}</td>
                </tr>
              </tbody>
            </table>` : ""}
            <p style="color:#555;font-size:13px;">
              Please log in to the system to take any necessary follow-up action.
            </p>
          </div>
        `;

        await sendAlertEmail(recipientEmails, subject, html);
        console.log(`[CANCEL-NOTIFY] Cancellation email sent to ${recipientEmails.join(", ")} for rake ${rakeSerialNumber} by reviewer ${reviewerUsername}`);
      } catch (emailErr) {
        console.error(`[CANCEL-NOTIFY] Failed to send cancellation email for rake ${rakeSerialNumber}:`, emailErr.message);
      }
    })();

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
