const pool = require("../config/database");

// Random counting handlers extracted from index.js
// Routes: /random-counting/*

const getTrains = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        rake_serial_number AS train_id,
        MAX(created_time) AS created_time
      FROM dashboard_records
      WHERE status NOT IN ('APPROVED', 'CANCELLED')
      GROUP BY rake_serial_number
      ORDER BY MAX(created_time) DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("RANDOM TRAIN LOAD ERROR:", err);
    res.status(500).json({ message: "Failed to load trains" });
  }
};

const getWagons = async (req, res) => {
  const { trainId } = req.params;
  const decodedTrainId = trainId.replace(/_/g, "/");

  try {
    const result = await pool.query(
      `
      SELECT
        wagon_number,
        tower_number,
        loaded_bag_count,
        unloaded_bag_count,
        wagon_to_be_loaded,
        loading_status,
        CASE 
          WHEN loading_status = true THEN true
          WHEN wagon_to_be_loaded IS NOT NULL 
            AND loaded_bag_count >= wagon_to_be_loaded 
            AND loaded_bag_count > 0 THEN true
          ELSE false
        END AS loading_completed
      FROM wagon_records
      WHERE rake_serial_number = $1
      ORDER BY tower_number
      `,
      [decodedTrainId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("RANDOM WAGON LOAD ERROR:", err);
    res.status(500).json({ message: "Failed to load wagons" });
  }
};

const getLiveCount = async (req, res) => {
  const { train_id, wagon_number } = req.query;
  const decodedTrainId = train_id ? train_id.replace(/_/g, "/") : null;
  const decodedWagonNumber = wagon_number ? wagon_number.replace(/_/g, "/") : null;

  if (!decodedTrainId || !decodedWagonNumber) {
    return res.status(400).json({ message: "Missing parameters" });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        loaded_bag_count,
        unloaded_bag_count
      FROM wagon_records
      WHERE rake_serial_number = $1 AND wagon_number = $2
      `,
      [decodedTrainId, decodedWagonNumber]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Wagon not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("RANDOM LIVE COUNT ERROR:", err);
    res.status(500).json({ message: "Live count failed" });
  }
};

const startCounting = async (req, res) => {
  const {
    train_id,
    wagon_number,
    tower_number,
    start_loaded_count,
    start_unloaded_count,
  } = req.body;

  try {
    await pool.query(
      `
      INSERT INTO random_counting_records (
        rake_serial_number,
        wagon_number,
        tower_number,
        start_loaded_count,
        start_unloaded_count,
        inspected_loading_count,
        inspected_unloading_count,
        random_count_start_time,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 0, 0, NOW(), 'IN_PROGRESS')
      `,
      [
        train_id,
        wagon_number,
        tower_number,
        start_loaded_count,
        start_unloaded_count,
      ]
    );

    res.json({ message: "Random counting inspection started" });
  } catch (err) {
    console.error("RANDOM START ERROR:", err);
    res.status(500).json({ message: "Failed to start inspection" });
  }
};

const getCompleted = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        rake_serial_number AS train_id,
        wagon_number,
        tower_number,
        inspected_loading_count,
        inspected_unloading_count,
        random_count_start_time,
        random_count_end_time,
        client_surveyor_name,
        bothra_surveyor_name,
        client_representative_name,
        remarks
      FROM random_counting_records
      WHERE status = 'COMPLETED'
      ORDER BY random_count_end_time DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("RANDOM COMPLETED LIST ERROR:", err);
    res.status(500).json({ message: "Failed to load completed inspections" });
  }
};

const getAll = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        rake_serial_number AS train_id,
        wagon_number,
        tower_number,
        inspected_loading_count,
        inspected_unloading_count,
        random_count_start_time,
        random_count_end_time,
        client_surveyor_name,
        bothra_surveyor_name,
        client_representative_name,
        remarks,
        status
      FROM random_counting_records
      ORDER BY 
        CASE WHEN status = 'IN_PROGRESS' THEN 0 ELSE 1 END,
        random_count_start_time DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("RANDOM COUNTING ALL ERROR:", err);
    res.status(500).json({ message: "Failed to load random counting records" });
  }
};

const getById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        rake_serial_number AS train_id,
        wagon_number,
        tower_number,
        start_loaded_count,
        start_unloaded_count,
        inspected_loading_count,
        inspected_unloading_count,
        random_count_start_time,
        random_count_end_time,
        client_surveyor_name,
        bothra_surveyor_name,
        client_representative_name,
        remarks,
        status
      FROM random_counting_records
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Random counting record not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("RANDOM COUNTING GET BY ID ERROR:", err);
    res.status(500).json({ message: "Failed to load random counting record" });
  }
};

const getCompletedById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        rake_serial_number AS train_id,
        wagon_number,
        tower_number,
        start_loaded_count,
        start_unloaded_count,
        inspected_loading_count,
        inspected_unloading_count,
        random_count_start_time,
        random_count_end_time,
        inspection_start_time,
        inspection_end_time,
        client_surveyor_name,
        bothra_surveyor_name,
        client_representative_name,
        remarks,
        created_at
      FROM random_counting_records
      WHERE id = $1
        AND status = 'COMPLETED'
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Record not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("RANDOM COMPLETED VIEW ERROR:", err);
    res.status(500).json({ message: "Failed to load inspection details" });
  }
};

const completeCounting = async (req, res) => {
  const {
    train_id,
    wagon_number,
    inspected_loading_count,
    inspected_unloading_count,
  } = req.body;

  try {
    await pool.query(
      `
      UPDATE random_counting_records
      SET
        inspected_loading_count = $1,
        inspected_unloading_count = $2,
        inspection_end_time = NOW(),
        random_count_end_time = NOW()
      WHERE rake_serial_number = $3
        AND wagon_number = $4
        AND status = 'IN_PROGRESS'
      `,
      [
        inspected_loading_count,
        inspected_unloading_count,
        train_id,
        wagon_number,
      ]
    );

    res.json({ message: "Inspection completed successfully" });
  } catch (err) {
    console.error("RANDOM COMPLETE ERROR:", err);
    res.status(500).json({ message: "Failed to complete inspection" });
  }
};

const saveCounting = async (req, res) => {
  const {
    id,
    train_id,
    wagon_number,
    client_surveyor_name,
    bothra_surveyor_name,
    client_representative_name,
    remarks,
    inspected_loading_count,
    inspected_unloading_count,
    inspection_completed,
  } = req.body;

  try {
    const newStatus = inspection_completed ? 'COMPLETED' : 'IN_PROGRESS';

    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (client_surveyor_name !== undefined) {
      updateFields.push(`client_surveyor_name = $${paramIndex++}`);
      values.push(client_surveyor_name);
    }
    if (bothra_surveyor_name !== undefined) {
      updateFields.push(`bothra_surveyor_name = $${paramIndex++}`);
      values.push(bothra_surveyor_name);
    }
    if (client_representative_name !== undefined) {
      updateFields.push(`client_representative_name = $${paramIndex++}`);
      values.push(client_representative_name);
    }
    if (remarks !== undefined) {
      updateFields.push(`remarks = $${paramIndex++}`);
      values.push(remarks);
    }
    if (inspected_loading_count !== undefined) {
      updateFields.push(`inspected_loading_count = $${paramIndex++}`);
      values.push(inspected_loading_count);
    }
    if (inspected_unloading_count !== undefined) {
      updateFields.push(`inspected_unloading_count = $${paramIndex++}`);
      values.push(inspected_unloading_count);
    }

    updateFields.push(`status = $${paramIndex++}`);
    values.push(newStatus);

    if (inspection_completed) {
      updateFields.push(`random_count_end_time = NOW()`);
    }

    values.push(id);
    values.push(train_id);
    values.push(wagon_number);

    const query = `
      UPDATE random_counting_records
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex++}
        AND rake_serial_number = $${paramIndex++}
        AND wagon_number = $${paramIndex}
    `;

    await pool.query(query, values);

    res.json({ message: "Random counting details saved successfully" });

    // ─── Notify admin, reviewer, super admin when random counting is completed ───
    if (inspection_completed) {
      (async () => {
        try {
          const { sendAlertEmail } = require("../services/emailService");
          const { isValidEmail } = require("../utils/emailValidator");

          const notifyUsersRes = await pool.query(
            `SELECT u.email, u.username, u.role
             FROM users u
             WHERE u.role IN ('ADMIN', 'REVIEWER', 'SUPER_ADMIN')
               AND u.is_active = true
               AND u.email IS NOT NULL
               AND u.email <> ''`
          );

          if (notifyUsersRes.rows.length === 0) {
            console.log(`[RANDOM-COUNT-NOTIFY] No active users found to notify`);
            return;
          }

          const validRecipients = notifyUsersRes.rows.filter(u => isValidEmail(u.email));
          if (validRecipients.length === 0) {
            console.log(`[RANDOM-COUNT-NOTIFY] No valid email addresses found`);
            return;
          }

          // Fetch wagon details for the email (wagon_number, rake_serial_number)
          const countingRecordRes = await pool.query(
            `SELECT 
               rake_serial_number,
               wagon_number,
               tower_number,
               start_loaded_count,
               start_unloaded_count,
               inspected_loading_count,
               inspected_unloading_count,
               random_count_start_time
             FROM random_counting_records
             WHERE id = $1`,
            [id]
          );

          const record = countingRecordRes.rows[0] || {};
          const rakeSerial = record.rake_serial_number || train_id;
          const wagonNum = record.wagon_number || wagon_number;
          const towerNum = record.tower_number || "-";
          const startLoaded = record.start_loaded_count ?? "-";
          const startUnloaded = record.start_unloaded_count ?? "-";
          const finalLoaded = inspected_loading_count ?? record.inspected_loading_count ?? "-";
          const finalUnloaded = inspected_unloading_count ?? record.inspected_unloading_count ?? "-";
          const startTime = record.random_count_start_time
            ? new Date(record.random_count_start_time).toLocaleString()
            : "-";

          const recipientEmails = validRecipients.map(u => u.email);
          const subject = `Random Counting Completed – Rake ${rakeSerial} / Wagon ${wagonNum}`;

          const html = `
            <div style="font-family:Arial,sans-serif;max-width:700px;">
              <h2 style="color:#0B3A6E;">🔢 Random Counting Inspection Completed</h2>
              <p>A random counting inspection has been completed and submitted.</p>

              <table style="border-collapse:collapse;width:100%;margin:16px 0;">
                <thead>
                  <tr style="background:#0B3A6E;color:#fff;">
                    <th style="padding:8px 12px;text-align:left;">Rake Serial</th>
                    <th style="padding:8px 12px;text-align:left;">Wagon Number</th>
                    <th style="padding:8px 12px;text-align:left;">Tower</th>
                    <th style="padding:8px 12px;text-align:left;">Started At</th>
                    <th style="padding:8px 12px;text-align:left;">Completed At</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${rakeSerial}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${wagonNum}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${towerNum}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${startTime}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${new Date().toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>

              <table style="border-collapse:collapse;width:100%;margin:8px 0;">
                <thead>
                  <tr style="background:#0B3A6E;color:#fff;">
                    <th style="padding:8px 12px;text-align:left;">Count Type</th>
                    <th style="padding:8px 12px;text-align:left;">Starting Count</th>
                    <th style="padding:8px 12px;text-align:left;">Inspected Count</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding:8px 12px;border:1px solid #ddd;">Loaded Bags</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${startLoaded}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${finalLoaded}</td>
                  </tr>
                  <tr style="background:#f9f9f9;">
                    <td style="padding:8px 12px;border:1px solid #ddd;">Unloaded Bags</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${startUnloaded}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${finalUnloaded}</td>
                  </tr>
                </tbody>
              </table>

              ${(client_surveyor_name || bothra_surveyor_name || client_representative_name || remarks) ? `
              <table style="border-collapse:collapse;width:100%;margin:8px 0;">
                <thead>
                  <tr style="background:#0B3A6E;color:#fff;">
                    <th style="padding:8px 12px;text-align:left;">Field</th>
                    <th style="padding:8px 12px;text-align:left;">Value</th>
                  </tr>
                </thead>
                <tbody>
                  ${client_surveyor_name ? `<tr><td style="padding:8px 12px;border:1px solid #ddd;">Client Surveyor</td><td style="padding:8px 12px;border:1px solid #ddd;">${client_surveyor_name}</td></tr>` : ""}
                  ${bothra_surveyor_name ? `<tr style="background:#f9f9f9;"><td style="padding:8px 12px;border:1px solid #ddd;">Bothra Surveyor</td><td style="padding:8px 12px;border:1px solid #ddd;">${bothra_surveyor_name}</td></tr>` : ""}
                  ${client_representative_name ? `<tr><td style="padding:8px 12px;border:1px solid #ddd;">Client Representative</td><td style="padding:8px 12px;border:1px solid #ddd;">${client_representative_name}</td></tr>` : ""}
                  ${remarks ? `<tr style="background:#f9f9f9;"><td style="padding:8px 12px;border:1px solid #ddd;">Remarks</td><td style="padding:8px 12px;border:1px solid #ddd;">${remarks}</td></tr>` : ""}
                </tbody>
              </table>` : ""}

              <p style="color:#555;font-size:13px;">
                Please log in to the system to view the full inspection report.
              </p>
            </div>
          `;

          await sendAlertEmail(recipientEmails, subject, html);
          console.log(`[RANDOM-COUNT-NOTIFY] Completion email sent to ${recipientEmails.join(", ")} for rake ${rakeSerial}, wagon ${wagonNum}`);
        } catch (emailErr) {
          console.error(`[RANDOM-COUNT-NOTIFY] Failed to send random counting completion email:`, emailErr.message);
        }
      })();
    }
  } catch (err) {
    console.error("RANDOM SAVE ERROR:", err);
    res.status(500).json({ message: "Failed to save random counting details" });
  }
};

module.exports = {
  getTrains,
  getWagons,
  getLiveCount,
  startCounting,
  getCompleted,
  getAll,
  getById,
  getCompletedById,
  completeCounting,
  saveCounting,
};
