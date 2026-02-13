const pool = require("../config/database");

const getDashboardData = async (req, res) => {
  console.log("=== Dashboard data request received ===");
  console.log("Headers:", req.headers);

  try {
    // Ensure rake_serial_number column exists in dashboard_records and train_sessions
    try {
      await pool.query("ALTER TABLE dashboard_records ADD COLUMN IF NOT EXISTS rake_serial_number TEXT");
      await pool.query("ALTER TABLE train_session ADD COLUMN IF NOT EXISTS rake_serial_number TEXT");
    } catch (alterErr) {
      // Column might already exist, but log the error for debugging
      console.log("Column rake_serial_number check:", alterErr.message);
    }

    // Check if rake_serial_number column exists by trying to query it
    let hasRakeSerialColumn = false;
    try {
      await pool.query("SELECT rake_serial_number FROM dashboard_records LIMIT 1");
      hasRakeSerialColumn = true;
    } catch (checkErr) {
      console.log("rake_serial_number column not available yet, using train_id only");
      hasRakeSerialColumn = false;
    }

    const role = req.headers["x-user-role"];
    const customerIdRaw = req.headers["x-customer-id"];
    const customerId = Number(customerIdRaw);
    const username = req.headers["x-username"];

    console.log("Role:", role);
    console.log("Customer ID:", customerIdRaw);
    console.log("Username:", username);

    if (role === "CUSTOMER" && (!customerIdRaw || Number.isNaN(customerId))) {
      console.error("Invalid customer ID for CUSTOMER role");
      return res.status(400).json({
        message: "Invalid or missing customer id",
      });
    }


    /* =====================================================
       DASHBOARD TABLE DATA (ROLE AWARE)
    ===================================================== */

    // Simplified query: dashboard_records now has one row per indent (for multiple indent trains)
    // So we can directly query dashboard_records and join with wagons for aggregation
    // Rake Loading Start/End times are calculated from wagon records (first/last by tower_number)
    let tableQuery;
    let tableParams = [];

    // Build train_id selection - use rake_serial_number as train_id for backward compatibility
    const trainIdSelect = "d.rake_serial_number AS train_id, d.rake_serial_number";

    if (role === "CUSTOMER") {
      tableQuery = `
          SELECT
            ${trainIdSelect},
            d.indent_number,
            d.siding,
            c.customer_name,
            d.wagon_destination,
            d.status,
            d.created_time,
            COALESCE(
              (
                SELECT STRING_AGG(DISTINCT w_comm.commodity, ', ' ORDER BY w_comm.commodity)
                FROM wagon_records w_comm
              WHERE w_comm.rake_serial_number = d.rake_serial_number
                  AND (d.single_indent = true OR w_comm.indent_number = d.indent_number)
                  AND w_comm.commodity IS NOT NULL
                  AND w_comm.commodity != ''
              ),
              d.commodity,
              ''
            ) AS commodity,
            (
              SELECT w_first.loading_start_time
              FROM wagon_records w_first
            WHERE w_first.rake_serial_number = d.rake_serial_number
                AND (d.single_indent = true OR w_first.indent_number = d.indent_number)
                AND w_first.loading_start_time IS NOT NULL
              ORDER BY w_first.tower_number ASC
              LIMIT 1
            ) AS rake_loading_start_datetime,
            (
              SELECT w_last.loading_end_time
              FROM wagon_records w_last
            WHERE w_last.rake_serial_number = d.rake_serial_number
                AND (d.single_indent = true OR w_last.indent_number = d.indent_number)
                AND w_last.loading_end_time IS NOT NULL
              ORDER BY w_last.tower_number DESC
              LIMIT 1
            ) AS rake_loading_end_actual,
            COALESCE(SUM(w.loaded_bag_count), 0) AS total_bags_loaded,
            SUM(w.wagon_to_be_loaded) AS total_bags_to_be_loaded
          FROM dashboard_records d
          JOIN customers c ON c.id = d.customer_id
        LEFT JOIN wagon_records w ON w.rake_serial_number = d.rake_serial_number
            AND (d.single_indent = true OR w.indent_number = d.indent_number)
          WHERE d.customer_id = $1
            -- Exclude parent records when child records (with sequential numbers) exist
            AND NOT (
              -- Check if this is a parent record (no sequential number in rake_serial_number)
              d.rake_serial_number !~ '^(.+\/\d+\/\d+)-(\d+)$'
              -- AND there exist child records with sequential numbers
              AND EXISTS (
                SELECT 1 FROM dashboard_records d2
                WHERE d2.rake_serial_number ~ '^(.+\/\d+\/\d+)-(\d+)$'
                  -- Extract base rake_serial_number from sequential pattern (e.g., 2025-26/01/001-1 -> 2025-26/01/001)
                  AND regexp_replace(d2.rake_serial_number, '-(\d+)$', '') = d.rake_serial_number
                  AND d2.customer_id = $1
                  AND d2.status != 'CANCELLED'
              )
            )
          GROUP BY
            d.rake_serial_number,
            d.indent_number,
            d.siding,
            c.customer_name,
            d.wagon_destination,
            d.status,
            d.created_time,
            d.commodity,
            d.single_indent
          ORDER BY d.created_time DESC
        `;
      tableParams = [customerId];
    } else if (role === "SUPER_ADMIN") {
      // SUPER_ADMIN: show all non-cancelled rows (same as ADMIN/REVIEWER)
      // Mark rows that were revoked by ANY SUPER_ADMIN so frontend can disable Edit while still allowing View
      tableQuery = `
          SELECT
            ${trainIdSelect},
            d.indent_number,
            d.siding,
            c.customer_name,
            d.wagon_destination,
            d.status,
            d.assigned_reviewer,
            d.created_time,
            COALESCE(
              (
                SELECT STRING_AGG(DISTINCT w_comm.commodity, ', ' ORDER BY w_comm.commodity)
                FROM wagon_records w_comm
              WHERE w_comm.rake_serial_number = d.rake_serial_number
                  AND (d.single_indent = true OR w_comm.indent_number = d.indent_number)
                  AND w_comm.commodity IS NOT NULL
                  AND w_comm.commodity != ''
              ),
              d.commodity,
              ''
            ) AS commodity,
            (
              SELECT w_first.loading_start_time
              FROM wagon_records w_first
            WHERE w_first.rake_serial_number = d.rake_serial_number
                AND (d.single_indent = true OR w_first.indent_number = d.indent_number)
                AND w_first.loading_start_time IS NOT NULL
              ORDER BY w_first.tower_number ASC
              LIMIT 1
            ) AS rake_loading_start_datetime,
            (
              SELECT w_last.loading_end_time
              FROM wagon_records w_last
            WHERE w_last.rake_serial_number = d.rake_serial_number
                AND (d.single_indent = true OR w_last.indent_number = d.indent_number)
                AND w_last.loading_end_time IS NOT NULL
              ORDER BY w_last.tower_number DESC
              LIMIT 1
            ) AS rake_loading_end_actual,
            COALESCE(SUM(w.loaded_bag_count), 0) AS total_bags_loaded,
            SUM(w.wagon_to_be_loaded) AS total_bags_to_be_loaded,
            EXISTS (
              SELECT 1
              FROM activity_timeline a
            WHERE a.rake_serial_number = d.rake_serial_number
                AND (
                  (a.indent_number IS NULL AND (d.indent_number IS NULL OR d.indent_number = ''))
                  OR a.indent_number = d.indent_number
                )
                AND a.activity_type = 'REVOKED_BY_SUPER_ADMIN'
            ) AS revoked_by_superadmin
          FROM dashboard_records d
          LEFT JOIN customers c ON c.id = d.customer_id
        LEFT JOIN wagon_records w ON w.rake_serial_number = d.rake_serial_number
            AND (d.single_indent = true OR w.indent_number = d.indent_number)
          WHERE 
            d.status != 'CANCELLED'
            -- Exclude parent records when child records (with sequential numbers) exist
            AND NOT (
              -- Check if this is a parent record (no sequential number in rake_serial_number)
              d.rake_serial_number !~ '^(.+\/\d+\/\d+)-(\d+)$'
              -- AND there exist child records with sequential numbers
              AND EXISTS (
                SELECT 1 FROM dashboard_records d2
                WHERE d2.rake_serial_number ~ '^(.+\/\d+\/\d+)-(\d+)$'
                  -- Extract base rake_serial_number from sequential pattern (e.g., 2025-26/01/001-1 -> 2025-26/01/001)
                  AND regexp_replace(d2.rake_serial_number, '-(\d+)$', '') = d.rake_serial_number
                  AND (d2.status = 'APPROVED' OR d2.status = 'LOADING_IN_PROGRESS' OR d2.status = 'CANCELLED')
              )
            )
          GROUP BY
            d.rake_serial_number,
            d.indent_number,
            d.siding,
            c.customer_name,
            d.wagon_destination,
            d.status,
            d.assigned_reviewer,
            d.created_time,
            d.commodity,
            d.single_indent
          ORDER BY d.created_time DESC
        `;
      tableParams = [];
    } else {
      // ADMIN / REVIEWER:
      // Show all non-cancelled rows, but mark rows that were revoked by ANY SUPER_ADMIN
      // so frontend can disable Edit while still allowing View.
      tableQuery = `
          SELECT
            ${trainIdSelect},
            d.indent_number,
            d.siding,
            c.customer_name,
            d.wagon_destination,
            d.status,
            d.assigned_reviewer,
            d.created_time,
            COALESCE(
              (
                SELECT STRING_AGG(DISTINCT w_comm.commodity, ', ' ORDER BY w_comm.commodity)
                FROM wagon_records w_comm
              WHERE w_comm.rake_serial_number = d.rake_serial_number
                  AND (d.single_indent = true OR w_comm.indent_number = d.indent_number)
                  AND w_comm.commodity IS NOT NULL
                  AND w_comm.commodity != ''
              ),
              d.commodity,
              ''
            ) AS commodity,
            (
              SELECT w_first.loading_start_time
              FROM wagon_records w_first
            WHERE w_first.rake_serial_number = d.rake_serial_number
                AND (d.single_indent = true OR w_first.indent_number = d.indent_number)
                AND w_first.loading_start_time IS NOT NULL
              ORDER BY w_first.tower_number ASC
              LIMIT 1
            ) AS rake_loading_start_datetime,
            (
              SELECT w_last.loading_end_time
              FROM wagon_records w_last
            WHERE w_last.rake_serial_number = d.rake_serial_number
                AND (d.single_indent = true OR w_last.indent_number = d.indent_number)
                AND w_last.loading_end_time IS NOT NULL
              ORDER BY w_last.tower_number DESC
              LIMIT 1
            ) AS rake_loading_end_actual,
            COALESCE(SUM(w.loaded_bag_count), 0) AS total_bags_loaded,
            SUM(w.wagon_to_be_loaded) AS total_bags_to_be_loaded,
            EXISTS (
              SELECT 1
              FROM activity_timeline a
            WHERE a.rake_serial_number = d.rake_serial_number
                AND (
                  (a.indent_number IS NULL AND (d.indent_number IS NULL OR d.indent_number = ''))
                  OR a.indent_number = d.indent_number
                )
                AND a.activity_type = 'REVOKED_BY_SUPER_ADMIN'
            ) AS revoked_by_superadmin
          FROM dashboard_records d
          LEFT JOIN customers c ON c.id = d.customer_id
        LEFT JOIN wagon_records w ON w.rake_serial_number = d.rake_serial_number
            AND (d.single_indent = true OR w.indent_number = d.indent_number)
          WHERE 1=1
            -- Exclude parent records when child records (with sequential numbers) exist
            AND NOT (
              -- Check if this is a parent record (no sequential number in rake_serial_number)
              d.rake_serial_number !~ '^(.+\/\d+\/\d+)-(\d+)$'
              -- AND there exist child records with sequential numbers
              AND EXISTS (
                SELECT 1 FROM dashboard_records d2
                WHERE d2.rake_serial_number ~ '^(.+\/\d+\/\d+)-(\d+)$'
                  -- Extract base rake_serial_number from sequential pattern (e.g., 2025-26/01/001-1 -> 2025-26/01/001)
                  AND regexp_replace(d2.rake_serial_number, '-(\d+)$', '') = d.rake_serial_number
                  AND d2.status != 'CANCELLED'
              )
            )
          GROUP BY
            d.rake_serial_number,
            d.indent_number,
            d.siding,
            c.customer_name,
            d.wagon_destination,
            d.status,
            d.assigned_reviewer,
            d.created_time,
            d.commodity,
            d.single_indent
          ORDER BY d.created_time DESC
        `;
      tableParams = [];
    }
    const tableResult = await pool.query(tableQuery, tableParams);

    /* =====================================================
       CUSTOMER SUMMARY
    ===================================================== */
    if (role === "CUSTOMER") {
      const summaryRes = await pool.query(
        `
        SELECT
          COUNT(DISTINCT d.rake_serial_number) AS total_trains,
          COUNT(w.wagon_number) AS total_wagon,
          COALESCE(SUM(w.loaded_bag_count), 0) AS total_bags_loaded
        FROM dashboard_records d
        LEFT JOIN wagon_records w ON w.rake_serial_number = d.rake_serial_number
        WHERE d.customer_id = $1
        `,
        [customerId]
      );

      return res.json({
        summary: {
          customerSummary: {
            total_trains: Number(summaryRes.rows[0].total_trains),
            total_wagons: Number(
              summaryRes.rows[0].total_wagon
            ),
            total_bags_loaded: Number(
              summaryRes.rows[0].total_bags_loaded
            ),
          },
        },
        records: tableResult.rows,
      });
    }

    /* =====================================================
       ADMIN / REVIEWER SUMMARY (SPUR + CAMERA)
    ===================================================== */

    const getCurrentTrainStats = async (spur) => {
      // Get all in-progress trains (not APPROVED, not CANCELLED) for this spur
      // CANCELLED indents are considered completed, so they show 0/0 (nothing in progress)
      // ✅ EXCLUDE trains that have been hauled out (rake_haul_out_datetime IS NOT NULL)
      // This includes split trains like 2024-25/01/001, 2024-25/01/001-1, 2024-25/01/001-2
      const trainsRes = await pool.query(
        `
        SELECT DISTINCT d.rake_serial_number AS train_id, d.status
        FROM dashboard_records d
        LEFT JOIN dispatch_records dp ON dp.rake_serial_number = d.rake_serial_number
          AND (
            d.single_indent = true 
            OR dp.indent_number = d.indent_number 
            OR (dp.indent_number IS NULL AND (d.indent_number IS NULL OR d.indent_number = ''))
          )
        WHERE d.siding = $1 
          AND d.status NOT IN ('APPROVED', 'CANCELLED')
          AND dp.rake_haul_out_datetime IS NULL
        `,
        [spur]
      );

      if (!trainsRes.rows.length) {
        console.log(`${spur}: No in-progress trains found (excluding APPROVED, CANCELLED, and hauled-out rakes)`);
        return { completed: 0, total: 0 };
      }

      // Get all train_ids (only in-progress trains that haven't been hauled out)
      const trainIds = trainsRes.rows.map(r => r.train_id);
      console.log(`${spur}: In-progress train IDs (not hauled out):`, trainIds);

      // Count wagons across ALL these trains (including split ones)
      // Only count wagons from in-progress trains (not cancelled, not approved, not hauled out)
      const wagonRes = await pool.query(
        `
        SELECT
          COUNT(*) AS total_wagons,
          COUNT(*) FILTER (
            WHERE
              -- ✅ Include manual completion toggle
              loading_status = true
              OR (
                loaded_bag_count >= wagon_to_be_loaded
                AND loaded_bag_count > 0
              )
          ) AS completed_wagons
        FROM wagon_records
        WHERE rake_serial_number = ANY($1)
        `,
        [trainIds]
      );

      const total = Number(wagonRes.rows[0]?.total_wagons || 0);
      const completed = Number(wagonRes.rows[0]?.completed_wagons || 0);

      console.log(`${spur}: Wagon stats - Completed: ${completed}, Total: ${total} (in-progress only, excluding hauled-out rakes)`);

      return { completed, total };
    };


    const getCameraStats = async (spur) => {
      const camRes = await pool.query(
        `
        SELECT
          COUNT(*) AS total_cameras,
          COUNT(*) FILTER (WHERE status = true) AS active_cameras
        FROM camera_records
        WHERE siding = $1
        `,
        [spur]
      );

      return {
        active: Number(camRes.rows[0].active_cameras),
        total: Number(camRes.rows[0].total_cameras),
      };
    };

    res.json({
      summary: {
        spurSummary: {
          "SPUR-8": {
            wagons: await getCurrentTrainStats("SPUR-8"),
            cameras: await getCameraStats("SPUR-8"),
          },
          "SPUR-9": {
            wagons: await getCurrentTrainStats("SPUR-9"),
            cameras: await getCameraStats("SPUR-9"),
          },
        },
      },
      records: tableResult.rows,
    });
    console.log("=== Dashboard data response sent successfully ===");
    console.log("Records count:", tableResult.rows.length);
  } catch (err) {
    console.error("=== DASHBOARD ERROR ===", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({ message: "Dashboard fetch failed" });
  }
};

module.exports = {
  getDashboardData,
};
