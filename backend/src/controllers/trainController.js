const pool = require("../config/database");
const { generateTrainId, generateNextUniqueRakeSerialNumber } = require("../services/trainService");
const { sendAlertEmail } = require("../services/emailService");
const { isValidEmail } = require("../utils/emailValidator");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// This file will contain all train-related route handlers
// Due to the large size of handlers, they will be extracted from index.js
// For now, creating the createTrain handler as an example

const createTrain = async (req, res) => {
  const { wagon_count, siding } = req.body;

  console.log("TRAIN BODY:", req.body);

  try {
    // Generate rake_serial_number in format (financial_year/month/sequence)
    const rakeSerialNumber = await generateTrainId();
    console.log(`Generated rake_serial_number: ${rakeSerialNumber}`);

    // Generate train_id for internal reference only (format: TRAIN-XXX)
    // This is kept only in train_session for backward compatibility
    const finalTrainId = `TRAIN-${String(Math.floor(Math.random() * 10000)).padStart(3, '0')}`;

    // Check if rake_serial_number already exists
    const exists = await pool.query(
      "SELECT 1 FROM train_session WHERE rake_serial_number = $1",
      [rakeSerialNumber]
    );

    if (exists.rows.length > 0) {
      return res.json({
        message: "Train already exists, ignored",
        rake_serial_number: rakeSerialNumber
      });
    }

    // Check if rake_serial_number column exists, if not add it
    try {
      await pool.query("ALTER TABLE train_session ADD COLUMN IF NOT EXISTS rake_serial_number TEXT");
    } catch (alterErr) {
      // Column might already exist, ignore error
      console.log("Column rake_serial_number already exists or alter failed:", alterErr.message);
    }

    const trainResult = await pool.query(
      `
      INSERT INTO train_session (train_id, wagon_count, siding, rake_serial_number)
      VALUES ($1, $2, $3, $4)
      RETURNING created_time
      `,
      [
        finalTrainId,
        wagon_count ?? null,
        siding ?? null,
        rakeSerialNumber
      ]
    );

    const createdTime = trainResult.rows[0].created_time;

    // Check if rake_serial_number column exists in dashboard_records, if not add it
    try {
      await pool.query("ALTER TABLE dashboard_records ADD COLUMN IF NOT EXISTS rake_serial_number TEXT");
    } catch (alterErr) {
      // Column might already exist, ignore error
      console.log("Column rake_serial_number already exists in dashboard_records or alter failed:", alterErr.message);
    }

    await pool.query(
      `
      INSERT INTO dashboard_records (rake_serial_number, created_time, status, siding)
      VALUES ($1, $2, 'DRAFT', $3)
      `,
      [rakeSerialNumber, createdTime, siding ?? null]
    );

    if (wagon_count > 0) {
      for (let i = 1; i <= wagon_count; i++) {
        await pool.query(
          `
          INSERT INTO wagon_records (
            tower_number,
            loaded_bag_count,
            unloaded_bag_count,
            wagon_to_be_loaded,
            loading_status,
            rake_serial_number,
            siding
          )
          VALUES ($1, 0, 0, NULL, false, $2, $3)
          `,
          [i, rakeSerialNumber, siding ?? null]
        );
      }
    }

    res.json({
      message: "Train created",
      rake_serial_number: rakeSerialNumber,
      wagon_count,
      siding
    });

  } catch (err) {
    console.error("TRAIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// NOTE: Due to the large size of index.js (5835 lines), other train handlers
// (view, edit, dispatch, draft, revoke, activity-timeline, etc.) need to be
// extracted from index.js and added here. For now, exporting createTrain
// as a placeholder. The complete extraction will be done in the next phase.


const viewTrain = async (req, res) => {
  const { trainId } = req.params;
  // trainId may be URL encoded (e.g., "2025-26%2F01%2F001"), decode it
  const decodedTrainId = trainId.replace(/_/g, "/");
  const role = req.headers["x-user-role"];
  const customerId = req.customerId;

  try {
    const indentNumber = req.query.indent_number; // Optional: filter by indent

    // Build header query based on whether indent_number is provided
    // Check both train_id and rake_serial_number since URL might use either
    let headerQuery, headerParams;

    if (indentNumber && indentNumber !== null && indentNumber !== '') {
      // Get specific indent row
      if (role === "CUSTOMER") {
        headerQuery = `
          SELECT d.*, c.customer_name
          FROM dashboard_records d
          JOIN customers c ON c.id = d.customer_id
          WHERE d.rake_serial_number=$1 AND d.customer_id=$2 AND d.indent_number=$3
        `;
        headerParams = [decodedTrainId, customerId, indentNumber];
      } else {
        headerQuery = `
          SELECT d.*, c.customer_name
          FROM dashboard_records d
          LEFT JOIN customers c ON c.id = d.customer_id
          WHERE d.rake_serial_number=$1 AND d.indent_number=$2
        `;
        headerParams = [decodedTrainId, indentNumber];
      }
    } else {
      // Get first available row (prefer row with null/empty indent_number for first entry)
      if (role === "CUSTOMER") {
        headerQuery = `
          SELECT d.*, c.customer_name
          FROM dashboard_records d
          JOIN customers c ON c.id = d.customer_id
          WHERE d.rake_serial_number=$1 AND d.customer_id=$2
          ORDER BY 
            CASE WHEN d.indent_number IS NULL OR d.indent_number = '' THEN 0 ELSE 1 END,
            d.indent_number
          LIMIT 1
        `;
        headerParams = [decodedTrainId, customerId];
      } else {
        headerQuery = `
          SELECT d.*, c.customer_name
          FROM dashboard_records d
          LEFT JOIN customers c ON c.id = d.customer_id
          WHERE d.rake_serial_number=$1
          ORDER BY 
            CASE WHEN d.indent_number IS NULL OR d.indent_number = '' THEN 0 ELSE 1 END,
            d.indent_number
          LIMIT 1
        `;
        headerParams = [decodedTrainId];
      }
    }

    const header = await pool.query(headerQuery, headerParams);

    if (!header.rows.length) {
      return res.status(403).json({ message: "Access denied" });
    }

    const headerData = header.rows[0];
    const indentNum = indentNumber !== undefined ? indentNumber : headerData.indent_number;
    // ✅ FIX: Use indent_number from dashboard record (source of truth) for dispatch matching
    const dashboardIndentNumber = headerData.indent_number;

    // ✅ FIX: Use rake_serial_number from header
    const rakeSerialNumber = headerData.rake_serial_number || decodedTrainId;

    // Filter wagons by indent_number
    // If indentNumber is explicitly provided in query AND it's not null/empty, filter by it
    // If indentNumber is null/empty (first entry), show all wagons
    // If multiple indent mode and indentNum exists, filter by it
    // Otherwise, show all wagons
    // ✅ FIX: Use both train_id and rake_serial_number for wagon queries
    let wagonQuery, wagonParams;
    if (indentNumber !== undefined && indentNumber !== null && indentNumber !== '') {
      // indentNumber explicitly provided and not empty - filter by it
      wagonQuery = `
        SELECT * FROM wagon_records 
        WHERE rake_serial_number = $1 AND indent_number=$2 
        ORDER BY tower_number
      `;
      wagonParams = [rakeSerialNumber, indentNumber];
    } else if (headerData.single_indent === false && indentNum && indentNum !== null && indentNum !== '') {
      // Multiple indent mode with valid indent_number - filter by it
      wagonQuery = `
        SELECT * FROM wagon_records 
        WHERE rake_serial_number = $1 AND indent_number=$2 
        ORDER BY tower_number
      `;
      wagonParams = [rakeSerialNumber, indentNum];
    } else {
      // No indent_number or first entry - show all wagons
      wagonQuery = `
        SELECT * FROM wagon_records 
        WHERE rake_serial_number = $1
        ORDER BY tower_number
      `;
      wagonParams = [rakeSerialNumber];
    }

    const wagons = await pool.query(wagonQuery, wagonParams);

    // ✅ FIX: Query dispatch_records with indent_number filter (matching dispatch endpoint logic)
    // Use dashboardIndentNumber from headerData (source of truth) for matching
    let dispatchQuery, dispatchParams;
    if (dashboardIndentNumber && dashboardIndentNumber !== null && dashboardIndentNumber !== '') {
      dispatchQuery = "SELECT * FROM dispatch_records WHERE rake_serial_number = $1 AND indent_number = $2";
      dispatchParams = [rakeSerialNumber, dashboardIndentNumber];
    } else {
      dispatchQuery = "SELECT * FROM dispatch_records WHERE rake_serial_number = $1 AND (indent_number IS NULL OR indent_number = '')";
      dispatchParams = [rakeSerialNumber];
    }

    let dispatchRes = await pool.query(dispatchQuery, dispatchParams);

    // ✅ FIX: If no dispatch record found with matching indent_number, try to find any dispatch record
    // (same fallback logic as dispatch endpoint)
    if (dispatchRes.rows.length === 0) {
      dispatchQuery = `
        SELECT * FROM dispatch_records 
        WHERE rake_serial_number = $1
        ORDER BY 
          CASE WHEN indent_number IS NULL OR indent_number = '' THEN 0 ELSE 1 END,
          indent_number
        LIMIT 1
      `;
      dispatchParams = [rakeSerialNumber];
      dispatchRes = await pool.query(dispatchQuery, dispatchParams);
    }

    let dispatchData = dispatchRes.rows[0] || null;

    // ✅ FIX: Calculate rake_loading_start_datetime and rake_loading_end_actual from wagon_records
    // (same logic as dispatch endpoint - always use calculated values from wagons)
    let firstLoadingStart = null;
    let lastLoadingEnd = null;

    if (wagons.rows.length > 0) {
      // First wagon's loading_start_time (ordered by tower_number)
      const firstWagon = wagons.rows.find(w => w.loading_start_time);
      if (firstWagon) {
        firstLoadingStart = firstWagon.loading_start_time;
      }

      // Last wagon's loading_end_time (ordered by tower_number)
      const reversedWagons = [...wagons.rows].reverse();
      const lastWagon = reversedWagons.find(w => w.loading_end_time);
      if (lastWagon) {
        lastLoadingEnd = lastWagon.loading_end_time;
      }
    }

    // ✅ FIX: Only add calculated times to existing dispatch data (preserve all other fields)
    // If dispatchData exists, preserve all fields and only override calculated times
    if (dispatchData) {
      // Preserve all existing dispatch data, only override calculated times
      if (firstLoadingStart) {
        dispatchData.rake_loading_start_datetime = firstLoadingStart;
      }
      if (lastLoadingEnd) {
        dispatchData.rake_loading_end_actual = lastLoadingEnd;
      }
    }
    // If dispatchData is null, return null (frontend will show "-" for all fields)
    // Don't create empty object - preserve existing behavior

    res.json({
      header: headerData,
      wagons: wagons.rows,
      dispatch: dispatchData,
    });
  } catch (err) {
    console.error("VIEW TRAIN ERROR", err);
    res.status(500).json({ message: "Failed to load train view" });
  }
};

const editTrain = async (req, res) => {
  const { trainId } = req.params;
  // trainId may be URL encoded (e.g., "2025-26%2F01%2F001"), decode it
  const decodedTrainId = trainId.replace(/_/g, "/");
  const indentNumber = req.query.indent_number; // Optional: filter by indent

  try {
    // Ensure multiple_indent_confirmed column exists
    try {
      await pool.query("ALTER TABLE dashboard_records ADD COLUMN IF NOT EXISTS multiple_indent_confirmed BOOLEAN DEFAULT FALSE");
    } catch (alterErr) {
      // Column might already exist, ignore error
      console.log("Column multiple_indent_confirmed already exists or alter failed:", alterErr.message);
    }
    // Build query based on whether indent_number is provided
    let headerQuery, headerParams;

    if (indentNumber && indentNumber !== null && indentNumber !== '') {
      // Get specific indent row
      // Check both train_id and rake_serial_number since URL might use either
      headerQuery = `
      SELECT
        d.rake_serial_number,
        d.indent_number,
        d.customer_id,
        d.status,
          d.single_indent,
          d.hl_only,
          d.wagon_destination,
          d.commodity,
          d.siding,
          d.has_sequential_serials,
          d.multiple_indent_confirmed
        FROM dashboard_records d
        WHERE d.rake_serial_number = $1 AND d.indent_number = $2
      `;
      headerParams = [decodedTrainId, indentNumber];
    } else {
      // Get first available row (prefer row with null/empty indent_number for first entry)
      // If no such row exists, get any row
      // Check both train_id and rake_serial_number since URL might use either
      headerQuery = `
        SELECT
          d.rake_serial_number,
          d.indent_number,
          d.customer_id,
          d.status,
          d.single_indent,
          d.hl_only,
          d.wagon_destination,
          d.commodity,
          d.siding,
          d.has_sequential_serials,
          d.multiple_indent_confirmed
      FROM dashboard_records d
      WHERE d.rake_serial_number = $1
        ORDER BY 
          CASE WHEN d.indent_number IS NULL OR d.indent_number = '' THEN 0 ELSE 1 END,
          d.indent_number
        LIMIT 1
      `;
      headerParams = [decodedTrainId];
    }

    const headerRes = await pool.query(headerQuery, headerParams);

    if (!headerRes.rows.length) {
      return res.status(404).json({ message: "Train not found" });
    }

    const header = headerRes.rows[0];
    const indentNum = indentNumber !== undefined ? indentNumber : header.indent_number;

    // ✅ FIX: Use rake_serial_number from header
    const rakeSerialNumber = header.rake_serial_number || decodedTrainId;

    // ✅ CRITICAL FIX: In multiple indent mode, if header has null/empty indent_number (parent record),
    // we should return ALL wagons regardless of their indent_number values
    // This handles the case where Save creates a parent record but wagons have various indent_numbers
    // If indentNumber is explicitly provided in query AND it's not null/empty, filter by it
    // If indentNumber is null/empty (first entry), show all wagons
    // If multiple indent mode and indentNum exists, filter by it
    // Otherwise, show all wagons
    // ✅ FIX: Use both train_id and rake_serial_number for queries
    let wagonQuery, wagonParams;
    if (indentNumber !== undefined && indentNumber !== null && indentNumber !== '') {
      // indentNumber explicitly provided and not empty - filter by it
      wagonQuery = `
        SELECT *
        FROM wagon_records
        WHERE rake_serial_number = $1 AND indent_number = $2
        ORDER BY tower_number
      `;
      wagonParams = [rakeSerialNumber, indentNumber];
    } else if (header.single_indent === false && indentNum && indentNum !== null && indentNum !== '') {
      // Multiple indent mode with valid indent_number in header - filter by it
      wagonQuery = `
        SELECT *
        FROM wagon_records
        WHERE rake_serial_number = $1 AND indent_number = $2
        ORDER BY tower_number
      `;
      wagonParams = [rakeSerialNumber, indentNum];
    } else {
      // ✅ CRITICAL FIX: No indent_number or parent record (null indent_number) - show ALL wagons
      // This is especially important in multiple indent mode where Save creates a parent record
      // with null indent_number but wagons have various indent_numbers
      wagonQuery = `
      SELECT *
      FROM wagon_records
      WHERE rake_serial_number = $1
      ORDER BY tower_number
      `;
      wagonParams = [rakeSerialNumber];
      console.log(`[TRAIN_EDIT API] Returning ALL wagons for rake_serial_number=${rakeSerialNumber} (parent record or no indent filter)`);
    }

    const wagonRes = await pool.query(wagonQuery, wagonParams);

    // Determine if this is a child record:
    // 1. Check if train_id has sequential pattern (e.g., 2025-26/01/001-1)
    // 2. OR check if it has an indent_number and is in multiple indent mode (parent was split)
    const hasSequentialPattern = rakeSerialNumber.match(/^(.+\/\d+\/\d+)-(\d+)$/) !== null;
    const isMultipleIndent = header.single_indent === false;
    const hasIndentNumber = header.indent_number && header.indent_number !== '';
    const isChildRecord = hasSequentialPattern || (isMultipleIndent && hasIndentNumber);

    let wagonCount = null;

    if (isChildRecord) {
      // For child records, use the actual count of wagons for this indent
      wagonCount = wagonRes.rows.length;
      console.log(`[TRAIN_EDIT API] Child record detected (sequential: ${hasSequentialPattern}, multiple indent: ${isMultipleIndent && hasIndentNumber}), using actual wagon count: ${wagonCount}`);
    } else {
      // For parent records, get wagon_count from train_session
      const trainSessionRes = await pool.query(
        "SELECT wagon_count FROM train_session WHERE rake_serial_number = $1",
        [rakeSerialNumber]
      );
      wagonCount = trainSessionRes.rows[0]?.wagon_count || null;
      console.log(`[TRAIN_EDIT API] Parent record, using wagon_count from train_session: ${wagonCount}`);
    }

    console.log(`[TRAIN_EDIT API] URL trainId: ${decodedTrainId}, actual train_id: ${rakeSerialNumber}, isChildRecord: ${isChildRecord}, wagon_count: ${wagonCount}, existing wagons: ${wagonRes.rows.length}`);

    res.json({
      header: {
        ...header,
        wagon_count: wagonCount, // Include wagon_count from train_session
        is_child_record: isChildRecord, // Flag to indicate if this is a child record
      },
      wagons: wagonRes.rows,
    });
  } catch (err) {
    console.error("LOAD TRAIN ERROR:", err);
    res.status(500).json({ message: "Failed to load train data" });
  }
};

const saveDraft = async (req, res) => {
  const { trainId } = req.params;
  const { header, wagons, editOptions } = req.body;
  const indentNumberFromQuery = req.query.indent_number; // Get indent_number from query params
  const singleIndent = editOptions?.singleIndent !== undefined ? editOptions.singleIndent : true;
  const hlOnly = editOptions?.wagonTypeHL !== undefined ? editOptions.wagonTypeHL : false;

  // ✅ FIX: Resolve a reliable customer_id for both parent and child saves
  // Priority:
  // 1. header.customer_id from frontend payload (explicit choice)
  // 2. Any wagon.customer_id from current wagons payload (per-indent/customer in multiple-indent mode)
  // 3. Fallback to null (no customer mapped)
  const getEffectiveCustomerId = () => {
    if (header && header.customer_id !== undefined && header.customer_id !== null && header.customer_id !== "") {
      return header.customer_id;
    }
    if (Array.isArray(wagons)) {
      const wagonWithCustomer = wagons.find(
        (w) => w && w.customer_id !== undefined && w.customer_id !== null && w.customer_id !== ""
      );
      if (wagonWithCustomer) {
        return wagonWithCustomer.customer_id;
      }
    }
    return null;
  };
  const effectiveCustomerId = getEffectiveCustomerId();

  // ✅ FIX: Resolve rakeSerialNumber FIRST before fetching existing data for comparison
  // ✅ FIX: URL trainId is now always rake_serial_number
  // No need to resolve - use it directly
  const decodedTrainId = trainId.replace(/_/g, "/");
  const rakeSerialNumber = decodedTrainId; // URL parameter is rake_serial_number
  console.log(`[DRAFT SAVE] Using rake_serial_number: ${rakeSerialNumber}`);

  // ✅ FIX: Get existing data BEFORE updating (for activity timeline comparison)
  const reviewerUsername = req.headers["x-reviewer-username"];
  const userRole = req.headers["x-user-role"];
  let existingHeaders = [];
  let existingWagons = [];

  if (reviewerUsername && (userRole === "REVIEWER" || userRole === "ADMIN")) {
    // Get existing header data for comparison
    let existingHeaderQuery, existingHeaderParams;
    if (singleIndent) {
      existingHeaderQuery = `
        SELECT indent_number, customer_id, wagon_destination, commodity
        FROM dashboard_records
        WHERE rake_serial_number = $1
        LIMIT 1
      `;
      existingHeaderParams = [rakeSerialNumber];
    } else {
      const indentNumbersInWagons = [...new Set(
        wagons.map(w => w.indent_number).filter(Boolean)
      )];
      if (indentNumbersInWagons.length > 0) {
        existingHeaderQuery = `
          SELECT indent_number, customer_id, wagon_destination, commodity
          FROM dashboard_records
          WHERE rake_serial_number = $1 AND indent_number = ANY($2)
        `;
        existingHeaderParams = [rakeSerialNumber, indentNumbersInWagons];
      }
    }

    if (existingHeaderQuery) {
      const existingHeaderRes = await pool.query(existingHeaderQuery, existingHeaderParams);
      existingHeaders = existingHeaderRes.rows || [];
    }

    // Get existing wagons for comparison - use rakeSerialNumber (wagon_records uses train_id)
    let existingWagonsQuery, existingWagonsParams;
    if (singleIndent) {
      existingWagonsQuery = `
        SELECT wagon_number, wagon_type, cc_weight, sick_box, wagon_to_be_loaded,
               commodity, seal_number, stoppage_time, remarks, loading_status,
               indent_number, wagon_destination, customer_id, tower_number
        FROM wagon_records
        WHERE rake_serial_number = $1
        ORDER BY tower_number
      `;
      existingWagonsParams = [rakeSerialNumber];
      console.log(`[ACTIVITY TIMELINE] Fetching existing wagons (single indent mode) for train_id: ${rakeSerialNumber}`);
    } else {
      const indentNumbersInWagons = [...new Set(
        wagons.map(w => w.indent_number).filter(Boolean)
      )];
      if (indentNumbersInWagons.length > 0) {
        existingWagonsQuery = `
          SELECT wagon_number, wagon_type, cc_weight, sick_box, wagon_to_be_loaded,
                 commodity, seal_number, stoppage_time, remarks, loading_status,
                 indent_number, wagon_destination, customer_id, tower_number
          FROM wagon_records
          WHERE rake_serial_number = $1 AND indent_number = ANY($2)
          ORDER BY tower_number
        `;
        existingWagonsParams = [rakeSerialNumber, indentNumbersInWagons];
        console.log(`[ACTIVITY TIMELINE] Fetching existing wagons (multiple indent mode) for train_id: ${rakeSerialNumber}, indent_numbers: ${indentNumbersInWagons.join(', ')}`);
      } else {
        console.log(`[ACTIVITY TIMELINE] No indent numbers found in wagons, skipping existing wagons query`);
      }
    }

    if (existingWagonsQuery) {
      const existingWagonsRes = await pool.query(existingWagonsQuery, existingWagonsParams);
      existingWagons = existingWagonsRes.rows || [];
      console.log(`[ACTIVITY TIMELINE] Fetched ${existingWagons.length} existing wagons from database`);
      if (existingWagons.length === 0) {
        console.log(`[ACTIVITY TIMELINE] WARNING: No existing wagons found! Query: ${existingWagonsQuery}, Params: ${JSON.stringify(existingWagonsParams)}`);
      }
    } else {
      console.log(`[ACTIVITY TIMELINE] WARNING: No existing wagons query generated!`);
    }
  }

  try {
    // ✅ FIX: Get siding from train_session using rake_serial_number
    const trainSessionRes = await pool.query(
      "SELECT siding FROM train_session WHERE rake_serial_number = $1 LIMIT 1",
      [rakeSerialNumber]
    );

    // Get existing dashboard record to preserve siding, created_time, and detect customer mapping
    // ✅ FIX: Search for base rake_serial_number OR sequential rake_serial_number
    const existingRecord = await pool.query(
      `SELECT siding, created_time, customer_id 
       FROM dashboard_records 
       WHERE (rake_serial_number = $1 OR rake_serial_number LIKE $2)
       AND (indent_number IS NULL OR indent_number = '')
       ORDER BY CASE WHEN rake_serial_number = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [rakeSerialNumber, `${rakeSerialNumber}-%`]
    );

    // Track previous customer_id for detecting new customer mapping
    const previousCustomerId = existingRecord.rows[0]?.customer_id || null;

    // Priority:
    // 1. Siding from train_session (Master record)
    // 2. Siding from request body (if sent)
    // 3. Siding from existing dashboard record
    const siding = trainSessionRes.rows[0]?.siding || header?.siding || existingRecord.rows[0]?.siding || null;
    const createdTime = existingRecord.rows[0]?.created_time || new Date();

    // Check if train already has sequential serials flag (needed for sequential assignment logic later)
    // Check both train_id and rake_serial_number since URL might use either
    const existingRecordDataForFlag = await pool.query(
      "SELECT has_sequential_serials FROM dashboard_records WHERE rake_serial_number = $1 LIMIT 1",
      [rakeSerialNumber]
    );
    let hasSequentialSerials = existingRecordDataForFlag.rows[0]?.has_sequential_serials || false;

    if (singleIndent) {
      /* ===============================
           SINGLE INDENT MODE: One row per train
         =============================== */
      const firstCommodity = wagons.find(w => w.commodity)?.commodity || null;
      const firstWagonDestination = wagons.find(w => w.wagon_destination)?.wagon_destination || null;

      // Check if train already has sequential serials flag, assigned_reviewer, and status (before delete)
      // ✅ FIX: Search for base rake_serial_number OR sequential rake_serial_number to preserve assignment
      // This handles cases where the task was assigned and might be using a sequential serial number
      // ✅ FIX: Do NOT filter by indent_number IS NULL here — the task may have been assigned with
      // a non-empty indent_number (e.g. single-indent mode where header.indent_number is filled).
      // We must find the record regardless of indent_number to preserve assigned_reviewer and status.
      const existingRecordData = await pool.query(
        `SELECT has_sequential_serials, assigned_reviewer, status, rake_serial_number 
         FROM dashboard_records 
         WHERE (rake_serial_number = $1 OR rake_serial_number LIKE $2)
         ORDER BY CASE WHEN rake_serial_number = $1 THEN 0 ELSE 1 END,
                  CASE WHEN assigned_reviewer IS NOT NULL AND assigned_reviewer != '' THEN 0 ELSE 1 END,
                  CASE WHEN status IN ('LOADING_IN_PROGRESS', 'PENDING_APPROVAL') THEN 0 ELSE 1 END
         LIMIT 1`,
        [rakeSerialNumber, `${rakeSerialNumber}-%`]
      );
      hasSequentialSerials = existingRecordData.rows[0]?.has_sequential_serials || false;
      const assignedReviewer = existingRecordData.rows[0]?.assigned_reviewer || null;
      const existingStatus = existingRecordData.rows[0]?.status || 'DRAFT';
      // ✅ FIX: Use the actual rake_serial_number from the found record if it exists (might be sequential)
      const actualRakeSerialNumber = existingRecordData.rows[0]?.rake_serial_number || rakeSerialNumber;

      // Preserve LOADING_IN_PROGRESS and PENDING_APPROVAL statuses, otherwise use DRAFT
      const statusToUse = (existingStatus === 'LOADING_IN_PROGRESS' || existingStatus === 'PENDING_APPROVAL') ? existingStatus : 'DRAFT';

      // Delete any existing dashboard records for this train (handles both single and multiple indent cases)
      // ✅ FIX: Delete using both base and actual rake_serial_number to ensure we catch all records
      await pool.query(
        // ✅ FIX: Also delete any sequential rake_serial_number rows (e.g. 2025-26/02/005-001)
        // so single-indent mode doesn't accidentally reopen as multiple-indent later.
        "DELETE FROM dashboard_records WHERE (rake_serial_number = $1 OR rake_serial_number LIKE $2 OR rake_serial_number = $3)",
        [rakeSerialNumber, `${rakeSerialNumber}-%`, actualRakeSerialNumber]
      );

      // ✅ FIX: For single indent mode, multiple_indent_confirmed should always be false
      const multipleIndentConfirmed = false;

      // Insert single dashboard record (preserve flag, assigned_reviewer, and status)
      // ✅ FIX: Use actualRakeSerialNumber to preserve sequential serial numbers if they exist
      await pool.query(
        `
          INSERT INTO dashboard_records (rake_serial_number, indent_number, customer_id, commodity, 
            wagon_destination, status, single_indent, hl_only, siding, created_time, has_sequential_serials, assigned_reviewer, multiple_indent_confirmed
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `,
        [
          actualRakeSerialNumber, // ✅ FIX: Use actual rake_serial_number (might be sequential)
          header?.indent_number || null,
          effectiveCustomerId,
          firstCommodity,
          firstWagonDestination,
          statusToUse,
          singleIndent,
          hlOnly,
          siding,
          createdTime,
          hasSequentialSerials,
          assignedReviewer,
          multipleIndentConfirmed, // Always false for single indent mode
        ]
      );
    } else {
      /* ===============================
         MULTIPLE INDENT MODE: One row per indent (ONLY after splitting via Proceed -> Yes)
         During Save: Keep all wagons in ONE dashboard record (like single indent mode)
         UNLESS: This is a child record (indentNumberFromQuery is provided)
         =============================== */

      // ✅ FIX: Determine if we should only update a single indent record (child record)
      // or if we should consolidate/maintain the parent record
      const isSavingChildRecord = !singleIndent && indentNumberFromQuery && indentNumberFromQuery !== '';

      if (isSavingChildRecord) {
        console.log(`[DRAFT SAVE] Child record detected for indent ${indentNumberFromQuery}. Updating only this indent.`);

        // Update the specific dashboard record for this indent
        await pool.query(
          `UPDATE dashboard_records 
           SET customer_id = $1, commodity = $2, wagon_destination = $3, 
               hl_only = $4, status = (CASE WHEN status IN ('LOADING_IN_PROGRESS', 'PENDING_APPROVAL') THEN status ELSE 'DRAFT' END),
               multiple_indent_confirmed = TRUE
           WHERE rake_serial_number = $5 AND indent_number = $6`,
          [
            effectiveCustomerId,
            wagons.find(w => w.commodity)?.commodity || null,
            wagons.find(w => w.wagon_destination)?.wagon_destination || null,
            hlOnly,
            rakeSerialNumber,
            indentNumberFromQuery
          ]
        );
      } else {
        // ✅ CRITICAL FIX: During Save for PARENT record, create ONLY ONE dashboard record (with null/empty indent_number)
        // DO NOT split by indent number during Save - splitting only happens when user clicks Proceed -> Yes
        // This ensures all wagons stay together until user explicitly chooses to split

        // Check if train already has sequential serials flag (before any operations)
        // ✅ FIX: Do NOT filter by indent_number IS NULL — the task may have been assigned with a
        // non-empty indent_number. Prioritise rows with an active status and assigned_reviewer.
        const existingRecordData = await pool.query(
          `SELECT has_sequential_serials, siding, created_time, assigned_reviewer, status 
           FROM dashboard_records 
           WHERE rake_serial_number = $1 
           ORDER BY CASE WHEN assigned_reviewer IS NOT NULL AND assigned_reviewer != '' THEN 0 ELSE 1 END,
                    CASE WHEN status IN ('LOADING_IN_PROGRESS', 'PENDING_APPROVAL') THEN 0 ELSE 1 END
           LIMIT 1`,
          [rakeSerialNumber]
        );
        hasSequentialSerials = existingRecordData.rows[0]?.has_sequential_serials || false;
        console.log(`[DEBUG] Train ${rakeSerialNumber}: hasSequentialSerials = ${hasSequentialSerials}`);
        const preservedSiding = siding || existingRecordData.rows[0]?.siding;
        const preservedCreatedTime = existingRecordData.rows[0]?.created_time || createdTime;
        const assignedReviewer = existingRecordData.rows[0]?.assigned_reviewer || null;
        const existingStatus = existingRecordData.rows[0]?.status || 'DRAFT';

        // Preserve LOADING_IN_PROGRESS and PENDING_APPROVAL statuses, otherwise use DRAFT
        const statusToUse = (existingStatus === 'LOADING_IN_PROGRESS' || existingStatus === 'PENDING_APPROVAL') ? existingStatus : 'DRAFT';

        // Get first commodity and wagon_destination from wagons (for the single dashboard record)
        const firstCommodity = wagons.find(w => w.commodity)?.commodity || null;
        const firstWagonDestination = wagons.find(w => w.wagon_destination)?.wagon_destination || null;

        // ✅ FIX: Check if multiple indent mode is confirmed (user selected multiple indent AND filled at least 1 indent number)
        const hasIndentNumbers = wagons.some(w =>
          w.indent_number && w.indent_number.trim() !== ''
        );
        const multipleIndentConfirmed = !singleIndent && hasIndentNumbers;

        // ✅ CRITICAL BEHAVIOR:
        // For the PARENT node (no indentNumberFromQuery), Save must NEVER split the parent
        // into per-indent dashboard records. There should always be exactly ONE parent
        // dashboard_records row (indent_number NULL/empty) until the user clicks Proceed
        // and answers the multiple rake serial number question (Yes/No).
        //
        // Splitting logic:
        //   - "Yes" (multiple rake serial = yes)  → handled by generateMultipleRakeSerial
        //   - "No"  (multiple rake serial = no)   → handled by markSerialHandled
        // Both are called from the Proceed popup, NOT from Save.

        // Delete ALL dashboard records for this rake_serial_number (including any that were split)
        // This ensures we start fresh with a single parent record during Save.
        await pool.query(
          `DELETE FROM dashboard_records 
           WHERE (rake_serial_number = $1 OR rake_serial_number LIKE $2)`,
          [rakeSerialNumber, `${rakeSerialNumber}-%`]
        );
        console.log(`[DRAFT SAVE] Deleted all dashboard records for ${rakeSerialNumber} to create single parent record (parent save, no splitting)`);

        // Create ONE dashboard record (parent record with null/empty indent_number)
        // This will be split later only when user clicks Proceed and chooses Yes/No.
        await pool.query(
          `
          INSERT INTO dashboard_records (rake_serial_number, indent_number, customer_id, commodity,
            wagon_destination, status, single_indent, hl_only, siding, created_time, has_sequential_serials, assigned_reviewer, multiple_indent_confirmed
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `,
          [
            rakeSerialNumber, // Use base rake_serial_number
            null, // ✅ Parent record has null/empty indent_number
            header?.customer_id || null, // Use header customer_id if available
            firstCommodity,
            firstWagonDestination,
            statusToUse,
            singleIndent,
            hlOnly,
            preservedSiding,
            preservedCreatedTime,
            hasSequentialSerials,
            assignedReviewer,
            multipleIndentConfirmed, // Flag that multiple-indent has been configured on parent
          ]
        );
        console.log(`[DRAFT SAVE] Created single parent dashboard record for ${rakeSerialNumber} (multiple indent mode, parent state only), multiple_indent_confirmed=${multipleIndentConfirmed}`);
      }
    }


    /* ===============================
       2️⃣ PRESERVE EXISTING LOADING TIMES BEFORE DELETING
       =============================== */
    // ✅ FIX: Preserve loading_start_time and loading_end_time from existing wagons
    // These are auto-populated by the bag counting system and should not be overwritten
    // Use wagon_number + indent_number as primary key (more stable than tower_number)
    // Fallback to tower_number + indent_number if wagon_number is not available
    let existingTimesMap = {};

    // ✅ FIX: Get rake_serial_number for queries (if not already set above)
    // Note: rakeSerialNumber is already declared earlier in the function
    if (!rakeSerialNumber) {
      try {
        const rakeSerialRes = await pool.query(
          "SELECT rake_serial_number FROM train_session WHERE rake_serial_number = $1 LIMIT 1",
          [rakeSerialNumber]
        );
        rakeSerialNumber = rakeSerialRes.rows[0]?.rake_serial_number || null;
      } catch (err) {
        console.error("Error getting rake_serial_number:", err);
      }
    }

    if (singleIndent) {
      // Get all existing wagons for this train - use rake_serial_number only
      const queryParams = [rakeSerialNumber];
      let queryConditions = `rake_serial_number = $1`;

      const existingWagons = await pool.query(
        `SELECT wagon_number, tower_number, indent_number, loading_start_time, loading_end_time, loaded_bag_count, unloaded_bag_count
         FROM wagon_records 
         WHERE ${queryConditions}`,
        queryParams
      );

      console.log(`[PRESERVE TIMES] Fetched ${existingWagons.rows.length} existing wagons for single indent mode. rakeSerialNumber: ${rakeSerialNumber}, rakeSerialNumber: ${rakeSerialNumber}, original trainId: ${trainId}, queryParams: ${JSON.stringify(queryParams)}`);

      // ✅ FIX: Create BOTH wagon_number AND tower_number keys for each wagon
      // This ensures times can be preserved even when wagon_number changes
      existingWagons.rows.forEach(row => {
        const timesData = {
          loading_start_time: row.loading_start_time,
          loading_end_time: row.loading_end_time,
          loaded_bag_count: row.loaded_bag_count,
          unloaded_bag_count: row.unloaded_bag_count,
        };

        // Always create tower_number key (most stable identifier)
        if (row.tower_number) {
          const towerKey = `tower_${row.tower_number}`;
          existingTimesMap[towerKey] = timesData;
          console.log(`[PRESERVE TIMES] Mapped key "${towerKey}" with times: start=${row.loading_start_time || 'null'}, end=${row.loading_end_time || 'null'}`);
        }

        // Also create wagon_number key if it exists (for direct lookup)
        if (row.wagon_number && row.wagon_number.trim() !== "") {
          const wagonKey = `wagon_${row.wagon_number.trim()}`;
          existingTimesMap[wagonKey] = timesData;
          console.log(`[PRESERVE TIMES] Mapped key "${wagonKey}" with times: start=${row.loading_start_time || 'null'}, end=${row.loading_end_time || 'null'}`);
        }
      });
    } else {
      // Get existing wagons for the indent numbers being saved
      const indentNumbersInWagons = [...new Set(
        wagons.map(w => w.indent_number).filter(Boolean)
      )];

      if (indentNumbersInWagons.length > 0) {
        // ✅ CRITICAL FIX: Get wagons for the specific indent numbers being saved
        // ALSO include wagons WITHOUT indent_number (parent wagons) to preserve their loading times
        // This is critical because when splitting happens, parent wagons might not have indent_number set yet
        // ✅ FIX: Use rake_serial_number only
        const queryParams = [rakeSerialNumber, indentNumbersInWagons];
        let queryConditions = `rake_serial_number = $1 AND (indent_number = ANY($2) OR indent_number IS NULL OR indent_number = '')`;

        const existingWagons = await pool.query(
          `SELECT wagon_number, tower_number, indent_number, loading_start_time, loading_end_time, loaded_bag_count, unloaded_bag_count
           FROM wagon_records 
           WHERE ${queryConditions}`,
          queryParams
        );

        console.log(`[PRESERVE TIMES] Fetched ${existingWagons.rows.length} existing wagons for multiple indent mode. rakeSerialNumber: ${rakeSerialNumber}, rakeSerialNumber: ${rakeSerialNumber}, original trainId: ${trainId}, indentNumbers: ${indentNumbersInWagons.join(', ')}, queryParams: ${JSON.stringify(queryParams)}`);

        // ✅ FIX: Create BOTH wagon_number AND tower_number keys for each wagon
        // This ensures times can be preserved even when wagon_number changes
        existingWagons.rows.forEach(row => {
          // ✅ FIX: Normalize indent_number (treat null and empty string the same)
          const indentNum = (row.indent_number && row.indent_number.trim() !== "") ? row.indent_number.trim() : '';

          const timesData = {
            loading_start_time: row.loading_start_time,
            loading_end_time: row.loading_end_time,
            loaded_bag_count: row.loaded_bag_count,
            unloaded_bag_count: row.unloaded_bag_count,
          };

          // Always create tower_number key (most stable identifier)
          if (row.tower_number) {
            const towerKey = `tower_${row.tower_number}_indent_${indentNum}`;
            existingTimesMap[towerKey] = timesData;
            console.log(`[PRESERVE TIMES] Mapped key "${towerKey}" with times: start=${row.loading_start_time || 'null'}, end=${row.loading_end_time || 'null'}`);
          }

          // Also create wagon_number key if it exists (for direct lookup)
          if (row.wagon_number && row.wagon_number.trim() !== "") {
            const wagonKey = `wagon_${row.wagon_number.trim()}_indent_${indentNum}`;
            existingTimesMap[wagonKey] = timesData;
            console.log(`[PRESERVE TIMES] Mapped key "${wagonKey}" with times: start=${row.loading_start_time || 'null'}, end=${row.loading_end_time || 'null'}`);
          }
        });
      }
    }

    /* ===============================
       3️⃣ UPSERT WAGONS (UPDATE OR INSERT) - PRESERVES ALL EXISTING DATA
       =============================== */
    // ✅ CRITICAL FIX: Use UPSERT (UPDATE-or-INSERT) instead of DELETE-then-INSERT
    // This automatically preserves ALL existing fields (tower_number, loaded_bag_count, 
    // unloaded_bag_count, loading_start_time, loading_end_time) when wagon_number or other fields change
    // Matching is done by: tower_number + rake_serial_number + indent_number (stable identifiers)
    // This ensures NO data loss when editing any field, including wagon_number
    console.log(`[DRAFT SAVE] Using UPSERT approach to preserve all existing data automatically`);

    /* ===============================
       4️⃣ UPSERT WAGONS (UPDATE OR INSERT)
       =============================== */
    // ✅ FIX: During Save, ALWAYS use base rake_serial_number for all wagons
    // DO NOT use sequential rake_serial_numbers - splitting only happens when user clicks Proceed -> Yes
    // This ensures all wagons stay together with the same rake_serial_number until user explicitly chooses to split
    console.log(`[DRAFT SAVE] Using base rake_serial_number=${rakeSerialNumber} for all wagons (no splitting during Save)`);

    for (const w of wagons) {
      // ✅ DEBUG: Log seal_number to verify it's being received
      console.log(`[DRAFT SAVE] Processing wagon tower_number=${w.tower_number}, wagon_number=${w.wagon_number || 'N/A'}, seal_number=${w.seal_number || 'null/undefined'}, seal_number type=${typeof w.seal_number}`);

      // ✅ FIX: Normalize indent_number (treat null and empty string the same)
      // This is used for loading times preservation
      const indentNum = (w.indent_number && w.indent_number.trim() !== "")
        ? w.indent_number.trim()
        : ((header?.indent_number && header.indent_number.trim() !== "") ? header.indent_number.trim() : '');

      // ✅ FIX: ALWAYS use base rake_serial_number during Save - no splitting
      // Splitting only happens when user clicks Proceed -> Yes in the popup
      const wagonRakeSerialNumber = rakeSerialNumber;

      // ✅ FIX: Check if loading_status was provided by frontend
      // If provided explicitly, use it; otherwise calculate based on preserved bag counts
      let loadingStatus;

      if (w.loading_status !== undefined && w.loading_status !== null) {
        // Frontend provided the status - use it directly
        loadingStatus = Boolean(w.loading_status);
        console.log(`[DRAFT SAVE] Using provided loading_status=${loadingStatus} for wagon tower_number=${w.tower_number}, wagon_number=${w.wagon_number || 'N/A'}`);
      } else {
        // Calculate based on bag counts (will use preserved counts from existingTimes)
        // Note: We'll use preserved bag counts from existingTimesMap, not w.loaded_bag_count
        // since frontend no longer sends bag counts
        const wagonToBeLoaded = w.wagon_to_be_loaded != null && w.wagon_to_be_loaded !== ""
          ? Number(w.wagon_to_be_loaded)
          : null;

        // Get preserved bag count (will be set later from existingTimes)
        // For now, try to get from w.loaded_bag_count if available, otherwise will use preserved value
        const tempLoadedBagCount = Number(w.loaded_bag_count) || 0;

        // Loading is complete only if:
        // 1. wagon_to_be_loaded is set (not null) AND
        // 2. loaded_bag_count >= wagon_to_be_loaded AND
        // 3. loaded_bag_count > 0 (at least one bag loaded)
        loadingStatus = wagonToBeLoaded != null
          ? (tempLoadedBagCount >= wagonToBeLoaded && tempLoadedBagCount > 0)
          : false;

        console.log(`[DRAFT SAVE] Calculated loading_status=${loadingStatus} for wagon tower_number=${w.tower_number}, wagon_number=${w.wagon_number || 'N/A'}, wagonToBeLoaded=${wagonToBeLoaded}, tempLoadedBagCount=${tempLoadedBagCount}`);
      }

      // ✅ FIX: Preserve existing loading times if they exist
      // These are auto-populated by the bag counting system and should NEVER be overwritten by frontend
      // Frontend no longer sends these fields, so we always preserve existing times
      // Try multiple matching strategies for reliability
      // ✅ FIX: Prioritize tower_number lookup since it's stable (doesn't change when wagon_number changes)

      let existingTimes = {};
      let matchedStrategy = '';

      // ✅ FIX: Strategy 1 (PRIMARY): Try tower_number + indent_number FIRST (most stable identifier)
      // Tower number doesn't change when wagon_number is edited, so this is the most reliable
      if (w.tower_number) {
        const key1 = singleIndent
          ? `tower_${w.tower_number}`
          : `tower_${w.tower_number}_indent_${indentNum}`;
        if (existingTimesMap[key1]) {
          existingTimes = existingTimesMap[key1];
          matchedStrategy = 'tower_number (primary)';
        }
      }

      // ✅ CRITICAL FIX: Strategy 1.5: For multiple indent mode, if indentNum is NOT empty, also try matching with empty indent
      // This handles the case where parent wagons (without indent_number) are being saved with a new indent_number
      // Parent wagons have keys like "tower_1_indent_" (empty indent), but we're saving with indentNum "A/001.001"
      if (!singleIndent && !existingTimes.loading_start_time && !existingTimes.loading_end_time && w.tower_number && indentNum && indentNum.trim() !== '') {
        const key1_5 = `tower_${w.tower_number}_indent_`;
        if (existingTimesMap[key1_5]) {
          existingTimes = existingTimesMap[key1_5];
          matchedStrategy = 'tower_number (parent wagon - empty indent)';
        }
      }

      // ✅ FIX: Strategy 2: Try wagon_number + indent_number (fallback if tower_number doesn't match)
      // This works when wagon_number hasn't changed
      if (!existingTimes.loading_start_time && !existingTimes.loading_end_time && w.wagon_number && w.wagon_number.trim() !== "") {
        const key2 = singleIndent
          ? `wagon_${w.wagon_number.trim()}`
          : `wagon_${w.wagon_number.trim()}_indent_${indentNum}`;
        if (existingTimesMap[key2]) {
          existingTimes = existingTimesMap[key2];
          matchedStrategy = 'wagon_number';
        }
      }

      // ✅ CRITICAL FIX: Strategy 2.5: For multiple indent mode, if indentNum is NOT empty, also try matching wagon_number with empty indent
      // This handles the case where parent wagons (without indent_number) are being saved with a new indent_number
      if (!singleIndent && !existingTimes.loading_start_time && !existingTimes.loading_end_time && w.wagon_number && w.wagon_number.trim() !== "" && indentNum && indentNum.trim() !== '') {
        const key2_5 = `wagon_${w.wagon_number.trim()}_indent_`;
        if (existingTimesMap[key2_5]) {
          existingTimes = existingTimesMap[key2_5];
          matchedStrategy = 'wagon_number (parent wagon - empty indent)';
        }
      }

      // ✅ FIX: Strategy 3: For multiple indent mode, try matching without indent suffix if indentNum is empty
      // This handles cases where indent_number might be normalized differently
      if (!singleIndent && !existingTimes.loading_start_time && !existingTimes.loading_end_time && w.tower_number && (!indentNum || indentNum === '')) {
        // Try to find any wagon with same tower_number without indent suffix
        const key3 = `tower_${w.tower_number}`;
        if (existingTimesMap[key3]) {
          existingTimes = existingTimesMap[key3];
          matchedStrategy = 'tower_number (no indent)';
        }
      }

      // ✅ FIX: Strategy 4: Last resort - search through all entries for matching tower_number
      // This handles edge cases where key format might not match exactly
      if (!existingTimes.loading_start_time && !existingTimes.loading_end_time && w.tower_number) {
        const towerNumStr = String(w.tower_number);
        for (const [key, times] of Object.entries(existingTimesMap)) {
          // Check if key contains tower_number and matches indent (if applicable)
          const hasTowerMatch = key.includes(`tower_${towerNumStr}`) ||
            key.startsWith(`tower_${towerNumStr}_`) ||
            key === `tower_${towerNumStr}`;

          if (hasTowerMatch) {
            // For single indent, any tower match is valid
            // For multiple indent, check if indent matches or key has no indent suffix
            const isValidMatch = singleIndent ||
              key.includes(`indent_${indentNum}`) ||
              (!key.includes('_indent_') && (!indentNum || indentNum === ''));

            if (isValidMatch && (times.loading_start_time || times.loading_end_time)) {
              existingTimes = times;
              matchedStrategy = 'tower_number (search fallback)';
              break;
            }
          }
        }
      }

      const loadingStartTime = existingTimes.loading_start_time || null;
      const loadingEndTime = existingTimes.loading_end_time || null;

      // ✅ FIX: Preserve bag counts from database (frontend no longer sends them)
      // Since frontend doesn't send loaded_bag_count/unloaded_bag_count, always use preserved values
      const loadedBagCount = existingTimes.loaded_bag_count != null && existingTimes.loaded_bag_count !== undefined
        ? existingTimes.loaded_bag_count
        : (w.loaded_bag_count != null ? Number(w.loaded_bag_count) : 0);

      const unloadedBagCount = existingTimes.unloaded_bag_count != null && existingTimes.unloaded_bag_count !== undefined
        ? existingTimes.unloaded_bag_count
        : (w.unloaded_bag_count != null ? Number(w.unloaded_bag_count) : 0);

      // ✅ CRITICAL FIX: Recalculate loading_status if it wasn't provided, using preserved bag counts
      // This ensures correct status when frontend doesn't send loading_status but condition is met
      if (w.loading_status === undefined || w.loading_status === null) {
        const wagonToBeLoaded = w.wagon_to_be_loaded != null && w.wagon_to_be_loaded !== ""
          ? Number(w.wagon_to_be_loaded)
          : null;

        // Recalculate using preserved bag counts
        loadingStatus = wagonToBeLoaded != null
          ? (loadedBagCount >= wagonToBeLoaded && loadedBagCount > 0)
          : false;

        console.log(`[DRAFT SAVE] Recalculated loading_status=${loadingStatus} using preserved bag counts for wagon tower_number=${w.tower_number}, loadedBagCount=${loadedBagCount}, wagonToBeLoaded=${wagonToBeLoaded}`);
      }

      // ✅ FIX: Log if times are being lost (for debugging)
      if (w.tower_number && !loadingStartTime && !loadingEndTime && Object.keys(existingTimesMap).length > 0) {
        console.log(`[WARNING] Could not preserve loading times for wagon tower_number=${w.tower_number}, indent_number=${indentNum}, wagon_number=${w.wagon_number || 'N/A'}`);
        console.log(`[DEBUG] Available keys in existingTimesMap:`, Object.keys(existingTimesMap));
        console.log(`[DEBUG] rakeSerialNumber: ${rakeSerialNumber}, original trainId: ${trainId}`);
      }

      // ✅ FIX: Log when times ARE preserved (for verification)
      if (loadingStartTime || loadingEndTime) {
        console.log(`[SUCCESS] Preserved loading times for wagon tower_number=${w.tower_number}, indent_number=${indentNum}, wagon_number=${w.wagon_number || 'N/A'}: start=${loadingStartTime || 'null'}, end=${loadingEndTime || 'null'} (matched via: ${matchedStrategy || 'unknown'})`);
      }

      // ✅ CRITICAL FIX: Use UPSERT (UPDATE-or-INSERT) to preserve ALL existing data
      // Check if wagon exists by tower_number + rake_serial_number + indent_number
      const finalIndentNumber = w.indent_number || header?.indent_number || null;
      
      const existingWagonCheck = await pool.query(
        `SELECT id, loaded_bag_count, unloaded_bag_count, loading_start_time, loading_end_time, loading_status_manual_override
         FROM wagon_records 
         WHERE rake_serial_number = $1 AND tower_number = $2 AND (indent_number = $3 OR (indent_number IS NULL AND $3 IS NULL))`,
        [wagonRakeSerialNumber, w.tower_number, finalIndentNumber]
      );

      const sealNum = (w.seal_number && String(w.seal_number).trim() !== "") ? String(w.seal_number).trim() : null;
      console.log(`[DRAFT SAVE] Saving seal_number for wagon tower_number=${w.tower_number}, indent_number=${indentNum || 'empty'}, seal_number="${sealNum}", wagon_number=${w.wagon_number || 'N/A'}`);

      if (existingWagonCheck.rows.length > 0) {
        // ✅ UPDATE existing wagon - preserve ALL fields that aren't being updated
        // Only update the fields sent from frontend, keep all other fields (including auto-populated ones)
        const existingWagon = existingWagonCheck.rows[0];
        
        // ✅ CRITICAL FIX: Always prioritize database values (most up-to-date source of truth)
        // Database values are the authoritative source since they reflect the latest state
        // Only use existingTimesMap values if database values are null/undefined
        const finalLoadedBagCount = existingWagon.loaded_bag_count != null 
          ? existingWagon.loaded_bag_count 
          : (loadedBagCount || 0);
        const finalUnloadedBagCount = existingWagon.unloaded_bag_count != null 
          ? existingWagon.unloaded_bag_count 
          : (unloadedBagCount || 0);
        const finalLoadingStartTime = existingWagon.loading_start_time || loadingStartTime || null;
        const finalLoadingEndTime = existingWagon.loading_end_time || loadingEndTime || null;
        
        // Preserve loading_status_manual_override if it was set previously and frontend didn't send a new value
        const finalManualOverride = w.loading_status_manual_override !== undefined 
          ? Boolean(w.loading_status_manual_override)
          : (existingWagon.loading_status_manual_override || false);

        await pool.query(
          `
          UPDATE wagon_records SET
            wagon_number = $1,
            wagon_type = $2,
            cc_weight = $3,
            sick_box = $4,
            wagon_to_be_loaded = $5,
            loaded_bag_count = $6,
            unloaded_bag_count = $7,
            loading_start_time = $8,
            loading_end_time = $9,
            seal_number = $10,
            stoppage_time = $11,
            remarks = $12,
            loading_status = $13,
            loading_status_manual_override = $14,
            indent_number = $15,
            wagon_destination = $16,
            commodity = $17,
            customer_id = $18
          WHERE rake_serial_number = $19 AND tower_number = $20 AND (indent_number = $21 OR (indent_number IS NULL AND $21 IS NULL))
          `,
          [
            w.wagon_number || null,
            w.wagon_type || null,
            w.cc_weight || null,
            w.sick_box === "Yes",
            w.wagon_to_be_loaded || null,
            finalLoadedBagCount,
            finalUnloadedBagCount,
            finalLoadingStartTime,
            finalLoadingEndTime,
            sealNum,
            w.stoppage_time || 0,
            w.remarks || null,
            loadingStatus,
            finalManualOverride,
            finalIndentNumber,
            w.wagon_destination || null,
            w.commodity || null,
            w.customer_id || null,
            wagonRakeSerialNumber,
            w.tower_number,
            finalIndentNumber,
          ]
        );
        console.log(`[DRAFT SAVE] UPDATED existing wagon: tower_number=${w.tower_number}, indent_number=${finalIndentNumber || 'null'}, preserved bag counts and loading times`);
      } else {
        // ✅ INSERT new wagon
        await pool.query(
          `
          INSERT INTO wagon_records (
            wagon_number,
            wagon_type,
            cc_weight,
            sick_box,
            wagon_to_be_loaded,
            tower_number,
            loaded_bag_count,
            unloaded_bag_count,
            loading_start_time,
            loading_end_time,
            seal_number,
            stoppage_time,
            remarks,
            loading_status,
            loading_status_manual_override,
            indent_number,
            wagon_destination,
            commodity,
            customer_id,
            rake_serial_number,
            siding
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
          )
          `,
          [
            w.wagon_number || null,
            w.wagon_type || null,
            w.cc_weight || null,
            w.sick_box === "Yes",
            w.wagon_to_be_loaded || null,
            w.tower_number,
            loadedBagCount,
            unloadedBagCount,
            loadingStartTime,
            loadingEndTime,
            sealNum,
            w.stoppage_time || 0,
            w.remarks || null,
            loadingStatus,
            Boolean(w.loading_status_manual_override),
            finalIndentNumber,
            w.wagon_destination || null,
            w.commodity || null,
            w.customer_id || null,
            wagonRakeSerialNumber,
            header?.siding || null,
          ]
        );
        console.log(`[DRAFT SAVE] INSERTED new wagon: tower_number=${w.tower_number}, indent_number=${finalIndentNumber || 'null'}`);
      }

    }

    /* ===============================
       4️⃣ CHECK FOR SEQUENTIAL NUMBER ASSIGNMENT (when bag counting starts)
       =============================== */
    /* ===============================
       4️⃣ CHECK FOR DYNAMIC SERIAL NUMBER ASSIGNMENT (when bag counting starts)
       =============================== */
    // Track updated train_ids to return in response
    const updatedTrainIds = {};

    // ✅ FIX: DISABLED - Dynamic assignment should NOT happen on Save button
    // Splitting should ONLY happen when user clicks Proceed button and confirms via popup
    // The generateMultipleRakeSerial endpoint handles splitting explicitly
    // This prevents automatic splitting when Save is clicked
    console.log(`[DYNAMIC ASSIGN] Dynamic assignment DISABLED for Save button. Splitting only occurs on Proceed button.`);

    // ============================================
    // DYNAMIC ASSIGNMENT BLOCK - COMPLETELY DISABLED
    // This entire block is disabled to prevent splitting on Save button
    // Splitting only happens when user clicks Proceed and confirms via popup
    // ============================================
    /*
    if (hasSequentialSerials && !singleIndent) {
      // ✅ FIX: Check if sequential numbers have already been assigned (when user clicked "Yes" for multiple rake serial)
      // If they have, skip dynamic assignment to avoid overwriting
      const alreadyAssignedCheck = await pool.query(
        `SELECT COUNT(*) as count FROM dashboard_records 
         WHERE (rake_serial_number = $1 OR rake_serial_number LIKE $2)
         AND indent_number IS NOT NULL 
         AND indent_number != ''
         AND rake_serial_number != $1`,
        [rakeSerialNumber, `${rakeSerialNumber}-%`]
      );
      
      const alreadyAssigned = Number(alreadyAssignedCheck.rows[0]?.count || 0) > 0;
      if (alreadyAssigned) {
        console.log(`[DYNAMIC ASSIGN] Sequential numbers already assigned when user selected "Yes" for multiple rake serial. Skipping dynamic assignment.`);
        // Skip the entire dynamic assignment block
      } else {
      // ✅ FIX: Only run dynamic assignment if bag counting has JUST STARTED
      // Get existing wagon bag counts from database to detect if counting just started
      const existingBagCountsRes = await pool.query(
        `SELECT tower_number, indent_number, loaded_bag_count 
         FROM wagon_records 
         WHERE rake_serial_number = $1 
         AND indent_number IS NOT NULL 
         AND indent_number != ''`,
        [rakeSerialNumber]
      );
      
      // Create a map of existing bag counts by tower_number + indent_number
      const existingBagCountsMap = {};
      existingBagCountsRes.rows.forEach(row => {
        const key = `${row.tower_number}_${row.indent_number}`;
        existingBagCountsMap[key] = Number(row.loaded_bag_count || 0);
      });

      // Check if ANY wagon has JUST started counting (0 -> > 0 transition)
      let hasNewBagCountingStart = false;
      for (const w of wagons) {
        const indentNum = w.indent_number || header?.indent_number;
        if (!indentNum) continue;
        
        const key = `${w.tower_number}_${indentNum}`;
        const existingCount = existingBagCountsMap[key] || 0;
        const newCount = Number(w.loaded_bag_count || 0);
        
        // Detect if bag counting just started (was 0, now > 0)
        if (existingCount === 0 && newCount > 0) {
          hasNewBagCountingStart = true;
          console.log(`[DYNAMIC ASSIGN] Detected bag counting start: wagon tower_number=${w.tower_number}, indent_number=${indentNum}, count: ${existingCount} -> ${newCount}`);
          break;
        }
      }

      // ✅ FIX: Only proceed with dynamic assignment if bag counting has JUST STARTED
      if (!hasNewBagCountingStart) {
        console.log(`[DYNAMIC ASSIGN] No new bag counting start detected. Skipping dynamic assignment.`);
        // Skip the entire dynamic assignment block
      } else {
      // Get all distinct indent numbers from the wagons we just saved
      const savedIndentNumbers = [...new Set(
          wagons.map(w => w.indent_number || header?.indent_number).filter(Boolean)
      )];
      console.log(`[DYNAMIC ASSIGN] Indents to process: ${savedIndentNumbers.join(', ')}`);

        // First, get all indents that have already started counting (from database)
        // This helps us determine which indent was truly the first
        const allStartedIndentsRes = await pool.query(
          `SELECT DISTINCT indent_number FROM wagon_records 
           WHERE rake_serial_number = $1
           AND indent_number IS NOT NULL
           AND indent_number != ''
           AND loaded_bag_count > 0`,
          [rakeSerialNumber]
        );
        const dbStartedIndents = new Set(allStartedIndentsRes.rows.map(r => r.indent_number));

        // Also check which indents in the current batch have started counting
        const currentBatchStartedIndents = savedIndentNumbers.filter(indentNum => {
          const indentWagons = wagons.filter(w => (w.indent_number || header.indent_number) === indentNum);
          return indentWagons.some(w => Number(w.loaded_bag_count || 0) > 0);
        });

        // Combine database and current batch to get all started indents
        currentBatchStartedIndents.forEach(indent => dbStartedIndents.add(indent));
        const allStartedIndents = Array.from(dbStartedIndents);

        console.log(`[DYNAMIC ASSIGN] All started indents (DB + current batch): ${allStartedIndents.join(', ')}`);

        // Track which indent was the first to start counting (it keeps the original rake serial number)
        let firstStarterIndent = allStartedIndents.length > 0 ? allStartedIndents[0] : null;

      for (const indentNum of savedIndentNumbers) {
        // Check if this indent has any wagon with loaded_bag_count > 0 (counting started)
        const indentWagons = wagons.filter(w => (w.indent_number || header.indent_number) === indentNum);
        const hasCountingStarted = indentWagons.some(w => Number(w.loaded_bag_count || 0) > 0);

        // ✅ FIX: Check if loading is already completed for this indent
        // If all wagons are completed, don't reassign rake_serial_number
        const allWagonsCompleted = indentWagons.length > 0 && indentWagons.every(w => {
          const wagonToBeLoaded = w.wagon_to_be_loaded != null && w.wagon_to_be_loaded !== "" ? Number(w.wagon_to_be_loaded) : null;
          const loadedBagCount = Number(w.loaded_bag_count || 0);
          return wagonToBeLoaded != null ? (loadedBagCount >= wagonToBeLoaded && loadedBagCount > 0) : false;
        });
        
        // Also check database for completed status
        let dbAllWagonsCompleted = false;
        try {
          const dbWagonsRes = await pool.query(
            `SELECT COUNT(*) as total, 
                    SUM(CASE WHEN wagon_to_be_loaded IS NOT NULL 
                             AND loaded_bag_count >= wagon_to_be_loaded 
                             AND loaded_bag_count > 0 THEN 1 ELSE 0 END) as completed
             FROM wagon_records 
             WHERE rake_serial_number = $1 AND indent_number = $2`,
            [rakeSerialNumber, indentNum]
          );
          if (dbWagonsRes.rows.length > 0) {
            const total = Number(dbWagonsRes.rows[0].total) || 0;
            const completed = Number(dbWagonsRes.rows[0].completed) || 0;
            dbAllWagonsCompleted = total > 0 && completed === total;
          }
        } catch (err) {
          console.error(`[DYNAMIC ASSIGN] Error checking completion status for indent ${indentNum}:`, err);
        }
        
        const isFullyCompleted = allWagonsCompleted || dbAllWagonsCompleted;
        
        if (isFullyCompleted) {
          console.log(`[DYNAMIC ASSIGN] Indent ${indentNum} is fully completed. Skipping rake_serial_number reassignment.`);
          continue; // Skip reassignment for completed indents
        }

        if (hasCountingStarted) {
          // Check if this indent is still using the shared base train_id (hasn't been split yet)
          // Get current rake serial number and train_id for this indent
          const currentIndentRecord = await pool.query(
            "SELECT rake_serial_number AS train_id, rake_serial_number FROM dashboard_records WHERE rake_serial_number = $1 AND indent_number = $2 LIMIT 1",
            [rakeSerialNumber, indentNum]
          );

          if (currentIndentRecord.rows.length === 0) {
            console.log(`[DYNAMIC ASSIGN] Indent ${indentNum} not found in dashboard_records, skipping`);
            continue;
          }

          const currentRecord = currentIndentRecord.rows[0];
          const currentRakeSerialNumber = currentRecord.rake_serial_number;
          const currentTrainIdForIndent = currentRecord.rake_serial_number; // ✅ FIX: Use rake_serial_number instead of train_id

          // Get the base rake serial number from the original train
          const baseTrainRecord = await pool.query(
            "SELECT rake_serial_number FROM train_session WHERE rake_serial_number = $1 LIMIT 1",
            [rakeSerialNumber]
          );
          const baseRakeSerialNumber = baseTrainRecord.rows[0]?.rake_serial_number || currentRakeSerialNumber;

          // Determine if this is the first starter
          // First starter is the one that appears first in the list of all started indents
          const isFirstStarter = indentNum === firstStarterIndent;
          
          if (isFirstStarter) {
            // This is the FIRST indent to start counting - it keeps the original rake serial number
            console.log(`[DYNAMIC ASSIGN] Indent ${indentNum} is the FIRST starter. Keeping original rake serial number: ${baseRakeSerialNumber}`);
            
            // Even if train_id is different, ensure rake_serial_number matches the base
            if (currentRakeSerialNumber !== baseRakeSerialNumber) {
              console.log(`[DYNAMIC ASSIGN] Updating rake_serial_number for first starter ${indentNum} to match base: ${baseRakeSerialNumber}`);
              await pool.query(
                `UPDATE dashboard_records
                 SET rake_serial_number = $1
                 WHERE rake_serial_number = $2 AND indent_number = $3`,
                [baseRakeSerialNumber, currentTrainIdForIndent, indentNum]
              );
            }
          } else {
            // This is a SUBSEQUENT indent (second, third, etc.) - needs unique rake serial number
            console.log(`[DYNAMIC ASSIGN] Indent ${indentNum} is a subsequent starter. Current rake serial: ${currentRakeSerialNumber}. Finding unique number.`);

            // Use the base rake serial number as starting point if current is same as base or null
            const startingRakeSerialNumber = (currentRakeSerialNumber && currentRakeSerialNumber !== baseRakeSerialNumber) 
              ? currentRakeSerialNumber 
              : baseRakeSerialNumber;

            if (!startingRakeSerialNumber) {
              console.log(`[DYNAMIC ASSIGN] Warning: Indent ${indentNum} has no rake serial number, using generateTrainId()`);
              const newRakeSerialNumber = await generateTrainId();
              // Keep train_id the same (don't change it) - only update rake_serial_number
              const finalTrainId = rakeSerialNumber;

              // Create new train_session
              const currentSessionRes = await pool.query(
                "SELECT wagon_count, siding FROM train_session WHERE rake_serial_number = $1",
                [rakeSerialNumber]
              );
              const currentSession = currentSessionRes.rows[0];
              const sidingForNew = preservedSiding || currentSession?.siding;
              const wagonCountForNew = currentSession?.wagon_count || 0;

              // No need to create new train_session - train_id stays the same
              // Update rake_serial_number in dashboard_records
              await pool.query(
                `UPDATE dashboard_records
                 SET rake_serial_number = $1
                 WHERE rake_serial_number = $2 AND indent_number = $3`,
                [newRakeSerialNumber, rakeSerialNumber, indentNum]
              );

              // ✅ FIX: Also update wagon_records for this indent to use the new rake_serial_number
              await pool.query(
                `UPDATE wagon_records
                 SET rake_serial_number = $1
                 WHERE rake_serial_number = $2 AND indent_number = $3`,
                [newRakeSerialNumber, rakeSerialNumber, indentNum]
              );

              console.log(`[DYNAMIC ASSIGN] Assigned new rake serial number ${newRakeSerialNumber} to indent ${indentNum} (updated dashboard_records and wagon_records)`);
              updatedTrainIds[indentNum] = rakeSerialNumber;
            } else {
              // Get next unique rake serial number by incrementing from starting point
              const newRakeSerialNumber = await generateNextUniqueRakeSerialNumber(startingRakeSerialNumber);
              // Keep train_id the same (don't change it) - only update rake_serial_number
              // No need to create new train_session - train_id stays the same
              // Update rake_serial_number in dashboard_records
              await pool.query(
                `UPDATE dashboard_records
                 SET rake_serial_number = $1
                 WHERE rake_serial_number = $2 AND indent_number = $3`,
                [newRakeSerialNumber, rakeSerialNumber, indentNum]
              );

              // ✅ FIX: Also update wagon_records for this indent to use the new rake_serial_number
              await pool.query(
                `UPDATE wagon_records
                 SET rake_serial_number = $1
                 WHERE rake_serial_number = $2 AND indent_number = $3`,
                [newRakeSerialNumber, rakeSerialNumber, indentNum]
              );

              console.log(`[DYNAMIC ASSIGN] Assigned unique rake serial number ${newRakeSerialNumber} to indent ${indentNum} (incremented from ${startingRakeSerialNumber}, updated dashboard_records and wagon_records)`);
              updatedTrainIds[indentNum] = rakeSerialNumber;
            }
            }
        }
      }
      } // End of hasNewBagCountingStart else block
      } // End of alreadyAssigned else block
    }
    */
    // ============================================
    // END OF DISABLED DYNAMIC ASSIGNMENT BLOCK
    // ============================================

    // ✅ FIX: Add activity timeline entry for reviewer changes (only if there are actual changes)
    // Check if there are existing headers OR existing wagons to compare against
    console.log(`[ACTIVITY TIMELINE] Checking conditions: reviewerUsername=${reviewerUsername}, userRole=${userRole}, existingHeaders.length=${existingHeaders.length}, existingWagons.length=${existingWagons.length}`);
    if (reviewerUsername && (userRole === "REVIEWER" || userRole === "ADMIN") && (existingHeaders.length > 0 || existingWagons.length > 0)) {
      console.log(`[ACTIVITY TIMELINE] Conditions met, proceeding with change detection`);
      // ✅ FIX: Fetch customer names for customer_id lookups
      const customerMap = new Map();
      try {
        const customerRes = await pool.query("SELECT id, customer_name FROM customers");
        customerRes.rows.forEach(row => {
          customerMap.set(String(row.id), row.customer_name);
        });
      } catch (err) {
        console.error("Error fetching customers for activity timeline:", err);
      }

      // Compare header changes
      const headerChanges = [];
      if (existingHeaders.length > 0) {
        const existingHeader = existingHeaders[0];
        const headerFieldNames = {
          indent_number: "Indent Number",
          customer_id: "Customer Name",
          wagon_destination: "Wagon Destination",
          commodity: "Commodity",
        };

        for (const [field, displayName] of Object.entries(headerFieldNames)) {
          let oldValue = existingHeader[field] != null ? String(existingHeader[field]) : "";
          let newValue = header?.[field] != null ? String(header[field]) : "";

          // ✅ FIX: Convert customer_id to customer name
          if (field === "customer_id") {
            oldValue = oldValue && customerMap.has(oldValue) ? customerMap.get(oldValue) : (oldValue || "");
            newValue = newValue && customerMap.has(newValue) ? customerMap.get(newValue) : (newValue || "");
          }

          if (oldValue !== newValue) {
            headerChanges.push({
              field: displayName,
              oldValue: oldValue || "(empty)",
              newValue: newValue || "(empty)",
            });
          }
        }
      }

      // Compare wagon changes
      const wagonChanges = [];

      // Build multiple maps for robust matching
      const existingWagonsByTowerNumber = new Map();
      const existingWagonsByIndex = new Map();
      const existingWagonsByWagonNumber = new Map();

      // Build maps of existing wagons using multiple criteria
      existingWagons.forEach((w, idx) => {
        // Map by tower_number (primary key)
        if (w.tower_number != null) {
          existingWagonsByTowerNumber.set(String(w.tower_number), w);
        }
        // Map by index (fallback)
        existingWagonsByIndex.set(String(idx), w);
        // Map by wagon_number (additional fallback)
        if (w.wagon_number != null && w.wagon_number !== '') {
          existingWagonsByWagonNumber.set(String(w.wagon_number).trim(), w);
        }
      });

      // Debug: Log existing wagons details
      console.log(`[ACTIVITY TIMELINE] Existing wagons count: ${existingWagons.length}, New wagons count: ${wagons.length}`);
      existingWagons.forEach((w, idx) => {
        console.log(`[ACTIVITY TIMELINE] Existing wagon ${idx}: tower_number=${w.tower_number}, wagon_number=${w.wagon_number}, cc_weight=${w.cc_weight}, indent_number=${w.indent_number}`);
      });

      // Debug: Log new wagons details
      wagons.forEach((w, idx) => {
        console.log(`[ACTIVITY TIMELINE] New wagon ${idx}: tower_number=${w.tower_number}, wagon_number=${w.wagon_number}, cc_weight=${w.cc_weight}, indent_number=${w.indent_number}`);
      });

      // Compare each wagon in the new data with existing data
      wagons.forEach((w, idx) => {
        let existingWagon = null;
        let matchMethod = '';

        // Try multiple matching strategies
        // 1. Try by tower_number (most reliable)
        if (w.tower_number != null) {
          existingWagon = existingWagonsByTowerNumber.get(String(w.tower_number));
          if (existingWagon) {
            matchMethod = 'tower_number';
          }
        }

        // 2. Try by index (fallback)
        if (!existingWagon) {
          existingWagon = existingWagonsByIndex.get(String(idx));
          if (existingWagon) {
            matchMethod = 'index';
          }
        }

        // 3. Try by wagon_number (additional fallback)
        if (!existingWagon && w.wagon_number != null && w.wagon_number !== '') {
          existingWagon = existingWagonsByWagonNumber.get(String(w.wagon_number).trim());
          if (existingWagon) {
            matchMethod = 'wagon_number';
          }
        }

        // Debug: Log matching result
        if (existingWagon) {
          console.log(`[ACTIVITY TIMELINE] Wagon ${idx} matched by ${matchMethod}: tower_number=${w.tower_number}, existing_tower_number=${existingWagon.tower_number}`);
        } else {
          console.log(`[ACTIVITY TIMELINE] Wagon ${idx} NOT FOUND in existing data: tower_number=${w.tower_number}, wagon_number=${w.wagon_number}, idx=${idx}`);
        }

        if (existingWagon) {
          // Compare wagon fields
          const wagonFieldNames = {
            wagon_number: "Wagon Number",
            wagon_type: "Wagon Type",
            cc_weight: "CC Weight",
            sick_box: "Sick Box",
            wagon_to_be_loaded: "Bags To Be Loaded",
            commodity: "Commodity",
            seal_number: "Seal Number",
            stoppage_time: "Stoppage Time",
            remarks: "Remarks",
            loading_status: "Loading Completed",
            wagon_destination: "Wagon Destination",
            customer_id: "Customer Name",
          };

          // Track all changes for this wagon
          const wagonChangesForThisWagon = [];

          for (const [field, displayName] of Object.entries(wagonFieldNames)) {
            let oldValue = existingWagon[field];
            let newValue = w[field];

            // Normalize values for comparison
            if (field === "sick_box") {
              oldValue = oldValue ? "Yes" : "No";
              newValue = newValue === "Yes" || newValue === true ? "Yes" : "No";
            } else if (field === "loading_status") {
              oldValue = oldValue ? "Yes" : "No";
              newValue = newValue ? "Yes" : "No";
            } else if (field === "seal_number") {
              // Normalize seal numbers - trim and compare
              oldValue = oldValue != null ? String(oldValue).trim() : "";
              newValue = newValue != null ? String(newValue).trim() : "";
            } else if (field === "cc_weight" || field === "wagon_to_be_loaded") {
              // ✅ FIX: Normalize numeric fields - convert to numbers first, then to string for consistent comparison
              // Handle both number and string inputs
              const oldNum = oldValue != null ? (typeof oldValue === 'number' ? oldValue : parseFloat(String(oldValue).trim()) || 0) : 0;
              const newNum = newValue != null ? (typeof newValue === 'number' ? newValue : parseFloat(String(newValue).trim()) || 0) : 0;
              oldValue = isNaN(oldNum) ? "" : String(oldNum);
              newValue = isNaN(newNum) ? "" : String(newNum);
            } else {
              oldValue = oldValue != null ? String(oldValue).trim() : "";
              newValue = newValue != null ? String(newValue).trim() : "";
            }

            // ✅ FIX: Convert customer_id to customer name
            if (field === "customer_id") {
              oldValue = oldValue && customerMap.has(oldValue) ? customerMap.get(oldValue) : (oldValue || "");
              newValue = newValue && customerMap.has(newValue) ? customerMap.get(newValue) : (newValue || "");
            }

            if (oldValue !== newValue) {
              wagonChangesForThisWagon.push({
                field: displayName,
                oldValue: oldValue || "(empty)",
                newValue: newValue || "(empty)",
              });
              // Debug: Log field comparison
              console.log(`[ACTIVITY TIMELINE] Field change detected for Wagon ${w.tower_number != null ? w.tower_number : idx + 1}: ${displayName} - "${oldValue || "(empty)"}" → "${newValue || "(empty)"}"`);
            }
          }

          // Add all changes for this wagon to the main changes array
          if (wagonChangesForThisWagon.length > 0) {
            console.log(`[ACTIVITY TIMELINE] Found ${wagonChangesForThisWagon.length} change(s) for Wagon ${w.tower_number != null ? w.tower_number : idx + 1}`);
            wagonChangesForThisWagon.forEach(change => {
              // Use actual wagon_number if available, otherwise fall back to tower_number
              const wagonLabel = (w.wagon_number && String(w.wagon_number).trim() !== "")
                ? String(w.wagon_number).trim()
                : `Wagon ${w.tower_number != null ? w.tower_number : idx + 1}`;
              wagonChanges.push({
                wagon: wagonLabel,
                field: change.field,
                oldValue: change.oldValue,
                newValue: change.newValue,
              });
              // Debug: Log each change detected
              console.log(`[ACTIVITY TIMELINE] Change detected: ${wagonLabel} - ${change.field}: "${change.oldValue}" → "${change.newValue}"`);
            });
          } else {
            console.log(`[ACTIVITY TIMELINE] No changes detected for Wagon ${w.tower_number != null ? w.tower_number : idx + 1}`);
          }
        } else {
          // New wagon added
          // Use actual wagon_number if available, otherwise fall back to tower_number
          const wagonLabel = (w.wagon_number && String(w.wagon_number).trim() !== "")
            ? String(w.wagon_number).trim()
            : `Wagon ${w.tower_number != null ? w.tower_number : idx + 1}`;
          wagonChanges.push({
            wagon: wagonLabel,
            field: "Status",
            oldValue: "(empty)",
            newValue: "Added",
          });
        }
      });

      // Check for deleted wagons (wagons that existed but are no longer in the new data)
      // Create a set of matched existing wagons
      const matchedExistingWagons = new Set();
      wagons.forEach((w, idx) => {
        // Mark existing wagons that were matched
        let existingWagon = null;
        if (w.tower_number != null) {
          existingWagon = existingWagonsByTowerNumber.get(String(w.tower_number));
        }
        if (!existingWagon) {
          existingWagon = existingWagonsByIndex.get(String(idx));
        }
        if (!existingWagon && w.wagon_number != null && w.wagon_number !== '') {
          existingWagon = existingWagonsByWagonNumber.get(String(w.wagon_number).trim());
        }
        if (existingWagon) {
          // Mark this existing wagon as matched
          matchedExistingWagons.add(existingWagon);
        }
      });

      // Find existing wagons that weren't matched (deleted)
      existingWagons.forEach((w, idx) => {
        if (!matchedExistingWagons.has(w)) {
          // Use actual wagon_number if available, otherwise fall back to tower_number
          const wagonLabel = (w.wagon_number && String(w.wagon_number).trim() !== "")
            ? String(w.wagon_number).trim()
            : `Wagon ${w.tower_number != null ? w.tower_number : idx + 1}`;
          wagonChanges.push({
            wagon: wagonLabel,
            field: "Status",
            oldValue: "Exists",
            newValue: "Deleted",
          });
          console.log(`[ACTIVITY TIMELINE] Wagon deleted: ${wagonLabel}`);
        }
      });

      // Debug: Log summary of all detected changes
      console.log(`[ACTIVITY TIMELINE] Summary: ${headerChanges.length} header change(s), ${wagonChanges.length} wagon change(s) detected`);

      // ✅ FIX: Only log to activity timeline if there are actual changes
      if (headerChanges.length > 0 || wagonChanges.length > 0) {
        const changeDescriptions = [];

        if (headerChanges.length > 0) {
          const headerDesc = headerChanges.map(c =>
            `${c.field}: "${c.oldValue}" → "${c.newValue}"`
          ).join("; ");
          changeDescriptions.push(`Header: ${headerDesc}`);
        }

        if (wagonChanges.length > 0) {
          // Group wagon changes by wagon
          const wagonGroups = {};
          wagonChanges.forEach(c => {
            if (!wagonGroups[c.wagon]) {
              wagonGroups[c.wagon] = [];
            }
            wagonGroups[c.wagon].push(`${c.field}: "${c.oldValue}" → "${c.newValue}"`);
          });

          const wagonDesc = Object.entries(wagonGroups).map(([wagon, changes]) =>
            `${wagon} (${changes.join("; ")})`
          ).join(" | ");
          changeDescriptions.push(`Wagons: ${wagonDesc}`);

          // Debug: Log grouped changes
          console.log(`[ACTIVITY TIMELINE] Grouped wagon changes:`, Object.keys(wagonGroups).map(w => `${w}: ${wagonGroups[w].length} change(s)`).join(', '));
        }

        // Store change details in structured format for Excel export
        const changeDetails = {
          headerChanges: headerChanges,
          wagonChanges: wagonChanges,
          timestamp: new Date().toISOString()
        };

        // Store both human-readable notes and structured change details as JSON
        const notes = `Reviewer made changes: ${changeDescriptions.join(" | ")}`;
        const changeDetailsJson = JSON.stringify(changeDetails);

        // Store notes with change details JSON appended (separated by special marker)
        const notesWithDetails = `${notes}|||CHANGE_DETAILS:${changeDetailsJson}`;

        // Determine indent_number for activity timeline
        const indentNumForTimeline = singleIndent
          ? (header?.indent_number || null)
          : (wagons.length > 0 ? (wagons[0].indent_number || null) : null);

        await addActivityTimelineEntry(
          rakeSerialNumber,
          indentNumForTimeline,
          'REVIEWER_TRAIN_EDITED',
          reviewerUsername,
          notesWithDetails
        );
      }
      // ✅ FIX: Don't log if there are no changes (user only wants edited fields watched)
    }

    // ─── Customer "Loading Started" notification ───
    // When an admin maps a customer to a rake (Save/Proceed), send a notification
    // email to the customer. Only send if:
    //   1. A customer_id is now assigned (from header or wagons)
    //   2. The customer_id was NOT previously assigned (new mapping)
    const newCustomerId = header?.customer_id
      ? Number(header.customer_id)
      : (wagons.find(w => w.customer_id)?.customer_id
        ? Number(wagons.find(w => w.customer_id).customer_id)
        : null);

    if (newCustomerId && (!previousCustomerId || Number(previousCustomerId) !== newCustomerId)) {
      // Fire-and-forget: don't block the response for email sending
      (async () => {
        try {
          // Fetch customer email from users table
          const customerEmailRes = await pool.query(
            `SELECT u.email, c.customer_name
             FROM users u
             JOIN customers c ON c.id = u.customer_id
             WHERE u.customer_id = $1
               AND u.role = 'CUSTOMER'
               AND u.is_active = true
               AND u.email IS NOT NULL
               AND u.email <> ''
             LIMIT 1`,
            [newCustomerId]
          );

          if (customerEmailRes.rows.length === 0) {
            console.log(`[CUSTOMER-NOTIFY] No valid email found for customer_id=${newCustomerId} – skipping`);
            return;
          }

          const { email: customerEmail, customer_name: customerName } = customerEmailRes.rows[0];

          if (!isValidEmail(customerEmail)) {
            console.log(`[CUSTOMER-NOTIFY] Invalid email "${customerEmail}" for customer_id=${newCustomerId} – skipping`);
            return;
          }

          const subject = `Loading Started – Rake ${rakeSerialNumber}`;
          const html = `
            <div style="font-family:Arial,sans-serif;max-width:700px;">
              <h2 style="color:#27ae60;">🚛 Loading Started</h2>
              <p>Dear <strong>${customerName || "Customer"}</strong>,</p>
              <p>Your rake has been assigned and loading is ready to begin.</p>
              <table style="border-collapse:collapse;width:100%;margin:16px 0;">
                <thead>
                  <tr style="background:#0B3A6E;color:#fff;">
                    <th style="padding:8px 12px;text-align:left;">Rake Serial</th>
                    <th style="padding:8px 12px;text-align:left;">Siding</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${rakeSerialNumber}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${siding || "-"}</td>
                  </tr>
                </tbody>
              </table>
              <p style="color:#555;font-size:13px;">
                Notification sent at: ${new Date().toLocaleString()}<br/>
                Please monitor the dashboard for loading progress.
              </p>
            </div>
          `;

          await sendAlertEmail([customerEmail], subject, html);
          console.log(`[CUSTOMER-NOTIFY] "Loading Started" email sent to ${customerEmail} for rake ${rakeSerialNumber}`);
        } catch (emailErr) {
          console.error(`[CUSTOMER-NOTIFY] Failed to send email for rake ${rakeSerialNumber}:`, emailErr.message);
        }
      })();
    }

    // Return updated train_ids if any sequential numbers were assigned
    const response = { message: "Draft saved successfully" };
    if (Object.keys(updatedTrainIds).length > 0) {
      response.updatedTrainIds = updatedTrainIds;
      response.trainIdChanged = true;
    }

    res.json(response);
  } catch (err) {
    console.error("SAVE DRAFT ERROR:", err);
    res.status(500).json({ message: "Failed to save draft" });
  }
};

const getDispatch = async (req, res) => {
  const { trainId } = req.params;
  // trainId may be URL encoded (e.g., "2025-26%2F02%2F001"), decode it
  const decodedTrainId = trainId.replace(/_/g, "/");
  const indentNumber = req.query.indent_number; // Support Case 2: multiple indents with same train_id

  try {
    // ✅ FIX: URL trainId is now always rake_serial_number
    // No need to resolve - use it directly
    const rakeSerialNumber = decodedTrainId;

    // Get dashboard record for this train (and optionally indent_number)
    // Check both train_id and rake_serial_number since URL might use either
    // ✅ FIX: Also get rake_serial_number to return in response
    // ✅ FIX: Also check the original decodedTrainId in case it's a rake_serial_number
    let headerQuery, headerParams;
    if (indentNumber) {
      headerQuery = `SELECT siding, indent_number, rake_serial_number FROM dashboard_records WHERE rake_serial_number = $1 AND indent_number=$2 LIMIT 1`;
      headerParams = [rakeSerialNumber, indentNumber];
    } else {
      // Get first available dashboard record (prefer null/empty indent_number, then first by indent_number)
      headerQuery = `
        SELECT siding, indent_number, rake_serial_number 
        FROM dashboard_records 
        WHERE rake_serial_number = $1
        ORDER BY 
          CASE WHEN indent_number IS NULL OR indent_number = '' THEN 0 ELSE 1 END,
          indent_number
        LIMIT 1
      `;
      headerParams = [rakeSerialNumber];
    }

    // Start with primary lookup
    let headerRes = await pool.query(headerQuery, headerParams);

    // ✅ ROBUSTNESS: graceful fallbacks instead of immediate 404
    // 1) If we requested a specific indent_number but found nothing,
    //    fall back to the "parent" dashboard record for this rake_serial_number
    //    (the row with NULL/empty indent_number, or the first by indent_number).
    if (headerRes.rows.length === 0 && indentNumber) {
      console.warn(
        `[GET DISPATCH] No dashboard record for rake_serial_number=${rakeSerialNumber} and indent_number=${indentNumber}. Falling back to parent record.`
      );

      const fallbackParentQuery = `
        SELECT siding, indent_number, rake_serial_number 
        FROM dashboard_records 
        WHERE rake_serial_number = $1
        ORDER BY 
          CASE WHEN indent_number IS NULL OR indent_number = '' THEN 0 ELSE 1 END,
          indent_number
        LIMIT 1
      `;
      headerRes = await pool.query(fallbackParentQuery, [rakeSerialNumber]);
    }

    // 2) If still nothing and this looks like a child serial (e.g. 2024-25/01/001-1),
    //    try the base/parent rake_serial_number (without the "-N" suffix).
    if (headerRes.rows.length === 0 && rakeSerialNumber.match(/^(.+\/\d+\/\d+)-(\d+)$/)) {
      const parentTrainId = rakeSerialNumber.replace(/-(\d+)$/, "");
      console.warn(
        `[GET DISPATCH] No dashboard record for child rake_serial_number=${rakeSerialNumber}. Trying parent=${parentTrainId}.`
      );

      const parentHeaderQuery = `
        SELECT siding, indent_number, rake_serial_number 
        FROM dashboard_records 
        WHERE rake_serial_number = $1
        ORDER BY 
          CASE WHEN indent_number IS NULL OR indent_number = '' THEN 0 ELSE 1 END,
          indent_number
        LIMIT 1
      `;
      headerRes = await pool.query(parentHeaderQuery, [parentTrainId]);
    }

    if (headerRes.rows.length === 0) {
      console.warn(
        `[GET DISPATCH] No dashboard_records found for rake_serial_number=${rakeSerialNumber} (or parent) and indent_number=${indentNumber || "none"}. Trying wagon_records fallback.`
      );

      // ✅ FALLBACK 3: If there is no dashboard record yet (e.g. multiple-indent flow
      // with single rake serial where dashboard_records wasn't written but wagons exist),
      // synthesize minimal header data from wagon_records so Dispatch page can still load.
      try {
        const wagonHeaderRes = await pool.query(
          `
          SELECT rake_serial_number, indent_number
          FROM wagon_records
          WHERE rake_serial_number = $1
          ORDER BY 
            CASE WHEN indent_number IS NULL OR indent_number = '' THEN 0 ELSE 1 END,
            indent_number
          LIMIT 1
          `,
          [rakeSerialNumber]
        );

        if (wagonHeaderRes.rows.length === 0) {
          console.error(
            `[GET DISPATCH] No wagon_records found for rake_serial_number=${rakeSerialNumber}. Returning 404.`
          );
          return res.status(404).json({ message: "Train not found" });
        }

        // Synthesize a minimal "header" row compatible with downstream logic.
        // siding is left null/empty (frontend treats missing siding as "-"),
        // indent_number and rake_serial_number come from wagon_records.
        headerRes = {
          rows: [
            {
              siding: null,
              indent_number: wagonHeaderRes.rows[0].indent_number,
              rake_serial_number: wagonHeaderRes.rows[0].rake_serial_number,
            },
          ],
        };

        console.warn(
          `[GET DISPATCH] Using wagon_records fallback header for rake_serial_number=${rakeSerialNumber}, indent_number=${headerRes.rows[0].indent_number || "none"}.`
        );
      } catch (fallbackErr) {
        console.error(
          `[GET DISPATCH] Error while trying wagon_records fallback for rake_serial_number=${rakeSerialNumber}:`,
          fallbackErr
        );
        return res.status(404).json({ message: "Train not found" });
      }
    }

    // Get the indent_number from the dashboard record (this is the source of truth)
    const dashboardIndentNumber = headerRes.rows[0].indent_number;

    // Get dispatch record matching the dashboard record's indent_number
    // ✅ FIX: Use both train_id and rake_serial_number for dispatch queries
    let dispatchQuery, dispatchParams;
    if (dashboardIndentNumber && dashboardIndentNumber !== null && dashboardIndentNumber !== '') {
      // Match dispatch record with the same indent_number as dashboard record
      dispatchQuery = `SELECT * FROM dispatch_records WHERE rake_serial_number = $1 AND indent_number=$2`;
      dispatchParams = [rakeSerialNumber, dashboardIndentNumber];
    } else {
      // Dashboard has no indent_number, so look for dispatch with null/empty indent_number
      dispatchQuery = `SELECT * FROM dispatch_records WHERE rake_serial_number = $1 AND (indent_number IS NULL OR indent_number = '')`;
      dispatchParams = [rakeSerialNumber];
    }

    let dispatchRes = await pool.query(dispatchQuery, dispatchParams);

    // If this is a child serial number (e.g., 2024-25/01/001-1) and no dispatch records exist,
    // check if parent has dispatch records and copy them
    // Pattern: financial_year/month/sequence-sequential (e.g., 2024-25/01/001-1)
    if (dispatchRes.rows.length === 0 && rakeSerialNumber.match(/^(.+\/\d+\/\d+)-(\d+)$/)) {
      const parentTrainId = rakeSerialNumber.replace(/-(\d+)$/, '');

      const parentDispatchRes = await pool.query(
        `SELECT * FROM dispatch_records WHERE rake_serial_number = $1`,
        [parentTrainId]
      );

      if (parentDispatchRes.rows.length > 0) {
        // Get parent's rake_serial_number
        const parentRakeSerial = parentDispatchRes.rows[0].rake_serial_number;
        // Get child's rake_serial_number
        let childRakeSerial = null;
        try {
          const childRakeRes = await pool.query(
            "SELECT rake_serial_number FROM train_session WHERE rake_serial_number = $1 LIMIT 1",
            [rakeSerialNumber]
          );
          childRakeSerial = childRakeRes.rows[0]?.rake_serial_number || null;
        } catch (err) {
          console.error("Error getting child rake_serial_number:", err);
        }

        // Copy dispatch records from parent to child
        await pool.query(
          `
          INSERT INTO dispatch_records (
            source, siding, indent_wagon_count, vessel_name, rake_type, status,
            rake_placement_datetime, rake_clearance_datetime, rake_idle_time,
            rake_loading_start_datetime, rake_loading_end_actual, rake_loading_end_railway,
            door_closing_datetime, rake_haul_out_datetime, loading_start_officer,
            loading_completion_officer, remarks, rr_number, indent_number,
            submitted_by, submitted_at, rake_serial_number
          )
          SELECT 
            source, siding, indent_wagon_count, vessel_name, rake_type, status,
            rake_placement_datetime, rake_clearance_datetime, rake_idle_time,
            rake_loading_start_datetime, rake_loading_end_actual, rake_loading_end_railway,
            door_closing_datetime, rake_haul_out_datetime, loading_start_officer,
            loading_completion_officer, remarks, rr_number, indent_number,
            submitted_by, submitted_at, $1
          FROM dispatch_records
          WHERE rake_serial_number = $2
          `,
          [rakeSerialNumber, parentTrainId]
        );

        // Re-fetch the newly created dispatch record
        dispatchRes = await pool.query(
          `SELECT * FROM dispatch_records WHERE rake_serial_number = $1`,
          [rakeSerialNumber]
        );
      }
    }

    // Get wagon data to calculate auto-populated fields
    // Filter by indent_number if provided, order by tower_number
    // ✅ FIX: Use rake_serial_number for wagon queries (already set above)

    let wagonQuery, wagonParams;
    if (dashboardIndentNumber && dashboardIndentNumber !== null && dashboardIndentNumber !== '') {
      wagonQuery = `
        SELECT 
          loading_start_time,
          loading_end_time
        FROM wagon_records 
        WHERE rake_serial_number = $1 AND indent_number=$2
        ORDER BY tower_number ASC
      `;
      wagonParams = [rakeSerialNumber, dashboardIndentNumber];
    } else {
      wagonQuery = `
        SELECT 
          loading_start_time,
          loading_end_time
        FROM wagon_records 
        WHERE rake_serial_number = $1
        ORDER BY tower_number ASC
      `;
      wagonParams = [rakeSerialNumber];
    }

    const wagonRes = await pool.query(wagonQuery, wagonParams);

    // Calculate first wagon's loading_start_time and last wagon's loading_end_time
    let firstLoadingStart = null;
    let lastLoadingEnd = null;

    if (wagonRes.rows.length > 0) {
      // First wagon's loading_start_time (ordered by tower_number)
      const firstWagon = wagonRes.rows.find(w => w.loading_start_time);
      if (firstWagon) {
        firstLoadingStart = firstWagon.loading_start_time;
      }

      // Last wagon's loading_end_time (ordered by tower_number)
      const reversedWagons = [...wagonRes.rows].reverse();
      const lastWagon = reversedWagons.find(w => w.loading_end_time);
      if (lastWagon) {
        lastLoadingEnd = lastWagon.loading_end_time;
      }
    }

    // Ensure siding is returned as empty string if null, matching indent_number behavior
    const siding = headerRes.rows[0]?.siding || "";
    // ✅ FIX: Get rake_serial_number from dashboard record (this is the correct one for this indent)
    // Use the indent-specific rake_serial_number if available, otherwise use the base one
    const indentRakeSerialNumber = headerRes.rows[0]?.rake_serial_number || rakeSerialNumber;

    // Get dispatch data
    let dispatchData = dispatchRes.rows[0] || null;

    // Auto-populate fields from calculated wagon data
    // Initialize dispatchData if null
    if (!dispatchData) {
      dispatchData = {};
    }

    // Always use calculated values from wagon data (ordered by tower_number)
    // These will be saved to the database when draft/submit is called
    if (firstLoadingStart) {
      dispatchData.rake_loading_start_datetime = firstLoadingStart;
    }
    if (lastLoadingEnd) {
      dispatchData.rake_loading_end_actual = lastLoadingEnd;
    }

    console.log(`Dispatch load for ${rakeSerialNumber} (URL: ${decodedTrainId}):`, {
      queryIndentNumber: indentNumber || 'none',
      dashboardIndentNumber: dashboardIndentNumber || 'none',
      hasSiding: !!siding,
      hasDispatch: !!dispatchData,
      dispatchKeys: dispatchData ? Object.keys(dispatchData) : [],
      dispatchIndentNumber: dispatchData?.indent_number || 'none',
      hasUserInputFields: dispatchData ? !!(
        dispatchData.vessel_name ||
        dispatchData.rake_type ||
        dispatchData.indent_wagon_count ||
        dispatchData.rake_placement_datetime ||
        dispatchData.rake_clearance_datetime ||
        dispatchData.rake_idle_time ||
        dispatchData.loading_start_officer ||
        dispatchData.loading_completion_officer ||
        dispatchData.remarks
      ) : false,
    });

    res.json({
      siding: siding,
      rake_serial_number: rakeSerialNumber, // ✅ FIX: Return actual rake_serial_number for this indent
      dispatch: dispatchData,
    });
  } catch (err) {
    console.error("DISPATCH LOAD ERROR:", err);
    res.status(500).json({ message: `Failed to load dispatch data: ${err.message}` });
  }
};

const saveDispatchDraft = async (req, res) => {
  const { trainId } = req.params;
  // trainId may be URL encoded (e.g., "2025-26%2F02%2F001"), decode it
  const decodedTrainId = trainId.replace(/_/g, "/");
  // ✅ FIX: Normalize indent_number (treat null, undefined, and empty string consistently)
  const rawIndentNumber = req.query.indent_number || (req.body && req.body.indent_number) || null;
  const indentNumber = rawIndentNumber && rawIndentNumber.trim() !== "" ? rawIndentNumber.trim() : null;
  const data = req.body || {}; // partial fields only

  try {
    // ✅ FIX: URL trainId is now always rake_serial_number
    // No need to resolve - use it directly
    const rakeSerialNumber = decodedTrainId;

    // ✅ FIX: Fetch siding from dashboard_records
    let siding = null;
    let headerQuery, headerParams;
    if (indentNumber) {
      headerQuery = "SELECT siding FROM dashboard_records WHERE rake_serial_number = $1 AND indent_number = $2 LIMIT 1";
      headerParams = [rakeSerialNumber, indentNumber];
    } else {
      headerQuery = "SELECT siding FROM dashboard_records WHERE rake_serial_number = $1 AND (indent_number IS NULL OR indent_number = '') LIMIT 1";
      headerParams = [rakeSerialNumber];
    }
    const headerRes = await pool.query(headerQuery, headerParams);
    if (headerRes.rows.length > 0) {
      siding = headerRes.rows[0].siding || null;
    }

    // 1️⃣ Check if dispatch record exists for this train (and optionally indent_number)
    // ✅ FIX: Use both train_id and rake_serial_number for queries
    let existsQuery, existsParams;
    if (indentNumber) {
      existsQuery = "SELECT 1 FROM dispatch_records WHERE rake_serial_number = $1 AND indent_number = $2";
      existsParams = [rakeSerialNumber, indentNumber];
    } else {
      existsQuery = "SELECT 1 FROM dispatch_records WHERE rake_serial_number = $1 AND (indent_number IS NULL OR indent_number = '')";
      existsParams = [rakeSerialNumber];
    }

    const existsRes = await pool.query(existsQuery, existsParams);

    /* =====================================================
       INSERT (FIRST TIME ONLY)
    ===================================================== */
    if (existsRes.rows.length === 0) {
      // ✅ FIX: Fetch loading times from wagon_records instead of using request body
      // Auto-populated fields should NEVER come from frontend - always fetch from wagon_records
      let wagonTimeQuery, wagonTimeParams;
      if (indentNumber) {
        wagonTimeQuery = `
            SELECT 
              loading_start_time,
              loading_end_time
            FROM wagon_records 
            WHERE rake_serial_number = $1 AND indent_number=$2
            ORDER BY tower_number ASC
          `;
        wagonTimeParams = [rakeSerialNumber, indentNumber];
      } else {
        wagonTimeQuery = `
            SELECT 
              loading_start_time,
              loading_end_time
            FROM wagon_records 
            WHERE rake_serial_number = $1
            ORDER BY tower_number ASC
          `;
        wagonTimeParams = [rakeSerialNumber];
      }

      const wagonTimeRes = await pool.query(wagonTimeQuery, wagonTimeParams);

      // Calculate times from wagon_records
      let calculatedRakeLoadingStart = null;
      let calculatedRakeLoadingEnd = null;

      if (wagonTimeRes.rows.length > 0) {
        // First wagon's loading_start_time (ordered by tower_number)
        const firstWagon = wagonTimeRes.rows.find(w => w.loading_start_time);
        if (firstWagon) {
          calculatedRakeLoadingStart = firstWagon.loading_start_time;
        }

        // Last wagon's loading_end_time (ordered by tower_number)
        const reversedWagons = [...wagonTimeRes.rows].reverse();
        const lastWagon = reversedWagons.find(w => w.loading_end_time);
        if (lastWagon) {
          calculatedRakeLoadingEnd = lastWagon.loading_end_time;
        }
      }

      await pool.query(
        `
          INSERT INTO dispatch_records (
            source,
            siding,
            indent_wagon_count,
            vessel_name,
            rake_type,
            status,
            rake_placement_datetime,
            rake_clearance_datetime,
            rake_idle_time,
            rake_loading_start_datetime,
            rake_loading_end_actual,
            rake_loading_end_railway,
            door_closing_datetime,
            rake_haul_out_datetime,
            loading_start_officer,
            loading_completion_officer,
            remarks,
            rr_number,
            indent_number,
            submitted_by,
            submitted_at,
            rake_serial_number
          ) VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            'DRAFT',
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17,
            $18,
            NULL,
            NULL,
            $19
          )
          `,
        [
          'KSLK', // source
          siding || null, // siding (from headerRes)
          data.indent_wagon_count || null,
          data.vessel_name || null,
          data.rake_type || null,
          data.rake_placement_datetime || null,
          data.rake_clearance_datetime || null,
          data.rake_idle_time || null,
          calculatedRakeLoadingStart, // ✅ FIX: Use calculated value from wagon_records
          calculatedRakeLoadingEnd, // ✅ FIX: Use calculated value from wagon_records
          data.rake_loading_end_railway || null,
          data.door_closing_datetime || null,
          data.rake_haul_out_datetime || null,
          data.loading_start_officer || null,
          data.loading_completion_officer || null,
          data.remarks || null,
          data.rr_number || null,
          indentNumber,
          rakeSerialNumber,
        ]
      );

      return res.json({ message: "Dispatch draft created successfully" });
    }

    /* =====================================================
       GET CURRENT VALUES FOR CHANGE TRACKING
    ===================================================== */
    // ✅ FIX: Get current dispatch record to track changes made by reviewer
    // Use rakeSerialNumber for all queries
    let currentRecordQuery, currentRecordParams;
    if (indentNumber) {
      currentRecordQuery = `
          SELECT indent_wagon_count, vessel_name, rake_type, rake_placement_datetime,
                 rake_clearance_datetime, rake_idle_time, loading_start_officer,
                 loading_completion_officer, remarks, rr_number, rake_loading_end_railway,
                 door_closing_datetime, rake_haul_out_datetime,
                 rake_loading_start_datetime, rake_loading_end_actual
          FROM dispatch_records
          WHERE rake_serial_number = $1 AND indent_number = $2
        `;
      currentRecordParams = [rakeSerialNumber, indentNumber];
    } else {
      currentRecordQuery = `
          SELECT indent_wagon_count, vessel_name, rake_type, rake_placement_datetime,
                 rake_clearance_datetime, rake_idle_time, loading_start_officer,
                 loading_completion_officer, remarks, rr_number, rake_loading_end_railway,
                 door_closing_datetime, rake_haul_out_datetime,
                 rake_loading_start_datetime, rake_loading_end_actual
          FROM dispatch_records
          WHERE rake_serial_number = $1 AND (indent_number IS NULL OR indent_number = '')
        `;
      currentRecordParams = [rakeSerialNumber];
    }

    const currentRecordRes = await pool.query(currentRecordQuery, currentRecordParams);
    const currentRecord = currentRecordRes.rows[0] || {};

    /* =====================================================
       DYNAMIC UPDATE (ONLY CHANGED FIELDS)
    ===================================================== */
    // ✅ FIX: Exclude auto-populated fields (rake_loading_start_datetime, rake_loading_end_actual)
    // These fields are calculated from wagon_records and should NEVER be updated by frontend saves
    const allowedFields = [
      "indent_wagon_count",
      "vessel_name",
      "rake_type",
      "rake_placement_datetime",
      "rake_clearance_datetime",
      "rake_idle_time",
      "loading_start_officer",
      "loading_completion_officer",
      "remarks",
      "rr_number",
      "rake_loading_end_railway",
      "door_closing_datetime",
      "rake_haul_out_datetime",
      // ✅ FIX: Removed rake_loading_start_datetime and rake_loading_end_actual - these are auto-populated
    ];

    // Field display names for activity timeline
    const fieldDisplayNames = {
      "indent_wagon_count": "Indent Wagon Count",
      "vessel_name": "Vessel Name",
      "rake_type": "Rake Type",
      "rake_placement_datetime": "Rake Placement Date & Time",
      "rake_clearance_datetime": "Rake Clearance Time",
      "rake_idle_time": "Rake Idle Time",
      "loading_start_officer": "Loading Start Officer",
      "loading_completion_officer": "Loading Completion Officer",
      "remarks": "Remarks",
      "rr_number": "RR Number",
      "rake_loading_end_railway": "Rake Loading End Date & Time Railway",
      "door_closing_datetime": "Door Closing Date & Time",
      "rake_haul_out_datetime": "Rake Haul Out Date & Time",
      // ✅ FIX: Removed auto-populated fields from display names
    };

    const updates = [];
    const values = [];
    let index = 1;
    const changes = [];

    for (const field of allowedFields) {
      if (field in data) {
        const oldValue = currentRecord[field];
        // ✅ FIX: Preserve empty strings as empty strings, only convert undefined/null to null
        // This ensures that if a field is explicitly set to empty string, it's preserved
        // Only convert to null if the value is actually null or undefined
        let newValue = data[field];
        if (newValue === undefined || newValue === null) {
          newValue = null;
        } else if (typeof newValue === 'string' && newValue.trim() === '') {
          // Empty string - keep as null in database (consistent with existing behavior)
          newValue = null;
        }

        // Track changes (compare as strings to handle null/empty)
        const oldValStr = oldValue != null ? String(oldValue).trim() : "";
        const newValStr = newValue != null ? String(newValue).trim() : "";

        if (oldValStr !== newValStr) {
          changes.push({
            field: fieldDisplayNames[field] || field,
            oldValue: oldValStr || "(empty)",
            newValue: newValStr || "(empty)",
          });
        }

        // ✅ FIX: Only update if there's an actual change
        if (oldValStr !== newValStr) {
          updates.push(`${field} = $${index}`);
          values.push(newValue);
          index++;
        }
      }
    }

    // Get reviewer username if present
    const reviewerUsername = req.headers["x-reviewer-username"];

    // Always keep status as DRAFT on save
    updates.push(`status = 'DRAFT'`);

    values.push(rakeSerialNumber);

    // Build WHERE clause with train_id/rake_serial_number and optionally indent_number
    // ✅ FIX: Use both train_id and rake_serial_number for queries
    let whereClause = `WHERE rake_serial_number = $${index}`;
    if (indentNumber) {
      index++;
      whereClause += ` AND indent_number = $${index}`;
      values.push(indentNumber);
    } else {
      whereClause += ` AND (indent_number IS NULL OR indent_number = '')`;
    }

    const updateQuery = `
        UPDATE dispatch_records
        SET ${updates.join(", ")}
        ${whereClause}
      `;

    await pool.query(updateQuery, values);

    // ✅ FIX: Always update auto-populated fields from wagon_records after user fields are updated
    // This ensures loading times are always current, regardless of what frontend sends
    let wagonTimeQuery, wagonTimeParams;
    if (indentNumber) {
      wagonTimeQuery = `
          SELECT 
            loading_start_time,
            loading_end_time
          FROM wagon_records 
          WHERE rake_serial_number = $1 AND indent_number=$2
          ORDER BY tower_number ASC
        `;
      wagonTimeParams = [rakeSerialNumber, indentNumber];
    } else {
      wagonTimeQuery = `
          SELECT 
            loading_start_time,
            loading_end_time
          FROM wagon_records 
          WHERE rake_serial_number = $1
          ORDER BY tower_number ASC
        `;
      wagonTimeParams = [rakeSerialNumber];
    }

    const wagonTimeRes = await pool.query(wagonTimeQuery, wagonTimeParams);

    // Calculate times from wagon_records
    let calculatedRakeLoadingStart = null;
    let calculatedRakeLoadingEnd = null;

    if (wagonTimeRes.rows.length > 0) {
      // First wagon's loading_start_time (ordered by tower_number)
      const firstWagon = wagonTimeRes.rows.find(w => w.loading_start_time);
      if (firstWagon) {
        calculatedRakeLoadingStart = firstWagon.loading_start_time;
      }

      // Last wagon's loading_end_time (ordered by tower_number)
      const reversedWagons = [...wagonTimeRes.rows].reverse();
      const lastWagon = reversedWagons.find(w => w.loading_end_time);
      if (lastWagon) {
        calculatedRakeLoadingEnd = lastWagon.loading_end_time;
      }
    }

    // Update auto-populated fields from wagon_records
    if (indentNumber) {
      await pool.query(
        `UPDATE dispatch_records 
           SET rake_loading_start_datetime = $1, rake_loading_end_actual = $2
           WHERE rake_serial_number = $3 AND indent_number = $4`,
        [calculatedRakeLoadingStart, calculatedRakeLoadingEnd, rakeSerialNumber, indentNumber]
      );
    } else {
      await pool.query(
        `UPDATE dispatch_records 
           SET rake_loading_start_datetime = $1, rake_loading_end_actual = $2
           WHERE rake_serial_number = $3 AND (indent_number IS NULL OR indent_number = '')`,
        [calculatedRakeLoadingStart, calculatedRakeLoadingEnd, rakeSerialNumber]
      );
    }

    // ✅ FIX: Add activity timeline entry for reviewer changes (only if there are actual changes)
    if (reviewerUsername && changes.length > 0) {
      // Format changes for activity timeline
      const changeDescriptions = changes.map(c =>
        `${c.field}: "${c.oldValue}" → "${c.newValue}"`
      ).join("; ");

      // ✅ FIX: Use rakeSerialNumber (decoded, with slashes) not trainId (URL param with underscores)
      // exportAllReviewerChanges queries by rake_serial_number with slashes, so they must match
      await addActivityTimelineEntry(
        rakeSerialNumber,
        indentNumber || null,
        'REVIEWER_EDITED',
        reviewerUsername,
        `Reviewer made changes: ${changeDescriptions}`
      );
    }
    // ✅ FIX: Don't log if there are no changes (user only wants edited fields watched)

    res.json({ message: "Dispatch draft updated successfully" });
  } catch (err) {
    console.error("DISPATCH DRAFT ERROR:", err);
    res.status(500).json({ message: "Failed to save dispatch draft" });
  }
};

const submitDispatch = async (req, res) => {
  const { trainId } = req.params;
  // trainId may be URL encoded (e.g., "2025-26%2F02%2F001"), decode it
  const decodedTrainId = trainId.replace(/_/g, "/");
  const indentNumber = req.query.indent_number || (req.body && req.body.indent_number) || null; // Support Case 2
  const { rr_number, rake_loading_end_railway, door_closing_datetime, rake_haul_out_datetime } = req.body || {}; // ✅ FIX: Only get user input fields, NOT auto-populated fields
  const username = req.body.username || req.headers["x-username"] || null; // Get username from body or header
  const role = req.headers["x-user-role"];

  try {
    // ✅ FIX: First, resolve the actual train_id from train_session or dashboard_records
    // The URL trainId might be either train_id or rake_serial_number
    // ✅ FIX: URL trainId is now always rake_serial_number
    const rakeSerialNumber = decodedTrainId;
    // Use user-provided rr_number if available; keep it NULL when empty (no auto-generate)
    const rrNumber = rr_number && rr_number.trim() !== ""
      ? rr_number.trim()
      : null;

    // Build update fields dynamically
    const updateFields = ["status='SUBMITTED'", "rr_number=$1", "submitted_by=$2", "submitted_at=NOW()"];
    const updateValues = [rrNumber, username];
    let paramIndex = 3;

    // Add rake_loading_end_railway if provided
    if (rake_loading_end_railway !== undefined && rake_loading_end_railway !== null) {
      updateFields.push(`rake_loading_end_railway=$${paramIndex}`);
      updateValues.push(rake_loading_end_railway || null);
      paramIndex++;
    }

    // Add door_closing_datetime if provided
    if (door_closing_datetime !== undefined && door_closing_datetime !== null) {
      updateFields.push(`door_closing_datetime=$${paramIndex}`);
      updateValues.push(door_closing_datetime || null);
      paramIndex++;
    }

    // Add rake_haul_out_datetime if provided
    if (rake_haul_out_datetime !== undefined && rake_haul_out_datetime !== null) {
      updateFields.push(`rake_haul_out_datetime=$${paramIndex}`);
      updateValues.push(rake_haul_out_datetime || null);
      paramIndex++;
    }

    // ✅ FIX: DO NOT add auto-populated fields (rake_loading_start_datetime, rake_loading_end_actual) from request body
    // These will be fetched from wagon_records and updated separately

    // Update dispatch_records
    // ✅ FIX: Use both train_id and rake_serial_number for queries (matching sample pattern but with our dual-column support)
    let dispatchUpdateQuery, dispatchParams;
    if (indentNumber) {
      updateValues.push(rakeSerialNumber);
      updateValues.push(indentNumber);
      dispatchUpdateQuery = `
          UPDATE dispatch_records SET
            ${updateFields.join(", ")}
          WHERE rake_serial_number=$${paramIndex} AND indent_number=$${paramIndex + 1}
        `;
      dispatchParams = updateValues;
    } else {
      updateValues.push(rakeSerialNumber);
      dispatchUpdateQuery = `
          UPDATE dispatch_records SET
            ${updateFields.join(", ")}
          WHERE rake_serial_number=$${paramIndex} AND (indent_number IS NULL OR indent_number = '')
        `;
      dispatchParams = updateValues;
    }

    await pool.query(dispatchUpdateQuery, dispatchParams);

    // ✅ FIX: Always fetch latest loading times from wagon_records to ensure they're preserved
    // This ensures we always have the latest times from wagon_records, even if request doesn't include them
    // ✅ FIX: Use both train_id and rake_serial_number for queries
    let wagonTimeQuery, wagonTimeParams;
    if (indentNumber) {
      wagonTimeQuery = `
          SELECT 
            loading_start_time,
            loading_end_time
          FROM wagon_records 
          WHERE rake_serial_number = $1 AND indent_number=$2
          ORDER BY tower_number ASC
        `;
      wagonTimeParams = [rakeSerialNumber, indentNumber];
    } else {
      wagonTimeQuery = `
          SELECT 
            loading_start_time,
            loading_end_time
          FROM wagon_records 
          WHERE rake_serial_number = $1
          ORDER BY tower_number ASC
        `;
      wagonTimeParams = [rakeSerialNumber];
    }

    const wagonTimeRes = await pool.query(wagonTimeQuery, wagonTimeParams);

    // ✅ FIX: Calculate times from wagon_records (always use these, never from request)
    let calculatedRakeLoadingStart = null;
    let calculatedRakeLoadingEnd = null;

    if (wagonTimeRes.rows.length > 0) {
      // First wagon's loading_start_time (ordered by tower_number)
      const firstWagon = wagonTimeRes.rows.find(w => w.loading_start_time);
      if (firstWagon) {
        calculatedRakeLoadingStart = firstWagon.loading_start_time;
      }

      // Last wagon's loading_end_time (ordered by tower_number)
      const reversedWagons = [...wagonTimeRes.rows].reverse();
      const lastWagon = reversedWagons.find(w => w.loading_end_time);
      if (lastWagon) {
        calculatedRakeLoadingEnd = lastWagon.loading_end_time;
      }
    }

    // ✅ FIX: Update dispatch_records with calculated times from wagon_records
    if (indentNumber) {
      await pool.query(
        `UPDATE dispatch_records 
           SET rake_loading_start_datetime = $1, rake_loading_end_actual = $2
           WHERE rake_serial_number = $3 AND indent_number = $4`,
        [calculatedRakeLoadingStart, calculatedRakeLoadingEnd, rakeSerialNumber, indentNumber]
      );
    } else {
      await pool.query(
        `UPDATE dispatch_records 
           SET rake_loading_start_datetime = $1, rake_loading_end_actual = $2
           WHERE rake_serial_number = $3 AND (indent_number IS NULL OR indent_number = '')`,
        [calculatedRakeLoadingStart, calculatedRakeLoadingEnd, rakeSerialNumber]
      );
    }

    // Log for debugging
    console.log(`[DISPATCH SUBMIT] Loading times for ${rakeSerialNumber} (indent: ${indentNumber || 'none'}):`, {
      fromWagonRecords: {
        start: calculatedRakeLoadingStart,
        end: calculatedRakeLoadingEnd,
        wagonCount: wagonTimeRes.rows.length
      }
    });

    // Update dashboard_records based on role
    // Note: rake_loading_start_datetime and rake_loading_end_actual are calculated on-the-fly from wagon_records
    // in the dashboard query, so we don't need to store them in dashboard_records
    // ✅ FIX: Use rakeSerialNumber and handle both base and sequential rake_serial_number
    // ✅ FIX: Preserve assigned_reviewer when updating status (UPDATE only sets status, so assigned_reviewer is preserved automatically)
    let dashboardUpdateQuery, dashboardParams, activityType, activityNotes;
    if (role === "SUPER_ADMIN") {
      // SUPER_ADMIN: final approval, mark directly as APPROVED (Rake Loading Completed)
      if (indentNumber) {
        // ✅ FIX: Search for base rake_serial_number OR sequential rake_serial_number
        dashboardUpdateQuery = "UPDATE dashboard_records SET status='APPROVED' WHERE (rake_serial_number = $1 OR rake_serial_number LIKE $2) AND indent_number=$3";
        dashboardParams = [rakeSerialNumber, `${rakeSerialNumber}-%`, indentNumber];
      } else {
        // ✅ FIX: Search for base rake_serial_number OR sequential rake_serial_number
        dashboardUpdateQuery = "UPDATE dashboard_records SET status='APPROVED' WHERE (rake_serial_number = $1 OR rake_serial_number LIKE $2)";
        dashboardParams = [rakeSerialNumber, `${rakeSerialNumber}-%`];
      }
      activityType = 'APPROVED';
      activityNotes = 'Entry has been approved by SUPER_ADMIN';
    } else {
      // ADMIN: submit for reviewer approval
      // ✅ FIX: Preserve assigned_reviewer (UPDATE only sets status, so assigned_reviewer is preserved automatically)
      if (indentNumber) {
        // ✅ FIX: Search for base rake_serial_number OR sequential rake_serial_number
        dashboardUpdateQuery = "UPDATE dashboard_records SET status='PENDING_APPROVAL' WHERE (rake_serial_number = $1 OR rake_serial_number LIKE $2) AND indent_number=$3";
        dashboardParams = [rakeSerialNumber, `${rakeSerialNumber}-%`, indentNumber];
      } else {
        // ✅ FIX: Search for base rake_serial_number OR sequential rake_serial_number
        dashboardUpdateQuery = "UPDATE dashboard_records SET status='PENDING_APPROVAL' WHERE (rake_serial_number = $1 OR rake_serial_number LIKE $2)";
        dashboardParams = [rakeSerialNumber, `${rakeSerialNumber}-%`];
      }
      activityType = 'SUBMITTED';
      activityNotes = 'Record submitted for review';
    }

    await pool.query(dashboardUpdateQuery, dashboardParams);

    // ─── Notify reviewers when SUPER_ADMIN re-submits after revoking (marks as APPROVED/completed) ───
    if (role === "SUPER_ADMIN") {
      (async () => {
        try {
          const notifyUsersRes = await pool.query(
            `SELECT u.email, u.username
             FROM users u
             WHERE u.role = 'REVIEWER'
               AND u.is_active = true
               AND u.email IS NOT NULL
               AND u.email <> ''`
          );

          if (notifyUsersRes.rows.length === 0) {
            console.log(`[SUPER-SUBMIT-NOTIFY] No active reviewers found to notify`);
            return;
          }

          const validRecipients = notifyUsersRes.rows.filter(u => isValidEmail(u.email));
          if (validRecipients.length === 0) {
            console.log(`[SUPER-SUBMIT-NOTIFY] No valid reviewer email addresses found`);
            return;
          }

          // Resolve indent_number from dashboard_records if not in request
          let resolvedIndentNumber = indentNumber;
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
          const submittedByLabel = username || "Super Admin";
          const subject = `Task Marked as Completed – Rake ${rakeSerialNumber}`;

          const html = `
            <div style="font-family:Arial,sans-serif;max-width:700px;">
              <h2 style="color:#27ae60;">✅ Task Marked as Completed by Super Admin</h2>
              <p>Super Admin <strong>${submittedByLabel}</strong> has submitted and marked a rake entry as <strong>Completed (Approved)</strong>.</p>
              <table style="border-collapse:collapse;width:100%;margin:16px 0;">
                <thead>
                  <tr style="background:#0B3A6E;color:#fff;">
                    <th style="padding:8px 12px;text-align:left;">Rake Serial</th>
                    <th style="padding:8px 12px;text-align:left;">Indent</th>
                    <th style="padding:8px 12px;text-align:left;">Submitted By</th>
                    <th style="padding:8px 12px;text-align:left;">Completed At</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${rakeSerialNumber}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${resolvedIndentNumber || "-"}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${submittedByLabel} (Super Admin)</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${new Date().toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
              <p style="color:#555;font-size:13px;">
                This entry has been marked as <strong>Approved / Completed</strong> by Super Admin.<br/>
                No further action is required from your side for this entry.
              </p>
            </div>
          `;

          await sendAlertEmail(recipientEmails, subject, html);
          console.log(`[SUPER-SUBMIT-NOTIFY] Completion email sent to ${recipientEmails.join(", ")} for rake ${rakeSerialNumber} by Super Admin ${submittedByLabel}`);
        } catch (emailErr) {
          console.error(`[SUPER-SUBMIT-NOTIFY] Failed to send super admin completion email for rake ${rakeSerialNumber}:`, emailErr.message);
        }
      })();
    }

    // ─── Notify reviewers & super admins when ADMIN submits for review ───
    if (role !== "SUPER_ADMIN") {
      (async () => {
        try {
          // Resolve indent number from dashboard_records if not in request
          let resolvedIndentNumber = indentNumber;
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

          // Fetch all active reviewers and super admins with valid emails
          const notifyUsersRes = await pool.query(
            `SELECT u.email, u.username, u.role
            FROM users u
            WHERE u.role IN ('REVIEWER', 'SUPER_ADMIN')
              AND u.is_active = true
              AND u.email IS NOT NULL
              AND u.email <> ''`
          );

          if (notifyUsersRes.rows.length === 0) {
            console.log(`[SUBMIT-NOTIFY] No active reviewers/super admins found to notify`);
            return;
          }

          const validRecipients = notifyUsersRes.rows.filter(u => isValidEmail(u.email));
          if (validRecipients.length === 0) {
            console.log(`[SUBMIT-NOTIFY] No valid email addresses found for reviewers/super admins`);
            return;
          }

          const recipientEmails = validRecipients.map(u => u.email);

          const subject = `Loading Completed – Review Required – Rake ${rakeSerialNumber}`;
          const submittedByLabel = username || "Admin";

          const html = `
            <div style="font-family:Arial,sans-serif;max-width:700px;">
              <h2 style="color:#0B3A6E;">📋 New Entry Pending Review</h2>
              <p>A rake entry has been submitted for your review.</p>
              <table style="border-collapse:collapse;width:100%;margin:16px 0;">
                <thead>
                  <tr style="background:#0B3A6E;color:#fff;">
                    <th style="padding:8px 12px;text-align:left;">Rake Serial</th>
                    <th style="padding:8px 12px;text-align:left;">Indent</th>
                    <th style="padding:8px 12px;text-align:left;">Submitted By</th>
                    <th style="padding:8px 12px;text-align:left;">Submitted At</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${rakeSerialNumber}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${resolvedIndentNumber || "-"}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${submittedByLabel}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${new Date().toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
              <p style="color:#555;font-size:13px;">
                Please log in to the system to review and approve or reject this entry.
              </p>
            </div>
          `;

          await sendAlertEmail(recipientEmails, subject, html);
          console.log(`[SUBMIT-NOTIFY] Review notification sent to ${recipientEmails.join(", ")} for rake ${rakeSerialNumber}, indent: ${resolvedIndentNumber || "none"}`);
        } catch (emailErr) {
          console.error(`[SUBMIT-NOTIFY] Failed to send review notification for rake ${rakeSerialNumber}:`, emailErr.message);
        }
      })();
    }

    // ✅ FIX: Ensure wagon times are preserved - verify they exist after submit
    // The dashboard calculates times from wagon_records, so we need to ensure wagon times are not cleared
    console.log(`[DISPATCH SUBMIT] Calculated times for ${rakeSerialNumber} (indent: ${indentNumber || 'none'}):`, {
      rake_loading_start_datetime: calculatedRakeLoadingStart,
      rake_loading_end_actual: calculatedRakeLoadingEnd,
      source: "wagon_records" // ✅ FIX: Always from wagon_records, never from request
    });

    // Add activity timeline entry for submission/approval
    // ✅ FIX: Use rakeSerialNumber instead of trainId
    if (username) {
      await addActivityTimelineEntry(
        rakeSerialNumber,
        indentNumber || null,
        activityType,
        username,
        activityNotes
      );
    }

    res.json({ message: "Submitted successfully" });
  } catch (err) {
    console.error("DISPATCH SUBMIT ERROR:", err);
    res.status(500).json({ message: "Submit failed" });
  }
};

const getActivityTimeline = async (req, res) => {
  const { trainId } = req.params;
  const indentNumber = req.query.indent_number || null;

  try {
    // ✅ FIX: URL trainId is now always rake_serial_number
    // No need to resolve - use it directly
    const decodedTrainId = trainId.replace(/_/g, "/");
    const rakeSerialNumber = decodedTrainId;

    // Get activity timeline from activity_timeline table
    // ✅ FIX: Use both train_id and rake_serial_number for queries
    let query, params;
    if (indentNumber) {
      query = `
        SELECT 
          id,
          activity_type,
          username,
          activity_time,
          notes
        FROM activity_timeline
        WHERE rake_serial_number = $1 AND (indent_number = $2 OR indent_number IS NULL)
        ORDER BY activity_time DESC
        LIMIT 50
      `;
      params = [rakeSerialNumber, indentNumber];
    } else {
      query = `
        SELECT 
          id,
          activity_type,
          username,
          activity_time,
          notes
        FROM activity_timeline
        WHERE rake_serial_number = $1 AND (indent_number IS NULL OR indent_number = '')
        ORDER BY activity_time DESC
        LIMIT 50
      `;
      params = [rakeSerialNumber];
    }

    const result = await pool.query(query, params);

    // Format activity timeline entries and group by date
    const activitiesByDate = {};

    result.rows.forEach(row => {
      const timestamp = row.activity_time;
      if (!timestamp) return;

      const date = new Date(timestamp);

      // Format date as "Today", "Yesterday", or actual date
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const activityDate = new Date(date);
      activityDate.setHours(0, 0, 0, 0);

      let dateLabel = "";
      if (activityDate.getTime() === today.getTime()) {
        dateLabel = "Today";
      } else {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (activityDate.getTime() === yesterday.getTime()) {
          dateLabel = "Yesterday";
        } else {
          dateLabel = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        }
      }

      // Format time
      const timeLabel = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      // Generate activity text based on activity type
      let activityText = "";
      switch (row.activity_type) {
        case 'SUBMITTED':
          activityText = `Entry has been submitted by ${row.username} at ${timeLabel}.`;
          break;
        case 'REVOKED':
          activityText = `Entry has been revoked by ${row.username} at ${timeLabel}.`;
          break;
        case 'REVOKED_BY_SUPER_ADMIN':
          activityText = `Entry has been revoked by SUPER_ADMIN ${row.username} at ${timeLabel}.`;
          break;
        case 'APPROVED':
          activityText = `Entry has been approved by ${row.username} at ${timeLabel}.`;
          break;
        case 'REJECTED':
          activityText = `Entry has been rejected by ${row.username} at ${timeLabel}.`;
          break;
        case 'CANCELLED':
          activityText = `Indent has been cancelled by ${row.username} at ${timeLabel}.`;
          break;
        case 'REVIEWER_SUBMITTED':
          // If we have custom notes (e.g. "Dispatch reviewed and approved by reviewer"),
          // append reviewer name and time to keep a consistent format.
          if (row.notes) {
            activityText = `${row.notes} by ${row.username} at ${timeLabel}.`;
          } else {
            activityText = `Dispatch has been submitted by ${row.username} at ${timeLabel}.`;
          }
          break;
        case 'REVIEWER_EDITED':
          activityText = row.notes || `Dispatch edited by ${row.username} at ${timeLabel}.`;
          break;
        case 'REVIEWER_SAVED':
          activityText = row.notes || `Dispatch saved by ${row.username} at ${timeLabel} (no changes).`;
          break;
        case 'REVIEWER_TRAIN_EDITED':
          // Parse notes to extract change details if present
          let changeDetails = null;
          let displayNotes = row.notes;
          if (row.notes && row.notes.includes('|||CHANGE_DETAILS:')) {
            const parts = row.notes.split('|||CHANGE_DETAILS:');
            displayNotes = parts[0]; // Human-readable notes
            try {
              changeDetails = JSON.parse(parts[1]);
            } catch (e) {
              console.error('Error parsing change details:', e);
            }
          }
          activityText = displayNotes || `Train data edited by ${row.username} at ${timeLabel}.`;
          break;
        case 'REVIEWER_TRAIN_SAVED':
          activityText = row.notes || `Train data saved by ${row.username} at ${timeLabel} (no changes).`;
          break;
        default:
          activityText = row.notes || `${row.activity_type} by ${row.username} at ${timeLabel}.`;
      }

      // Group by date
      if (!activitiesByDate[dateLabel]) {
        activitiesByDate[dateLabel] = [];
      }

      // Extract change details for REVIEWER_TRAIN_EDITED
      let changeDetails = null;
      if (row.activity_type === 'REVIEWER_TRAIN_EDITED' && row.notes && row.notes.includes('|||CHANGE_DETAILS:')) {
        const parts = row.notes.split('|||CHANGE_DETAILS:');
        try {
          changeDetails = JSON.parse(parts[1]);
        } catch (e) {
          console.error('Error parsing change details:', e);
        }
      }

      activitiesByDate[dateLabel].push({
        id: row.id, // Include activity ID for export
        time: timeLabel,
        text: activityText,
        timestamp: timestamp,
        username: row.username,
        activity_type: row.activity_type,
        notes: row.notes,
        changeDetails: changeDetails, // Include parsed change details
      });
    });

    // Convert to array format: [{ date, activities: [...] }]
    const groupedActivities = Object.keys(activitiesByDate).map(dateLabel => ({
      date: dateLabel,
      activities: activitiesByDate[dateLabel]
    }));

    res.json({ activities: groupedActivities });
  } catch (err) {
    console.error("ACTIVITY TIMELINE ERROR:", err);
    res.status(500).json({ message: "Failed to load activity timeline" });
  }
};

const exportChanges = async (req, res) => {
  const { trainId, activityId } = req.params;
  const decodedTrainId = trainId.replace(/_/g, "/");

  // Helper to format activity_time for Excel
  const formatTime = (dt) => {
    if (!dt) return '';
    const d = new Date(dt);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  try {
    // Get ALL REVIEWER_TRAIN_EDITED and REVIEWER_EDITED activities for this train
    // This combines all reviewer edits (wagon details + rake details) into a single Excel sheet with Page column
    const activityRes = await pool.query(
      `SELECT activity_type, notes, activity_time, username
       FROM activity_timeline
       WHERE rake_serial_number = $1 
         AND (activity_type = 'REVIEWER_TRAIN_EDITED' OR activity_type = 'REVIEWER_EDITED')
       ORDER BY activity_time ASC`,
      [decodedTrainId]
    );

    if (activityRes.rows.length === 0) {
      return res.status(404).json({ message: "No reviewer changes found for this train" });
    }

    // Prepare Excel data: Single sheet with Page column
    const excelData = [];

    // Add header row (includes Time column)
    excelData.push(['Page', 'Field Name', 'Previous value', 'Modified value', 'Time']);

    // Track unique rake-level changes to avoid duplicates
    // Key format: "fieldName|oldValue|newValue"
    const uniqueRakeChanges = new Map();
    const wagonChanges = [];

    // Process all REVIEWER_TRAIN_EDITED and REVIEWER_EDITED activities and combine their changes
    let hasChanges = false;
    for (const activity of activityRes.rows) {
      const activityTime = formatTime(activity.activity_time);

      if (activity.activity_type === 'REVIEWER_EDITED') {
        // REVIEWER_EDITED contains rake/dispatch changes in notes format: "Reviewer made changes: Field: old → new"
        if (activity.notes && activity.notes.startsWith('Reviewer made changes:')) {
          const changesText = activity.notes.replace('Reviewer made changes: ', '');
          const changes = changesText.split('; ').filter(c => c.trim());

          changes.forEach(changeStr => {
            // Parse format: "Field: "old" → "new""
            const match = changeStr.match(/^(.+?):\s*"(.+?)"\s*→\s*"(.+?)"$/);
            if (match) {
              const [, field, oldValue, newValue] = match;
              const fieldName = field.trim();
              const oldVal = oldValue === '(empty)' ? '(empty)' : oldValue;
              const newVal = newValue === '(empty)' ? '(empty)' : newValue;
              const key = `${fieldName}|${oldVal}|${newVal}`;

              // Only add if not already present
              if (!uniqueRakeChanges.has(key)) {
                uniqueRakeChanges.set(key, {
                  field: fieldName,
                  oldValue: oldVal,
                  newValue: newVal,
                  time: activityTime
                });
                hasChanges = true;
              }
            }
          });
        }
      } else if (activity.activity_type === 'REVIEWER_TRAIN_EDITED') {
        // Parse change details from notes
        if (activity.notes && activity.notes.includes('|||CHANGE_DETAILS:')) {
          const parts = activity.notes.split('|||CHANGE_DETAILS:');
          try {
            const changeDetails = JSON.parse(parts[1]);

            // Collect header changes (Rake page) - only add unique ones
            if (changeDetails.headerChanges && changeDetails.headerChanges.length > 0) {
              changeDetails.headerChanges.forEach(change => {
                const fieldLabel = change.field || 'Field';
                const oldVal = change.oldValue || '(empty)';
                const newVal = change.newValue || '(empty)';
                const key = `${fieldLabel}|${oldVal}|${newVal}`;

                // Only add if not already present
                if (!uniqueRakeChanges.has(key)) {
                  uniqueRakeChanges.set(key, {
                    field: fieldLabel,
                    oldValue: oldVal,
                    newValue: newVal,
                    time: activityTime
                  });
                  hasChanges = true;
                }
              });
            }

            // Collect wagon changes (Wagon page) - add all of them
            if (changeDetails.wagonChanges && changeDetails.wagonChanges.length > 0) {
              changeDetails.wagonChanges.forEach(change => {
                const wagonLabel = change.wagon || 'Wagon';
                const fieldLabel = change.field || 'Field';
                wagonChanges.push({
                  field: `${wagonLabel}: ${fieldLabel}`,
                  oldValue: change.oldValue || '(empty)',
                  newValue: change.newValue || '(empty)',
                  time: activityTime
                });
                hasChanges = true;
              });
            }
          } catch (e) {
            console.error('Error parsing change details:', e);
            // Continue processing other activities even if one fails
          }
        }
      }
    }

    // Add unique rake changes to Excel data
    uniqueRakeChanges.forEach(change => {
      excelData.push([
        'Rake',
        change.field,
        change.oldValue,
        change.newValue,
        change.time
      ]);
    });

    // Add all wagon changes to Excel data
    wagonChanges.forEach(change => {
      excelData.push([
        'Wagon',
        change.field,
        change.oldValue,
        change.newValue,
        change.time
      ]);
    });

    // If no changes were found, return error
    if (!hasChanges) {
      return res.status(400).json({ message: "No change details found in reviewer activities" });
    }

    // Create workbook with single sheet
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reviewer Changes');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 }, // Page
      { wch: 45 }, // Field Name
      { wch: 30 }, // Previous value
      { wch: 30 }, // Modified value
      { wch: 22 }  // Time
    ];

    // Generate filename with rake_serial_number
    const filename = `${decodedTrainId}_changes.xlsx`;

    // Generate buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send Excel file
    res.send(excelBuffer);
  } catch (err) {
    console.error("EXPORT CHANGES ERROR:", err);
    res.status(500).json({ message: "Failed to export changes" });
  }
};

const exportAllReviewerChanges = async (req, res) => {
  const { trainId } = req.params;
  const decodedTrainId = trainId.replace(/_/g, "/");

  // Helper to format activity_time for Excel
  const formatTime = (dt) => {
    if (!dt) return '';
    const d = new Date(dt);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  try {
    // Get ALL REVIEWER_TRAIN_EDITED and REVIEWER_EDITED activities for this train
    // This combines all reviewer edits (wagon details + rake details) into a single Excel sheet with Page column
    const activityRes = await pool.query(
      `SELECT activity_type, notes, activity_time, username
       FROM activity_timeline
       WHERE rake_serial_number = $1 
         AND (activity_type = 'REVIEWER_TRAIN_EDITED' OR activity_type = 'REVIEWER_EDITED')
       ORDER BY activity_time ASC`,
      [decodedTrainId]
    );

    if (activityRes.rows.length === 0) {
      return res.status(404).json({ message: "No reviewer changes found for this train" });
    }

    // Prepare Excel data: Single sheet with Page column
    const excelData = [];

    // Add header row (includes Time column)
    excelData.push(['Page', 'Field Name', 'Previous value', 'Modified value', 'Time']);

    // Track unique rake-level changes to avoid duplicates
    // Key format: "fieldName|oldValue|newValue"
    const uniqueRakeChanges = new Map();
    const wagonChanges = [];

    // Process all REVIEWER_TRAIN_EDITED and REVIEWER_EDITED activities and combine their changes
    let hasChanges = false;
    for (const activity of activityRes.rows) {
      const activityTime = formatTime(activity.activity_time);

      if (activity.activity_type === 'REVIEWER_EDITED') {
        // REVIEWER_EDITED contains rake/dispatch changes in notes format: "Reviewer made changes: Field: old → new"
        if (activity.notes && activity.notes.startsWith('Reviewer made changes:')) {
          const changesText = activity.notes.replace('Reviewer made changes: ', '');
          const changes = changesText.split('; ').filter(c => c.trim());

          changes.forEach(changeStr => {
            // Parse format: "Field: "old" → "new""
            const match = changeStr.match(/^(.+?):\s*"(.+?)"\s*→\s*"(.+?)"$/);
            if (match) {
              const [, field, oldValue, newValue] = match;
              const fieldName = field.trim();
              const oldVal = oldValue === '(empty)' ? '(empty)' : oldValue;
              const newVal = newValue === '(empty)' ? '(empty)' : newValue;
              const key = `${fieldName}|${oldVal}|${newVal}`;

              // Only add if not already present
              if (!uniqueRakeChanges.has(key)) {
                uniqueRakeChanges.set(key, {
                  field: fieldName,
                  oldValue: oldVal,
                  newValue: newVal,
                  time: activityTime
                });
                hasChanges = true;
              }
            }
          });
        }
      } else if (activity.activity_type === 'REVIEWER_TRAIN_EDITED') {
        // Parse change details from notes
        if (activity.notes && activity.notes.includes('|||CHANGE_DETAILS:')) {
          const parts = activity.notes.split('|||CHANGE_DETAILS:');
          try {
            const changeDetails = JSON.parse(parts[1]);

            // Collect header changes (Rake page) - only add unique ones
            if (changeDetails.headerChanges && changeDetails.headerChanges.length > 0) {
              changeDetails.headerChanges.forEach(change => {
                const fieldLabel = change.field || 'Field';
                const oldVal = change.oldValue || '(empty)';
                const newVal = change.newValue || '(empty)';
                const key = `${fieldLabel}|${oldVal}|${newVal}`;

                // Only add if not already present
                if (!uniqueRakeChanges.has(key)) {
                  uniqueRakeChanges.set(key, {
                    field: fieldLabel,
                    oldValue: oldVal,
                    newValue: newVal,
                    time: activityTime
                  });
                  hasChanges = true;
                }
              });
            }

            // Collect wagon changes (Wagon page) - add all of them
            if (changeDetails.wagonChanges && changeDetails.wagonChanges.length > 0) {
              changeDetails.wagonChanges.forEach(change => {
                const wagonLabel = change.wagon || 'Wagon';
                const fieldLabel = change.field || 'Field';
                wagonChanges.push({
                  field: `${wagonLabel}: ${fieldLabel}`,
                  oldValue: change.oldValue || '(empty)',
                  newValue: change.newValue || '(empty)',
                  time: activityTime
                });
                hasChanges = true;
              });
            }
          } catch (e) {
            console.error('Error parsing change details:', e);
            // Continue processing other activities even if one fails
          }
        }
      }
    }

    // Add unique rake changes to Excel data
    uniqueRakeChanges.forEach(change => {
      excelData.push([
        'Rake',
        change.field,
        change.oldValue,
        change.newValue,
        change.time
      ]);
    });

    // Add all wagon changes to Excel data
    wagonChanges.forEach(change => {
      excelData.push([
        'Wagon',
        change.field,
        change.oldValue,
        change.newValue,
        change.time
      ]);
    });

    // If no changes were found, return error
    if (!hasChanges) {
      return res.status(400).json({ message: "No change details found in reviewer activities" });
    }

    // Create workbook with single sheet
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reviewer Changes');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 }, // Page
      { wch: 45 }, // Field Name
      { wch: 30 }, // Previous value
      { wch: 30 }, // Modified value
      { wch: 22 }  // Time
    ];

    // Generate filename with rake_serial_number
    const filename = `${decodedTrainId}_changes.xlsx`;

    // Generate buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send Excel file
    res.send(excelBuffer);
  } catch (err) {
    console.error("EXPORT ALL REVIEWER CHANGES ERROR:", err);
    res.status(500).json({ message: "Failed to export reviewer changes" });
  }
};

const revokeTrain = async (req, res) => {
  const { trainId } = req.params;
  const decodedTrainId = trainId.replace(/_/g, "/");
  const { indent_number, username } = req.body;
  const role = req.headers["x-user-role"];

  try {
    // Check if train exists and is APPROVED
    let checkQuery, checkParams;
    if (indent_number) {
      checkQuery = `
          SELECT status, assigned_reviewer 
          FROM dashboard_records 
          WHERE rake_serial_number = $1 AND indent_number = $2
        `;
      checkParams = [decodedTrainId, indent_number];
    } else {
      checkQuery = `
          SELECT status, assigned_reviewer 
          FROM dashboard_records 
          WHERE rake_serial_number = $1
        `;
      checkParams = [decodedTrainId];
    }

    const checkRes = await pool.query(checkQuery, checkParams);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ message: "Train not found" });
    }

    const row = checkRes.rows[0];
    const status = row.status;
    const assignedReviewer = row.assigned_reviewer;

    if (role === "SUPER_ADMIN") {
      // SUPER_ADMIN can revoke only APPROVED trains
      if (status !== "APPROVED") {
        return res.status(400).json({
          message: "Only APPROVED trains can be revoked by SUPER_ADMIN",
        });
      }
    } else if (role === "ADMIN") {
      // ADMIN can revoke only PENDING_APPROVAL submissions that are not yet assigned
      if (status !== "PENDING_APPROVAL") {
        return res.status(400).json({
          message: "Only PENDING_APPROVAL submissions can be revoked by ADMIN",
        });
      }

      if (assignedReviewer && assignedReviewer !== "") {
        return res.status(400).json({
          message:
            "This task has already been assigned to a reviewer and can no longer be revoked",
        });
      }
    } else {
      // Should be unreachable because of allowRoles, but keep as safety
      return res.status(403).json({ message: "Not allowed to revoke" });
    }

    // Update status to LOADING_IN_PROGRESS
    // For SUPER_ADMIN: also clear assigned_reviewer so reviewer no longer has edit access
    // For ADMIN: keep assigned_reviewer intact (ADMIN can only revoke before assignment anyway)
    let updateQuery, updateParams;
    if (indent_number) {
      if (role === "SUPER_ADMIN") {
        updateQuery = `
            UPDATE dashboard_records 
            SET status = 'LOADING_IN_PROGRESS',
                assigned_reviewer = NULL
            WHERE rake_serial_number = $1 AND indent_number = $2
          `;
        updateParams = [trainId, indent_number];
      } else {
        updateQuery = `
            UPDATE dashboard_records 
            SET status = 'LOADING_IN_PROGRESS'
            WHERE rake_serial_number = $1 AND indent_number = $2
          `;
        updateParams = [trainId, indent_number];
      }
    } else {
      if (role === "SUPER_ADMIN") {
        updateQuery = `
            UPDATE dashboard_records 
            SET status = 'LOADING_IN_PROGRESS',
                assigned_reviewer = NULL
            WHERE rake_serial_number = $1
          `;
        updateParams = [trainId];
      } else {
        updateQuery = `
            UPDATE dashboard_records 
            SET status = 'LOADING_IN_PROGRESS'
            WHERE rake_serial_number = $1
          `;
        updateParams = [trainId];
      }
    }

    await pool.query(updateQuery, updateParams);

    // ─── Notify reviewers when SUPER_ADMIN revokes a completed (APPROVED) task ───
    if (role === "SUPER_ADMIN") {
      (async () => {
        try {
          const notifyUsersRes = await pool.query(
            `SELECT u.email, u.username
             FROM users u
             WHERE u.role = 'REVIEWER'
               AND u.is_active = true
               AND u.email IS NOT NULL
               AND u.email <> ''`
          );

          if (notifyUsersRes.rows.length === 0) {
            console.log(`[SUPER-REVOKE-NOTIFY] No active reviewers found to notify`);
            return;
          }

          const validRecipients = notifyUsersRes.rows.filter(u => isValidEmail(u.email));
          if (validRecipients.length === 0) {
            console.log(`[SUPER-REVOKE-NOTIFY] No valid reviewer email addresses found`);
            return;
          }

          // Resolve indent_number from dashboard_records if not in request
          let resolvedIndentNumber = indent_number || null;
          if (!resolvedIndentNumber) {
            const indentRes = await pool.query(
              `SELECT indent_number FROM dashboard_records
               WHERE rake_serial_number = $1
               AND indent_number IS NOT NULL
               AND indent_number <> ''
               ORDER BY indent_number
               LIMIT 1`,
              [trainId]
            );
            resolvedIndentNumber = indentRes.rows[0]?.indent_number || null;
          }

          const recipientEmails = validRecipients.map(u => u.email);
          const revokedByLabel = username || "Super Admin";
          const subject = `Approved Task Revoked – Rake ${trainId}`;

          const html = `
            <div style="font-family:Arial,sans-serif;max-width:700px;">
              <h2 style="color:#c0392b;">⚠️ Approved Task Revoked by Super Admin</h2>
              <p>A previously approved rake entry has been revoked by Super Admin <strong>${revokedByLabel}</strong> and moved back to Loading In Progress.</p>
              <table style="border-collapse:collapse;width:100%;margin:16px 0;">
                <thead>
                  <tr style="background:#0B3A6E;color:#fff;">
                    <th style="padding:8px 12px;text-align:left;">Rake Serial</th>
                    <th style="padding:8px 12px;text-align:left;">Indent</th>
                    <th style="padding:8px 12px;text-align:left;">Revoked By</th>
                    <th style="padding:8px 12px;text-align:left;">Revoked At</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${trainId}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${resolvedIndentNumber || "-"}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${revokedByLabel} (Super Admin)</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${new Date().toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
              <p style="color:#555;font-size:13px;">
                This entry has been moved back to <strong>Loading In Progress</strong> status by Super Admin.<br/>
                Your reviewer assignment for this task has been cleared. No further action is required from your side unless reassigned.
              </p>
            </div>
          `;

          await sendAlertEmail(recipientEmails, subject, html);
          console.log(`[SUPER-REVOKE-NOTIFY] Revocation email sent to ${recipientEmails.join(", ")} for rake ${decodedTrainId} by Super Admin ${revokedByLabel}`);
        } catch (emailErr) {
          console.error(`[SUPER-REVOKE-NOTIFY] Failed to send super admin revocation email for rake ${trainId}:`, emailErr.message);
        }
      })();
    }

    // ─── Notify reviewer if ADMIN revokes a PENDING_APPROVAL submission ───
    if (role === "ADMIN") {
      (async () => {
        try {
          // Only notify if there was an assigned reviewer
          // Also notify all active reviewers + super admins so no one is left out
          const notifyUsersRes = await pool.query(
            `SELECT u.email, u.username, u.role
             FROM users u
             WHERE u.role IN ('REVIEWER')
               AND u.is_active = true
               AND u.email IS NOT NULL
               AND u.email <> ''`
          );

          if (notifyUsersRes.rows.length === 0) {
            console.log(`[REVOKE-NOTIFY] No active reviewers/super admins found to notify`);
            return;
          }

          const validRecipients = notifyUsersRes.rows.filter(u => isValidEmail(u.email));
          if (validRecipients.length === 0) {
            console.log(`[REVOKE-NOTIFY] No valid email addresses found`);
            return;
          }

          const recipientEmails = validRecipients.map(u => u.email);
          const revokedByLabel = username || "Admin";
          const indentLabel = indent_number || null;

          // Resolve indent_number from dashboard_records if not in request
          let resolvedIndentNumber = indentLabel;
          if (!resolvedIndentNumber) {
            const indentRes = await pool.query(
              `SELECT indent_number FROM dashboard_records
               WHERE rake_serial_number = $1
               AND indent_number IS NOT NULL
               AND indent_number <> ''
               ORDER BY indent_number
               LIMIT 1`,
              [trainId]
            );
            resolvedIndentNumber = indentRes.rows[0]?.indent_number || null;
          }

          const subject = `Submission Revoked – Rake ${trainId}`;
          const html = `
            <div style="font-family:Arial,sans-serif;max-width:700px;">
              <h2 style="color:#c0392b;">↩️ Submission Revoked</h2>
              <p>A rake submission that was pending your review has been revoked by an admin.</p>
              <table style="border-collapse:collapse;width:100%;margin:16px 0;">
                <thead>
                  <tr style="background:#0B3A6E;color:#fff;">
                    <th style="padding:8px 12px;text-align:left;">Rake Serial</th>
                    <th style="padding:8px 12px;text-align:left;">Indent</th>
                    <th style="padding:8px 12px;text-align:left;">Revoked By</th>
                    <th style="padding:8px 12px;text-align:left;">Revoked At</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${trainId}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${resolvedIndentNumber || "-"}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${revokedByLabel}</td>
                    <td style="padding:8px 12px;border:1px solid #ddd;">${new Date().toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
              <p style="color:#555;font-size:13px;">
                This entry has been moved back to <strong>Loading In Progress</strong> status. 
                No further action is required from your side for this entry.
              </p>
            </div>
          `;

          await sendAlertEmail(recipientEmails, subject, html);
          console.log(`[REVOKE-NOTIFY] Revocation email sent to ${recipientEmails.join(", ")} for rake ${decodedTrainId} by ${revokedByLabel}`);
        } catch (emailErr) {
          console.error(`[REVOKE-NOTIFY] Failed to send revocation email for rake ${trainId}:`, emailErr.message);
        }
      })();
    }

    // Add activity timeline entry for revocation
    const revokeUsername = username || req.headers["x-username"] || "System";
    const revokeRole = role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN";
    const activityType = role === "SUPER_ADMIN" ? "REVOKED_BY_SUPER_ADMIN" : "REVOKED";
    const notes = role === "SUPER_ADMIN"
      ? `Status revoked from ${status} to LOADING_IN_PROGRESS by SUPER_ADMIN`
      : `Status revoked from ${status} to LOADING_IN_PROGRESS`;

    // ✅ FIX: Use decodedTrainId (actual rake_serial_number with slashes) so that
    // getActivityTimeline, which queries by rake_serial_number, can see this event.
    await addActivityTimelineEntry(
      decodedTrainId,
      indent_number || null,
      activityType,
      revokeUsername,
      notes
    );

    res.json({
      message: "Train status revoked successfully.",
      newStatus: "LOADING_IN_PROGRESS"
    });
  } catch (err) {
    console.error("REVOKE TRAIN ERROR:", err);
    res.status(500).json({ message: "Failed to revoke train status" });
  }
};

const checkSequentialAssignments = async (req, res) => {
  try {
    const { since_seconds = 30 } = req.query; // Default: check last 30 seconds

    // Query train_session for trains with sequential pattern (e.g., 2024-25/01/001-1) 
    // that were created recently (trigger creates new train_session records)
    // We check trains that match the pattern: financial_year/month/sequence-sequential (e.g., 2024-25/01/001-1)
    // Then join with dashboard_records to get indent_number
    const result = await pool.query(
      `
      SELECT 
        ts.train_id,
        COALESCE(d.indent_number, '') as indent_number,
        ts.created_time,
        COALESCE(d.status, '') as status
      FROM train_session ts
      LEFT JOIN dashboard_records d ON d.rake_serial_number = ts.rake_serial_number
      WHERE ts.rake_serial_number ~ '^(.+\/\d+\/\d+)-(\d+)$'
        AND ts.created_time >= NOW() - INTERVAL '${parseInt(since_seconds)} seconds'
      ORDER BY ts.created_time DESC
      LIMIT 100
      `
    );

    // Group by base train_id and indent_number to return unique assignments
    const assignments = result.rows.map(row => {
      // Extract base train_id (remove sequential suffix)
      const baseTrainId = row.train_id.replace(/-(\d+)$/, '');
      return {
        train_id: row.train_id,
        indent_number: row.indent_number || '',
        base_train_id: baseTrainId,
        created_time: row.created_time,
        status: row.status || ''
      };
    });

    // Remove duplicates (same train_id might appear multiple times if multiple dashboard_records exist)
    const uniqueAssignments = assignments.reduce((acc, curr) => {
      const key = `${curr.train_id}_${curr.indent_number}`;
      if (!acc[key]) {
        acc[key] = curr;
      }
      return acc;
    }, {});

    const finalAssignments = Object.values(uniqueAssignments);

    console.log(`[SEQUENTIAL CHECK] Found ${finalAssignments.length} recent sequential assignments (last ${since_seconds}s)`);

    res.json({
      assignments: finalAssignments,
      count: finalAssignments.length,
      since_seconds: parseInt(since_seconds)
    });
  } catch (err) {
    console.error("[SEQUENTIAL CHECK] Error checking sequential assignments:", err);
    res.status(500).json({
      message: "Failed to check sequential assignments",
      error: err.message
    });
  }
};


const addActivityTimelineEntry = async (trainId, indentNumber, activityType, username, notes = null, rakeSerialNumberParam = null) => {
  try {
    // ✅ FIX: Resolve rake_serial_number if not provided
    // Use the parameter name rakeSerialNumberParam to avoid shadowing
    let rakeSerialNumber = rakeSerialNumberParam;
    if (!rakeSerialNumber) {
      // Try to get rake_serial_number from train_session or dashboard_records
      try {
        const trainSessionRes = await pool.query(
          "SELECT rake_serial_number FROM train_session WHERE rake_serial_number = $1 LIMIT 1",
          [trainId]
        );
        if (trainSessionRes.rows.length > 0 && trainSessionRes.rows[0].rake_serial_number) {
          rakeSerialNumber = trainSessionRes.rows[0].rake_serial_number;
        } else {
          // Fallback to dashboard_records
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
        // Continue without rake_serial_number
      }
    }

    // ✅ FIX: Use rakeSerialNumber if resolved, otherwise use trainId (which is already a rake_serial_number)
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
    // Don't throw - activity logging should not break main operations
  }
};


const checkMultipleSerials = async (req, res) => {
  const { trainId } = req.params;
  const decodedTrainId = trainId.replace(/_/g, "/");

  try {
    // Check if any train_session or dashboard_records exist with pattern trainId-N
    const sequentialSerials = await pool.query(
      `
        SELECT rake_serial_number AS train_id FROM train_session 
        WHERE rake_serial_number LIKE $1 AND rake_serial_number != $2
        LIMIT 1
        `,
      [`${decodedTrainId}-%`, decodedTrainId]
    );

    const hasSequentialSerials = sequentialSerials.rows.length > 0;

    res.json({
      hasSequentialSerials,
      message: hasSequentialSerials
        ? "Sequential serial numbers already exist"
        : "No sequential serial numbers found",
    });
  } catch (err) {
    console.error("CHECK MULTIPLE SERIALS ERROR:", err);
    res.status(500).json({
      message: "Failed to check serial numbers",
      hasSequentialSerials: false,
    });
  }
};

const generateMultipleRakeSerial = async (req, res) => {
  const { trainId } = req.params;
  // trainId may be URL encoded (e.g., "2025-26%2F01%2F001"), decode it
  const decodedTrainId = trainId.replace(/_/g, "/");
  const { indentNumbers: indentNumbersFromBody } = req.body;

  try {
    // Get original train data - check both train_id and rake_serial_number
    const originalTrain = await pool.query(
      "SELECT * FROM train_session WHERE rake_serial_number = $1",
      [decodedTrainId]
    );

    if (originalTrain.rows.length === 0) {
      return res.status(404).json({ message: "Original train not found" });
    }

    const originalData = originalTrain.rows[0];
    const rakeSerialNumber = originalData.rake_serial_number; // ✅ FIX: Use rake_serial_number from train_session
    const siding = originalData.siding;

    // Get existing dashboard_records to get all indent numbers
    // ✅ FIX: Use rake_serial_number only
    const existingDashboardRecords = await pool.query(
      "SELECT * FROM dashboard_records WHERE rake_serial_number = $1 OR rake_serial_number LIKE $2",
      [decodedTrainId, `${rakeSerialNumber}-%`]
    );

    if (existingDashboardRecords.rows.length === 0) {
      return res.status(404).json({ message: "No dashboard records found for this train" });
    }

    // ✅ FIX: Check if serial numbers have already been generated using rake_serial_number
    const hasSequentialSerials = existingDashboardRecords.rows.some(
      r => r.rake_serial_number && r.rake_serial_number.includes(`${rakeSerialNumber}-`) && r.rake_serial_number !== rakeSerialNumber
    );

    if (hasSequentialSerials) {
      return res.status(400).json({
        message: "Multiple rake serial numbers have already been generated for this train"
      });
    }

    // ✅ FIX: Filter to only records with the original rake_serial_number
    const originalRecords = existingDashboardRecords.rows.filter(r =>
      r.rake_serial_number === rakeSerialNumber || r.rake_serial_number === decodedTrainId
    );

    if (originalRecords.length === 0) {
      return res.status(404).json({ message: "No dashboard records found with original rake_serial_number" });
    }

    // Get distinct indent numbers - prefer from request body if provided, otherwise from database records
    let indentNumbers = [];
    if (indentNumbersFromBody && Array.isArray(indentNumbersFromBody) && indentNumbersFromBody.length > 0) {
      // Use indent numbers from request body (from frontend)
      indentNumbers = indentNumbersFromBody
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i); // unique
    } else {
      // Fallback to getting indent numbers from database records
      indentNumbers = originalRecords
        .map(r => r.indent_number)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i); // unique
    }

    if (indentNumbers.length === 0) {
      return res.status(400).json({ message: "No indent numbers found. Please provide indent numbers in the request body or ensure they exist in dashboard records." });
    }

    // ✅ Check which indent number has bag count started (loaded_bag_count > 0)
    // Only consider the indent numbers we are actually splitting, and make the
    // selection deterministic by ordering by indent_number
    const indentBagCounts = await pool.query(
      `SELECT indent_number, SUM(loaded_bag_count) as total_bags
         FROM wagon_records
         WHERE (rake_serial_number = $1 OR rake_serial_number = $2)
           AND indent_number = ANY($3)
         GROUP BY indent_number
         HAVING SUM(loaded_bag_count) > 0
         ORDER BY indent_number`,
      [rakeSerialNumber, decodedTrainId, indentNumbers]
    );

    // Find the indent number that has bag count started.
    // If multiple indents have started counting, choose the smallest
    // indent_number so behaviour is predictable.
    const indentWithBagCount = indentBagCounts.rows.length > 0
      ? indentBagCounts.rows[0].indent_number
      : null;

    console.log(`[GENERATE MULTIPLE RAKE SERIAL] Indent with bag count started: ${indentWithBagCount}`);

    // ✅ Sort indent numbers in ascending order
    const sortedIndentNumbers = [...indentNumbers].sort();

    // ✅ Assign existing rake serial number to indent with bag count started
    // Then assign sequential numbers to others in ascending order
    const updatedTrainIds = {};
    let currentRakeSerial = rakeSerialNumber; // Start with the original rake serial number
    let assignedOriginal = false; // Track if we've assigned the original rake serial number

    // ✅ FIX: Get all existing data from parent records BEFORE splitting
    // This ensures we can copy all user input and backend entries to child records
    const parentDashboardRecords = await pool.query(
      `SELECT * FROM dashboard_records 
         WHERE rake_serial_number = $1 
         ORDER BY 
           CASE WHEN indent_number IS NULL OR indent_number = '' THEN 0 ELSE 1 END,
           indent_number`,
      [rakeSerialNumber]
    );

    const parentDispatchRecords = await pool.query(
      `SELECT * FROM dispatch_records 
         WHERE rake_serial_number = $1 
         ORDER BY 
           CASE WHEN indent_number IS NULL OR indent_number = '' THEN 0 ELSE 1 END,
           indent_number`,
      [rakeSerialNumber]
    );

    // ✅ FIX: Get parent dashboard record (with null/empty indent_number)
    // During Save, we create only ONE parent record with null indent_number
    // During splitting, we need to find this parent record
    const parentDashboard = parentDashboardRecords.rows.find(r =>
      !r.indent_number || r.indent_number === ''
    ) || parentDashboardRecords.rows[0];

    // ✅ FIX: Get parent dispatch record (with null/empty indent_number or first record)
    const parentDispatch = parentDispatchRecords.rows.find(r =>
      !r.indent_number || r.indent_number === ''
    ) || parentDispatchRecords.rows[0];

    // ✅ CRITICAL FIX: If no parent dashboard record exists, create one from wagon data
    // This handles the case where Save created a parent record but it was deleted or not found
    if (!parentDashboard) {
      console.log(`[GENERATE MULTIPLE RAKE SERIAL] No parent dashboard record found, creating one from wagon data`);
      // Get first wagon data to populate parent record
      const firstWagon = await pool.query(
        `SELECT indent_number, customer_id, commodity, wagon_destination 
           FROM wagon_records 
           WHERE rake_serial_number = $1 
           ORDER BY tower_number 
           LIMIT 1`,
        [rakeSerialNumber]
      );

      if (firstWagon.rows.length > 0) {
        const w = firstWagon.rows[0];
        await pool.query(
          `
            INSERT INTO dashboard_records (
              rake_serial_number, indent_number, customer_id, commodity, 
              wagon_destination, status, single_indent, hl_only, siding, 
              created_time, has_sequential_serials, assigned_reviewer
            )
            SELECT 
              $1, NULL, $2, $3, $4, 'DRAFT', 
              FALSE, hl_only, siding, created_time, FALSE, NULL
            FROM dashboard_records
            WHERE rake_serial_number = $5
            LIMIT 1
            `,
          [rakeSerialNumber, w.customer_id, w.commodity, w.wagon_destination, rakeSerialNumber]
        );
      }
    }

    // Process indents: first assign original to indent with bag count, then sequential to others
    for (let i = 0; i < sortedIndentNumbers.length; i++) {
      const indentNum = sortedIndentNumbers[i];
      let assignedRakeSerial;

      if (indentNum === indentWithBagCount && !assignedOriginal) {
        // Indent with bag count started gets the original rake serial number
        assignedRakeSerial = rakeSerialNumber;
        assignedOriginal = true;
        console.log(`[GENERATE MULTIPLE RAKE SERIAL] Assigning original rake serial ${rakeSerialNumber} to indent ${indentNum} (has bag count started)`);
      } else {
        // Other indents get sequential numbers
        assignedRakeSerial = await generateNextUniqueRakeSerialNumber(currentRakeSerial);
        currentRakeSerial = assignedRakeSerial; // Update for next iteration
        console.log(`[GENERATE MULTIPLE RAKE SERIAL] Assigning sequential rake serial ${assignedRakeSerial} to indent ${indentNum}`);
      }

      // ✅ CRITICAL FIX: During splitting, always create NEW dashboard record for each indent
      // The parent record (with null indent_number) should NOT be updated - it will be deleted later
      // Get indent-specific data from wagons (customer_id, commodity, wagon_destination may differ per indent)
      const indentWagonData = await pool.query(
        `SELECT DISTINCT customer_id, commodity, wagon_destination 
           FROM wagon_records 
           WHERE rake_serial_number = $1 AND indent_number = $2 
           LIMIT 1`,
        [rakeSerialNumber, indentNum]
      );

      const indentCustomerId = indentWagonData.rows[0]?.customer_id || parentDashboard?.customer_id || null;
      const indentCommodity = indentWagonData.rows[0]?.commodity || parentDashboard?.commodity || null;
      const indentWagonDestination = indentWagonData.rows[0]?.wagon_destination || parentDashboard?.wagon_destination || null;

      // ✅ FIX: Create new dashboard record for this indent, copying data from parent
      // Use indent-specific data from wagons if available, otherwise use parent data
      // Preserve multiple_indent_confirmed flag from parent (child records inherit the flag)
      await pool.query(
        `
          INSERT INTO dashboard_records (
            rake_serial_number, indent_number, customer_id, commodity, 
            wagon_destination, status, single_indent, hl_only, siding, 
            created_time, has_sequential_serials, assigned_reviewer, multiple_indent_confirmed
          )
          SELECT 
            $1, $2, 
            COALESCE($3, customer_id), 
            COALESCE($4, commodity), 
            COALESCE($5, wagon_destination), 
            status, 
            FALSE, hl_only, siding, created_time, TRUE, assigned_reviewer, multiple_indent_confirmed
          FROM dashboard_records
          WHERE rake_serial_number = $6
            AND (indent_number IS NULL OR indent_number = '')
          LIMIT 1
          `,
        [assignedRakeSerial, indentNum, indentCustomerId, indentCommodity, indentWagonDestination, rakeSerialNumber]
      );
      console.log(`[GENERATE MULTIPLE RAKE SERIAL] Created dashboard record for indent ${indentNum} with rake_serial_number=${assignedRakeSerial}`);

      // ✅ CRITICAL FIX: Instead of INSERTing new wagons, UPDATE existing wagons' rake_serial_number
      // This preserves ALL fields (including loading times) automatically since we're only updating rake_serial_number
      // Wagons should already exist in the database (saved by saveDraft with indent numbers)
      // We just need to update their rake_serial_number to the assigned value

      // ✅ CRITICAL FIX: UPDATE existing wagons' rake_serial_number (preserves ALL fields including loading times)
      // Only update rake_serial_number - all other fields remain unchanged
      await pool.query(
        `
          UPDATE wagon_records
          SET rake_serial_number = $1
          WHERE (rake_serial_number = $2 OR rake_serial_number = $3)
            AND indent_number = $4
          `,
        [assignedRakeSerial, rakeSerialNumber, decodedTrainId, indentNum]
      );

      // ✅ CRITICAL FIX: No need to copy loading times separately - UPDATE preserves ALL fields automatically
      // Since we're only updating rake_serial_number, all other fields (including loading times) are preserved
      // This is much simpler and more reliable than trying to copy individual fields
      console.log(`[GENERATE MULTIPLE RAKE SERIAL] ✅ Updated rake_serial_number for indent ${indentNum} to ${assignedRakeSerial} - all fields (including loading times) preserved automatically`);

      // ✅ FIX: Handle dispatch_records for this indent
      const existingDispatchForIndent = parentDispatchRecords.rows.find(r =>
        r.indent_number === indentNum
      );

      if (existingDispatchForIndent) {
        // Update existing dispatch record - preserve ALL fields, only update rake_serial_number
        await pool.query(
          `
            UPDATE dispatch_records
            SET rake_serial_number = $1
            WHERE (rake_serial_number = $2 OR rake_serial_number = $3)
              AND indent_number = $4
            `,
          [assignedRakeSerial, rakeSerialNumber, decodedTrainId, indentNum]
        );
      } else if (parentDispatch) {
        // ✅ FIX: Create new dispatch record for this indent, copying ALL data from parent
        // Copy all dispatch fields from parent dispatch record
        await pool.query(
          `
            INSERT INTO dispatch_records (
              source, siding, indent_wagon_count, vessel_name, rake_type, status,
              rake_placement_datetime, rake_clearance_datetime, rake_idle_time,
              rake_loading_start_datetime, rake_loading_end_actual, rake_loading_end_railway,
              door_closing_datetime, rake_haul_out_datetime, loading_start_officer,
              loading_completion_officer, remarks, rr_number, indent_number,
              submitted_by, submitted_at, rake_serial_number
            )
            SELECT 
              source, siding, indent_wagon_count, vessel_name, rake_type, status,
              rake_placement_datetime, rake_clearance_datetime, rake_idle_time,
              rake_loading_start_datetime, rake_loading_end_actual, rake_loading_end_railway,
              door_closing_datetime, rake_haul_out_datetime, loading_start_officer,
              loading_completion_officer, remarks, rr_number, $2,
              submitted_by, submitted_at, $1
            FROM dispatch_records
            WHERE rake_serial_number = $3
              AND (indent_number IS NULL OR indent_number = '')
            LIMIT 1
            `,
          [assignedRakeSerial, indentNum, rakeSerialNumber]
        );
      }

      // Create train_session entry for this indent if it doesn't exist
      const trainSessionCheck = await pool.query(
        "SELECT 1 FROM train_session WHERE rake_serial_number = $1 LIMIT 1",
        [assignedRakeSerial]
      );

      if (trainSessionCheck.rows.length === 0) {
        // Create new train_session entry for this sequential rake serial number
        // Get wagon_count and siding from the original train_session entry
        const originalTrainSession = await pool.query(
          "SELECT wagon_count, siding FROM train_session WHERE rake_serial_number = $1 LIMIT 1",
          [rakeSerialNumber]
        );

        // Generate a unique train_id for this sequential entry
        // train_id has a unique constraint, so each sequential entry needs its own unique train_id
        let newTrainId;
        let attempts = 0;
        const maxAttempts = 100;

        while (attempts < maxAttempts) {
          newTrainId = `TRAIN-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

          // Check if this train_id already exists
          const trainIdCheck = await pool.query(
            "SELECT 1 FROM train_session WHERE train_id = $1 LIMIT 1",
            [newTrainId]
          );

          if (trainIdCheck.rows.length === 0) {
            // train_id is unique, use it
            break;
          }

          attempts++;
        }

        if (attempts >= maxAttempts) {
          console.error(`[GENERATE MULTIPLE RAKE SERIAL] Failed to generate unique train_id after ${maxAttempts} attempts`);
          throw new Error("Failed to generate unique train_id");
        }

        const wagonCount = originalTrainSession.rows[0]?.wagon_count || null;
        const sidingValue = originalTrainSession.rows[0]?.siding || null;

        await pool.query(
          `
            INSERT INTO train_session (train_id, rake_serial_number, wagon_count, siding)
            VALUES ($1, $2, $3, $4)
            `,
          [newTrainId, assignedRakeSerial, wagonCount, sidingValue]
        );

        console.log(`[GENERATE MULTIPLE RAKE SERIAL] Created train_session entry: train_id=${newTrainId}, rake_serial_number=${assignedRakeSerial}`);
      }

      updatedTrainIds[indentNum] = assignedRakeSerial;
    }

    // Delete the parent record (with null/empty indent_number) immediately when splitting
    await pool.query(
      "DELETE FROM dashboard_records WHERE rake_serial_number = $1 AND (indent_number IS NULL OR indent_number = '')",
      [rakeSerialNumber]
    );
    console.log(`[GENERATE MULTIPLE RAKE SERIAL] Deleted parent record for ${rakeSerialNumber} when splitting into indents`);

    res.json({
      message: "Multiple rake serial numbers assigned successfully",
      updatedTrainIds,
      trainIdChanged: true,
    });
  } catch (err) {
    console.error("GENERATE MULTIPLE RAKE SERIAL ERROR:", err);
    res.status(500).json({ message: `Failed to generate serial numbers: ${err.message}` });
  }
};

const markSerialHandled = async (req, res) => {
  const { trainId } = req.params;
  // trainId may be URL encoded (e.g., "2025-26%2F01%2F001"), decode it
  const decodedTrainId = trainId.replace(/_/g, "/");

  try {
    const rakeSerialNumber = decodedTrainId;

    // 1️⃣ Fetch the parent dashboard record (single row with null/empty indent_number)
    const parentRes = await pool.query(
      `
        SELECT rake_serial_number, indent_number, customer_id, commodity, 
               wagon_destination, status, single_indent, hl_only, siding, 
               created_time, has_sequential_serials, assigned_reviewer, multiple_indent_confirmed
        FROM dashboard_records
        WHERE rake_serial_number = $1
          AND (indent_number IS NULL OR indent_number = '')
        LIMIT 1
      `,
      [rakeSerialNumber]
    );

    const parentDashboard = parentRes.rows[0] || null;

    if (!parentDashboard) {
      return res.status(404).json({ message: "Parent dashboard record not found" });
    }

    // 2️⃣ Get all distinct indent_numbers from wagon_records for this rake_serial_number
    const indentRes = await pool.query(
      `
        SELECT DISTINCT indent_number
        FROM wagon_records
        WHERE rake_serial_number = $1
          AND indent_number IS NOT NULL
          AND indent_number <> ''
        ORDER BY indent_number
      `,
      [rakeSerialNumber]
    );

    const indentNumbers = indentRes.rows.map(r => r.indent_number).filter(Boolean);

    if (indentNumbers.length === 0) {
      // No child indents to split into; just mark parent as handled and return
      await pool.query(
        `
          UPDATE dashboard_records
          SET has_sequential_serials = FALSE
          WHERE rake_serial_number = $1
        `,
        [rakeSerialNumber]
      );

      return res.json({
        message: "Serial handling marked successfully (no child indents found, parent preserved with has_sequential_serials = FALSE)",
      });
    }

    // 3️⃣ For each indent_number, create a new child dashboard record sharing the SAME rake_serial_number
    //    This is the "multiple rake serial number = NO" behavior: one rake_serial_number, many indent rows.
    for (const indentNum of indentNumbers) {
      // Get indent-specific data from wagons (customer_id, commodity, wagon_destination)
      const indentWagonData = await pool.query(
        `
          SELECT DISTINCT customer_id, commodity, wagon_destination
          FROM wagon_records
          WHERE rake_serial_number = $1
            AND indent_number = $2
          LIMIT 1
        `,
        [rakeSerialNumber, indentNum]
      );

      const indentCustomerId =
        indentWagonData.rows[0]?.customer_id || parentDashboard.customer_id || null;
      const indentCommodity =
        indentWagonData.rows[0]?.commodity || parentDashboard.commodity || null;
      const indentWagonDestination =
        indentWagonData.rows[0]?.wagon_destination || parentDashboard.wagon_destination || null;

      await pool.query(
        `
          INSERT INTO dashboard_records (
            rake_serial_number, indent_number, customer_id, commodity,
            wagon_destination, status, single_indent, hl_only, siding,
            created_time, has_sequential_serials, assigned_reviewer, multiple_indent_confirmed
          )
          VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8, $9, FALSE, $10, TRUE)
        `,
        [
          rakeSerialNumber,
          indentNum,
          indentCustomerId,
          indentCommodity,
          indentWagonDestination,
          parentDashboard.status || "DRAFT",
          parentDashboard.hl_only,
          parentDashboard.siding,
          parentDashboard.created_time,
          parentDashboard.assigned_reviewer || null,
        ]
      );
    }

    // 4️⃣ Mark any existing dashboard_records for this rake_serial_number as has_sequential_serials = FALSE
    await pool.query(
      `
        UPDATE dashboard_records
        SET has_sequential_serials = FALSE
        WHERE rake_serial_number = $1
      `,
      [rakeSerialNumber]
    );

    // 5️⃣ Delete the parent/single-indent record(s) so only child rows remain in dashboard
    await pool.query(
      `
        DELETE FROM dashboard_records
        WHERE rake_serial_number = $1
          AND (indent_number IS NULL OR indent_number = '' OR single_indent = true)
      `,
      [rakeSerialNumber]
    );

    res.json({
      message:
        "Serial handling marked successfully (multiple rake serial number = NO; parent split into per-indent dashboard records sharing the same rake_serial_number).",
      indent_numbers: indentNumbers,
    });
  } catch (err) {
    console.error("MARK SERIAL HANDLED ERROR:", err);
    res.status(500).json({ message: "Failed to mark serial handling" });
  }
};

module.exports = {
  createTrain,
  viewTrain,
  editTrain,
  saveDraft,
  getDispatch,
  saveDispatchDraft,
  submitDispatch,
  getActivityTimeline,
  exportChanges,
  exportAllReviewerChanges,
  revokeTrain,
  checkSequentialAssignments,
  checkMultipleSerials,
  generateMultipleRakeSerial,
  markSerialHandled,
};
