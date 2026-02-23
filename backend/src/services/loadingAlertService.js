/**
 * Loading Alert Polling Service
 *
 * Polls the wagon_records table every 30 seconds to detect:
 *
 * 1. "Loading Started" – the FIRST bag is loaded in any wagon of a rake
 *    (i.e. a rake transitions from 0 total loaded bags to ≥ 1).
 *    → Sends email to ADMIN, REVIEWER, SUPER_ADMIN.
 *
 * 2. "Wagon Loading Completed" – a specific wagon's loaded_bag_count
 *    reaches its wagon_to_be_loaded target.
 *    → Sends email to ADMIN, REVIEWER, SUPER_ADMIN.
 */

const pool = require("../config/database");
const { sendAlertEmail } = require("./emailService");
const { isValidEmail } = require("../utils/emailValidator");

/* ───────── Configuration ───────── */
const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds (bag counts change frequently)

/* ───────── In-memory state ───────── */

// Track which rakes have already had a "Loading Started" alert sent.
// Keyed ONLY on rake_serial_number so that indent changes don't re-trigger.
// Set<rakeSerialNumber>
const loadingStartedAlerted = new Set();

// Track which wagons have already had a "Wagon Loading Completed" alert sent.
// Set<"rakeSerial|indentNumber|wagonNumber">
const wagonCompletedAlerted = new Set();

// Track which wagons have already had an 85% threshold alert sent.
// Set<"rakeSerial|indentNumber|wagonNumber">
const wagonThresholdAlerted = new Set();

// Track which rakes have already had a door-closing bag mismatch alert sent.
// Set<"rakeSerial|indentNumber"> — keyed on rake+indent since door_closing is per dispatch record
const doorClosingAlerted = new Set();

// Whether this is the very first poll (used to seed state without alerting)
let isFirstPoll = true;

/* ───────── Helpers ───────── */

/**
 * Fetch all wagon records with their bag counts grouped by rake + indent.
 */
const fetchWagonStates = async () => {
  const result = await pool.query(
    `SELECT
       w.rake_serial_number,
       w.indent_number,
       w.wagon_number,
       w.tower_number,
       w.loaded_bag_count,
       w.wagon_to_be_loaded,
       w.siding,
       d.customer_id,
       c.customer_name
     FROM wagon_records w
     LEFT JOIN dashboard_records d
       ON d.rake_serial_number = w.rake_serial_number
       AND (
         (d.indent_number IS NOT NULL AND d.indent_number <> '' AND d.indent_number = w.indent_number)
         OR (
           (d.indent_number IS NULL OR d.indent_number = '')
           AND (w.indent_number IS NULL OR w.indent_number = '')
         )
       )
     LEFT JOIN customers c ON c.id = d.customer_id
     ORDER BY w.rake_serial_number, w.indent_number, w.tower_number`
  );
  return result.rows;
};

/**
 * Fetch dispatch records that have door_closing_datetime set,
 * joined with wagon bag count totals for the same rake + indent.
 */
const fetchDoorClosingStates = async () => {
  const result = await pool.query(
    `SELECT
       w.rake_serial_number,
       w.indent_number,
       w.wagon_number,
       w.tower_number,
       w.loaded_bag_count,
       w.wagon_to_be_loaded,
       d.siding,
       d.door_closing_datetime,
       c.customer_name
     FROM wagon_records w
     INNER JOIN dispatch_records d
       ON d.rake_serial_number = w.rake_serial_number
       AND d.door_closing_datetime IS NOT NULL
     LEFT JOIN dashboard_records dr
       ON dr.rake_serial_number = w.rake_serial_number
       AND (
         (w.indent_number IS NOT NULL AND w.indent_number <> '' AND dr.indent_number = w.indent_number)
         OR (
           (w.indent_number IS NULL OR w.indent_number = '')
           AND (dr.indent_number IS NULL OR dr.indent_number = '')
         )
       )
     LEFT JOIN customers c ON c.id = dr.customer_id
     WHERE w.wagon_to_be_loaded > 0`
  );
  return result.rows;
};

/**
 * Fetch email addresses of active ADMIN / REVIEWER / SUPER_ADMIN users.
 */
const fetchAlertRecipients = async () => {
  const result = await pool.query(
    `SELECT DISTINCT email
     FROM users
     WHERE is_active = true
       AND role IN ('ADMIN', 'REVIEWER', 'SUPER_ADMIN')
       AND email IS NOT NULL
       AND email <> ''
     ORDER BY email`
  );
  return result.rows.map((r) => r.email).filter((e) => isValidEmail(e));
};

/* ───────── Email builders ───────── */

const buildLoadingStartedHtml = (rakes) => {
  const rows = rakes
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.rakeSerial}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.siding || "-"}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;">
      <h2 style="color:#27ae60;">🚛 Loading Started</h2>
      <p>The first bag has been loaded for the following rake(s):</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <thead>
          <tr style="background:#0B3A6E;color:#fff;">
            <th style="padding:8px 12px;text-align:left;">Rake Serial</th>
            <th style="padding:8px 12px;text-align:left;">Siding</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="color:#555;font-size:13px;">
        Detected at: ${new Date().toLocaleString()}<br/>
        Bag counting has begun. Please monitor the dashboard for progress.
      </p>
    </div>
  `;
};

const buildDoorClosingUnderloadHtml = (rakes) => {
  const rows = rakes
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.rakeSerial}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.indentNumber || "-"}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.wagonNumber || "-"}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.siding || "-"}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;color:#c0392b;"><strong>${r.totalLoaded}</strong></td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.totalTarget}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;color:#c0392b;"><strong>${r.difference}</strong></td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.customerName || "-"}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.doorClosingTime}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:800px;">
      <h2 style="color:#c0392b;">🔴 Underload at Door Closing</h2>
      <p>The following rake(s) had <strong>fewer bags loaded than targeted</strong> at the time of door closing.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <thead>
          <tr style="background:#0B3A6E;color:#fff;">
            <th style="padding:8px 12px;text-align:left;">Rake Serial</th>
            <th style="padding:8px 12px;text-align:left;">Indent</th>
            <th style="padding:8px 12px;text-align:left;">Wagon</th>
            <th style="padding:8px 12px;text-align:left;">Siding</th>
            <th style="padding:8px 12px;text-align:left;">Bags Loaded</th>
            <th style="padding:8px 12px;text-align:left;">Target Bags</th>
            <th style="padding:8px 12px;text-align:left;">Shortfall</th>
            <th style="padding:8px 12px;text-align:left;">Customer</th>
            <th style="padding:8px 12px;text-align:left;">Door Closed At</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="color:#555;font-size:13px;">
        Detected at: ${new Date().toLocaleString()}<br/>
        Action may be required. Please review the rake on the dashboard.
      </p>
    </div>
  `;
};

const buildDoorClosingOverloadHtml = (rakes) => {
  const rows = rakes
    .map(
      (r) =>
        `<tr>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.rakeSerial}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.indentNumber || "-"}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.wagonNumber || "-"}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.siding || "-"}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;color:#27ae60;"><strong>${r.totalLoaded}</strong></td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.totalTarget}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;color:#27ae60;"><strong>+${r.difference}</strong></td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.customerName || "-"}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${r.doorClosingTime}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:800px;">
      <h2 style="color:#27ae60;">🟢 Overload at Door Closing</h2>
      <p>The following rake(s) had <strong>more bags loaded than targeted</strong> at the time of door closing.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <thead>
          <tr style="background:#0B3A6E;color:#fff;">
            <th style="padding:8px 12px;text-align:left;">Rake Serial</th>
            <th style="padding:8px 12px;text-align:left;">Indent</th>
            <th style="padding:8px 12px;text-align:left;">Wagon</th>
            <th style="padding:8px 12px;text-align:left;">Siding</th>
            <th style="padding:8px 12px;text-align:left;">Bags Loaded</th>
            <th style="padding:8px 12px;text-align:left;">Target Bags</th>
            <th style="padding:8px 12px;text-align:left;">Excess</th>
            <th style="padding:8px 12px;text-align:left;">Customer</th>
            <th style="padding:8px 12px;text-align:left;">Door Closed At</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="color:#555;font-size:13px;">
        Detected at: ${new Date().toLocaleString()}<br/>
        Please verify the bag count on the dashboard.
      </p>
    </div>
  `;
};

const buildWagonThresholdHtml = (wagons) => {
  const rows = wagons
    .map(
      (w) =>
        `<tr>
          <td style="padding:8px 12px;border:1px solid #ddd;">${w.rakeSerial}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${w.indentNumber || "-"}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${w.wagonNumber || "-"}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${w.loadedBagCount} / ${w.wagonToBeLoaded}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${w.customerName || "-"}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;">
      <h2 style="color:#e67e22;">⚠️ Wagon Bag Count Approaching Target</h2>
      <p>The following wagon(s) have reached <strong>85% or more</strong> of their target bag count and are expected to complete loading soon:</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <thead>
          <tr style="background:#0B3A6E;color:#fff;">
            <th style="padding:8px 12px;text-align:left;">Rake Serial</th>
            <th style="padding:8px 12px;text-align:left;">Indent Number</th>
            <th style="padding:8px 12px;text-align:left;">Wagon Number</th>
            <th style="padding:8px 12px;text-align:left;">Bags (Loaded / Target)</th>
            <th style="padding:8px 12px;text-align:left;">Customer</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="color:#555;font-size:13px;">
        Detected at: ${new Date().toLocaleString()}<br/>
        Please prepare for wagon completion. Loading is nearly finished for the above wagon(s).
      </p>
    </div>
  `;
};

const buildWagonCompletedHtml = (wagons) => {
  const rows = wagons
    .map(
      (w) =>
        `<tr>
          <td style="padding:8px 12px;border:1px solid #ddd;">${w.rakeSerial}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${w.indentNumber || "-"}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${w.wagonNumber || "-"}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${w.loadedBagCount} / ${w.wagonToBeLoaded}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${w.customerName || "-"}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;">
      <h2 style="color:#2980b9;">✅ Wagon Loading Completed</h2>
      <p>The following wagon(s) have completed loading (loaded bags = bags to be loaded):</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <thead>
          <tr style="background:#0B3A6E;color:#fff;">
            <th style="padding:8px 12px;text-align:left;">Rake Serial</th>
            <th style="padding:8px 12px;text-align:left;">Indent Number</th>
            <th style="padding:8px 12px;text-align:left;">Wagon Number</th>
            <th style="padding:8px 12px;text-align:left;">Bags (Loaded / Target)</th>
            <th style="padding:8px 12px;text-align:left;">Customer</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="color:#555;font-size:13px;">
        Detected at: ${new Date().toLocaleString()}<br/>
        Please review the completed wagons on the dashboard.
      </p>
    </div>
  `;
};

/* ───────── Core poll logic ───────── */

const pollLoadingStatuses = async () => {
  try {
    const wagons = await fetchWagonStates();

    // ─── Group wagons by rake_serial_number ───
    // "Loading Started" is keyed ONLY on rake_serial_number so that
    // later indent saves don't re-trigger the email.
    const rakeGroups = new Map();

    for (const w of wagons) {
      const rakeKey = w.rake_serial_number;
      if (!rakeGroups.has(rakeKey)) {
        rakeGroups.set(rakeKey, {
          rakeSerial: w.rake_serial_number,
          siding: w.siding,
          wagons: [],
          totalLoaded: 0,
        });
      }
      const group = rakeGroups.get(rakeKey);
      group.wagons.push(w);
      group.totalLoaded += Number(w.loaded_bag_count) || 0;
    }

    // On the very first poll, seed state without alerting
    if (isFirstPoll) {
      for (const [rakeKey, group] of rakeGroups) {
        if (group.totalLoaded > 0) {
          loadingStartedAlerted.add(rakeKey);
        }
        for (const w of group.wagons) {
          const loaded = Number(w.loaded_bag_count) || 0;
          const target = Number(w.wagon_to_be_loaded) || 0;
          const wagonKey = `${w.rake_serial_number}|${w.indent_number || ""}|${w.wagon_number || w.tower_number}`;

          if (target > 0 && loaded >= target) {
            wagonCompletedAlerted.add(wagonKey);
            wagonThresholdAlerted.add(wagonKey);
          } else if (target > 0 && loaded >= target * 0.85) {
            wagonThresholdAlerted.add(wagonKey);
          }
        }
      }

      // Seed door-closing state — any dispatch record that already has
      // door_closing_datetime set should NOT re-alert on restart
      try {
        const doorStates = await fetchDoorClosingStates();
        for (const row of doorStates) {
          // Seed per-wagon key so existing wagons don't re-alert on restart
          const doorKey = `${row.rake_serial_number}|${row.indent_number || ""}|${row.wagon_number || row.tower_number}`;
          doorClosingAlerted.add(doorKey);
        }
        console.log(`[LOADING-ALERT] Seeded ${doorStates.length} door-closing wagon state(s) on startup`);
      } catch (seedErr) {
        console.error("[LOADING-ALERT] Error seeding door-closing state:", seedErr.message);
      }

      isFirstPoll = false;
      console.log(
        `[LOADING-ALERT] Initial poll complete – tracking ${rakeGroups.size} rake(s), ${wagons.length} wagon(s)`
      );
      return;
    }

    const newLoadingStarted = [];
    const newWagonThreshold = [];
    const newWagonCompleted = [];
    const newDoorClosingUnderload = [];
    const newDoorClosingOverload = [];

    for (const [rakeKey, group] of rakeGroups) {
      // ─── 1. Loading Started detection ───
      // Fires ONLY when the first sack is loaded into a rake (totalLoaded goes from 0 to ≥1).
      // Keyed on rake_serial_number alone, so indent number changes won't re-trigger.
      if (group.totalLoaded > 0 && !loadingStartedAlerted.has(rakeKey)) {
        loadingStartedAlerted.add(rakeKey);
        newLoadingStarted.push(group);
        console.log(
          `[LOADING-ALERT] Loading started for rake "${group.rakeSerial}" (first sack entered)`
        );
      }

      // ─── 2. Wagon 85% Threshold + Loading Completed detection ───
      for (const w of group.wagons) {
        const loaded = Number(w.loaded_bag_count) || 0;
        const target = Number(w.wagon_to_be_loaded) || 0;

        if (target <= 0) continue; // Skip wagons with no target set

        const wagonKey = `${w.rake_serial_number}|${w.indent_number || ""}|${w.wagon_number || w.tower_number}`;

        // ─── 2a. 85% threshold alert ───
        // Fires if loaded >= 85% of target AND threshold not yet alerted.
        // Intentionally has NO "loaded < target" guard — if the count jumps
        // straight past 100% in a single poll, we still want to send the
        // threshold warning alongside the completion email.
        if (loaded >= target * 0.85 && !wagonThresholdAlerted.has(wagonKey)) {
          wagonThresholdAlerted.add(wagonKey);
          const percentFilled = ((loaded / target) * 100).toFixed(1);
          // Only add to threshold email list if NOT already at/past target
          // (if already complete, the completion email is sufficient — but
          //  threshold state is still marked so it won't fire later either way)
          if (loaded < target) {
            newWagonThreshold.push({
              rakeSerial: w.rake_serial_number,
              indentNumber: w.indent_number,
              wagonNumber: w.wagon_number || `Tower ${w.tower_number}`,
              loadedBagCount: loaded,
              wagonToBeLoaded: target,
              percentFilled,
              customerName: w.customer_name,
            });
            console.log(
              `[LOADING-ALERT] 85% threshold reached: rake "${w.rake_serial_number}", wagon "${w.wagon_number || w.tower_number}" (${loaded}/${target} = ${percentFilled}%)`
            );
          } else {
            // Jumped straight to completion in this poll — threshold silently consumed
            console.log(
              `[LOADING-ALERT] Wagon jumped past 85% directly to completion: rake "${w.rake_serial_number}", wagon "${w.wagon_number || w.tower_number}" – threshold silently marked, completion email will fire`
            );
          }
        }

        // ─── 2b. Wagon fully completed ───
        if (loaded >= target && !wagonCompletedAlerted.has(wagonKey)) {
          wagonCompletedAlerted.add(wagonKey);
          newWagonCompleted.push({
            rakeSerial: w.rake_serial_number,
            indentNumber: w.indent_number,
            wagonNumber: w.wagon_number,
            loadedBagCount: loaded,
            wagonToBeLoaded: target,
            customerName: w.customer_name,
          });
          console.log(
            `[LOADING-ALERT] Wagon completed: rake "${w.rake_serial_number}", wagon "${w.wagon_number || w.tower_number}" (${loaded}/${target})`
          );
        }
      }
    }

    // ─── 3. Door closing bag mismatch detection (per wagon) ───
    try {
      const doorStates = await fetchDoorClosingStates();
      for (const row of doorStates) {
        const doorKey = `${row.rake_serial_number}|${row.indent_number || ""}|${row.wagon_number || row.tower_number}`;

        if (doorClosingAlerted.has(doorKey)) continue;

        const loaded = Number(row.loaded_bag_count) || 0;
        const target = Number(row.wagon_to_be_loaded) || 0;

        if (target <= 0) continue;

        // Mark as handled regardless (exact match, excess, or shortage)
        doorClosingAlerted.add(doorKey);

        // Exact match — no email needed
        if (loaded === target) continue;

        const doorClosingTime = row.door_closing_datetime
          ? new Date(row.door_closing_datetime).toLocaleString()
          : "-";

        const payload = {
          rakeSerial: row.rake_serial_number,
          indentNumber: row.indent_number,
          wagonNumber: row.wagon_number || `Tower ${row.tower_number}`,
          siding: row.siding,
          totalLoaded: loaded,
          totalTarget: target,
          difference: Math.abs(loaded - target),
          customerName: row.customer_name,
          doorClosingTime,
        };

        if (loaded < target) {
          newDoorClosingUnderload.push(payload);
          console.log(
            `[LOADING-ALERT] Shortage at door closing: rake "${row.rake_serial_number}", wagon "${row.wagon_number || row.tower_number}" loaded ${loaded}/${target} (shortfall: ${target - loaded})`
          );
        } else {
          newDoorClosingOverload.push(payload);
          console.log(
            `[LOADING-ALERT] Excess at door closing: rake "${row.rake_serial_number}", wagon "${row.wagon_number || row.tower_number}" loaded ${loaded}/${target} (excess: ${loaded - target})`
          );
        }
      }
    } catch (doorErr) {
      console.error("[LOADING-ALERT] Error checking door-closing states:", doorErr.message);
    }

    if (
      newLoadingStarted.length === 0 &&
      newWagonThreshold.length === 0 &&
      newWagonCompleted.length === 0 &&
      newDoorClosingUnderload.length === 0 &&
      newDoorClosingOverload.length === 0
    ) {
      return; // Nothing to report
    }

    const recipients = await fetchAlertRecipients();
    if (recipients.length === 0) {
      console.warn("[LOADING-ALERT] No valid email recipients found – skipping");
      return;
    }

    // Send "Loading Started" email (batch all started rakes into one email)
    if (newLoadingStarted.length > 0) {
      console.log(
        `[LOADING-ALERT] ${newLoadingStarted.length} rake(s) started loading – sending alert email`
      );
      const subject = `Loading Started: ${newLoadingStarted.length} Rake(s)`;
      const html = buildLoadingStartedHtml(newLoadingStarted);
      await sendAlertEmail(recipients, subject, html);
    }

    // Send "85% Threshold" email (batch all near-complete wagons into one email)
    if (newWagonThreshold.length > 0) {
      console.log(
        `[LOADING-ALERT] ${newWagonThreshold.length} wagon(s) at 85% threshold – sending alert email`
      );
      const subject = `⚠️ Wagon(s) Approaching Completion – ${newWagonThreshold.length} wagon(s)`;
      const html = buildWagonThresholdHtml(newWagonThreshold);
      await sendAlertEmail(recipients, subject, html);
    }

    // Send "Wagon Completed" email (batch all completed wagons into one email)
    if (newWagonCompleted.length > 0) {
      const subject = `Wagon Loading Completed: ${newWagonCompleted.length} wagon(s) finished`;
      const html = buildWagonCompletedHtml(newWagonCompleted);
      await sendAlertEmail(recipients, subject, html);
    }

    // Send "Underload at Door Closing" email
    if (newDoorClosingUnderload.length > 0) {
      console.log(
        `[LOADING-ALERT] ${newDoorClosingUnderload.length} rake(s) underloaded at door closing – sending alert email`
      );
      const subject = `🔴 Underload at Door Closing – ${newDoorClosingUnderload.length} Rake(s)`;
      const html = buildDoorClosingUnderloadHtml(newDoorClosingUnderload);
      await sendAlertEmail(recipients, subject, html);
    }

    // Send "Overload at Door Closing" email
    if (newDoorClosingOverload.length > 0) {
      console.log(
        `[LOADING-ALERT] ${newDoorClosingOverload.length} rake(s) overloaded at door closing – sending alert email`
      );
      const subject = `🟢 Overload at Door Closing – ${newDoorClosingOverload.length} Rake(s)`;
      const html = buildDoorClosingOverloadHtml(newDoorClosingOverload);
      await sendAlertEmail(recipients, subject, html);
    }
  } catch (err) {
    console.error("[LOADING-ALERT] Poll error:", err.message);
  }
};

/* ───────── Public API ───────── */

let pollInterval = null;

/**
 * Start the loading alert polling service.
 */
const startLoadingAlertPoller = () => {
  if (pollInterval) {
    console.warn("[LOADING-ALERT] Poller already running");
    return;
  }

  console.log(
    `[LOADING-ALERT] Starting poller (interval: ${POLL_INTERVAL_MS / 1000}s)`
  );

  // Run immediately on start, then every POLL_INTERVAL_MS
  pollLoadingStatuses();
  pollInterval = setInterval(pollLoadingStatuses, POLL_INTERVAL_MS);
};

/**
 * Stop the loading alert polling service.
 */
const stopLoadingAlertPoller = () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log("[LOADING-ALERT] Poller stopped");
  }
};

module.exports = { startLoadingAlertPoller, stopLoadingAlertPoller };
