/**
 * haulOutAlertService.js
 *
 * Polls dispatch_records every 30 seconds.
 * When rake_haul_out_datetime is found filled (non-null) for any rake that was
 * previously un-hauled, it sends a "Rake Departed" email to all ADMIN,
 * REVIEWER, and SUPER_ADMIN users.
 *
 * Start this service from your server entry-point:
 *   require("./services/haulOutAlertService");
 */

const pool = require("../config/database");
const { sendAlertEmail } = require("../services/emailService");
const { isValidEmail } = require("../utils/emailValidator");

const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds

// ─── In-memory state ────────────────────────────────────────────────────────

// Tracks which rakes we have ALREADY sent a haul-out email for.
// Key: "<rake_serial_number>|<indent_number_or_empty>"
// We never alert twice for the same rake+indent combination.
const haulOutAlerted = new Set();

// On first poll we seed the set with rakes that ALREADY have haul-out time
// so we don't spam on service restart.
let isFirstPoll = true;

// ─── Email builder ───────────────────────────────────────────────────────────

const buildHaulOutHtml = (departures) => {
  const rows = departures
    .map(
      (d) => `
      <tr>
        <td style="padding:8px 12px;border:1px solid #ddd;">${d.rakeSerial}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;">${d.indentNumber || "-"}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;">${d.customerName || "-"}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;">${d.siding || "-"}</td>
        <td style="padding:8px 12px;border:1px solid #ddd;"><strong>${d.haulOutTime}</strong></td>
      </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:750px;">
      <h2 style="color:#8e44ad;">🚂 Rake Departed from Siding</h2>
      <p>The following rake(s) have been <strong>hauled out</strong> and have departed from their siding.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <thead>
          <tr style="background:#0B3A6E;color:#fff;">
            <th style="padding:8px 12px;text-align:left;">Rake Serial Number</th>
            <th style="padding:8px 12px;text-align:left;">Indent Number</th>
            <th style="padding:8px 12px;text-align:left;">Customer</th>
            <th style="padding:8px 12px;text-align:left;">Siding</th>
            <th style="padding:8px 12px;text-align:left;">Departed At</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="color:#555;font-size:13px;">
        Detected at: ${new Date().toLocaleString()}<br/>
        The rake(s) listed above have successfully departed. No further loading activity is expected.
      </p>
    </div>
  `;
};

// ─── Core poll function ──────────────────────────────────────────────────────

const pollHaulOut = async () => {
  try {
    // Fetch all dispatch_records that have rake_haul_out_datetime filled,
    // joined with dashboard_records for siding/indent and customers for name.
    const result = await pool.query(`
      SELECT
        dp.rake_serial_number,
        dp.indent_number,
        dp.rake_haul_out_datetime,
        d.siding,
        c.customer_name
      FROM dispatch_records dp
      LEFT JOIN dashboard_records d
        ON d.rake_serial_number = dp.rake_serial_number
        AND (
          (dp.indent_number IS NULL AND (d.indent_number IS NULL OR d.indent_number = ''))
          OR dp.indent_number = d.indent_number
        )
      LEFT JOIN customers c ON c.id = d.customer_id
      WHERE dp.rake_haul_out_datetime IS NOT NULL
      ORDER BY dp.rake_haul_out_datetime DESC
    `);

    if (isFirstPoll) {
      // Seed the alerted set so we don't fire on restart for already-departed rakes
      result.rows.forEach((row) => {
        const key = `${row.rake_serial_number}|${row.indent_number || ""}`;
        haulOutAlerted.add(key);
      });
      console.log(
        `[HAUL-OUT-ALERT] First poll: seeded ${haulOutAlerted.size} already-departed rake(s) – no emails sent`
      );
      isFirstPoll = false;
      return;
    }

    // Find rakes that are newly hauled out (not yet in our alerted set)
    const newDepartures = [];

    for (const row of result.rows) {
      const key = `${row.rake_serial_number}|${row.indent_number || ""}`;

      if (!haulOutAlerted.has(key)) {
        haulOutAlerted.add(key);

        let haulOutTime = "-";
        try {
          haulOutTime = new Date(row.rake_haul_out_datetime).toLocaleString();
        } catch (_) {}

        newDepartures.push({
          rakeSerial: row.rake_serial_number,
          indentNumber: row.indent_number || null,
          customerName: row.customer_name || null,
          siding: row.siding || null,
          haulOutTime,
        });

        console.log(
          `[HAUL-OUT-ALERT] New departure detected: rake "${row.rake_serial_number}", indent "${row.indent_number || "none"}", departed at ${haulOutTime}`
        );
      }
    }

    if (newDepartures.length === 0) {
      // Nothing new — silent poll
      return;
    }

    // ─── Fetch recipients ────────────────────────────────────────────────────
    const recipientsRes = await pool.query(`
      SELECT DISTINCT email
      FROM users
      WHERE is_active = true
        AND role IN ('ADMIN', 'REVIEWER', 'SUPER_ADMIN')
        AND email IS NOT NULL
        AND email <> ''
      ORDER BY email
    `);

    const recipients = recipientsRes.rows
      .map((r) => r.email)
      .filter((e) => isValidEmail(e));

    if (recipients.length === 0) {
      console.log(`[HAUL-OUT-ALERT] No valid recipients found – skipping email`);
      return;
    }

    // ─── Send email ──────────────────────────────────────────────────────────
    const subject =
      newDepartures.length === 1
        ? `🚂 Rake Departed – ${newDepartures[0].rakeSerial}`
        : `🚂 ${newDepartures.length} Rakes Departed from Siding`;

    const html = buildHaulOutHtml(newDepartures);

    await sendAlertEmail(recipients, subject, html);

    console.log(
      `[HAUL-OUT-ALERT] Departure email sent to ${recipients.join(", ")} for ${newDepartures.length} rake(s): ${newDepartures.map((d) => d.rakeSerial).join(", ")}`
    );
  } catch (err) {
    console.error("[HAUL-OUT-ALERT] Poll error:", err.message);
  }
};

// ─── Start polling ───────────────────────────────────────────────────────────

console.log(
  `[HAUL-OUT-ALERT] Service started – polling every ${POLL_INTERVAL_MS / 1000}s for rake departures`
);

// Run immediately on startup, then on interval
pollHaulOut();
setInterval(pollHaulOut, POLL_INTERVAL_MS);

module.exports = { pollHaulOut };
