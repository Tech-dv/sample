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
