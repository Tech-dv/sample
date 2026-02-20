/**
 * Camera Alert Polling Service
 *
 * Polls the camera_records table every 60 seconds.
 * Detects three types of camera issues and sends email alerts:
 *   1. Camera goes inactive  (status: true → false)
 *   2. Camera blur detected  (blur: false → true)
 *   3. Camera shaking detected (shaking: false → true)
 *
 * Emails are sent to all active ADMIN, REVIEWER, and SUPER_ADMIN users.
 * A 1-hour cooldown per camera per issue type prevents email floods.
 */

const pool = require("../config/database");
const { sendAlertEmail } = require("./emailService");
const { isValidEmail } = require("../utils/emailValidator");

/* ───────── Configuration ───────── */
const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/* ───────── In-memory state ───────── */
// Map<cameraId, { status: boolean, blur: boolean, shaking: boolean }>
let lastKnownStates = new Map();

// Map<"cameraId:issueType", timestamp> – cooldown per camera per issue type
const cooldownMap = new Map();

// Whether this is the very first poll (used to seed state without alerting)
let isFirstPoll = true;

/* ───────── Helpers ───────── */

/**
 * Fetch all cameras from the database (including blur and shaking fields).
 */
const fetchAllCameras = async () => {
  const result = await pool.query(
    "SELECT id, camera_name, siding, status, blur, shaking FROM camera_records ORDER BY id"
  );
  return result.rows;
};

/**
 * Fetch email addresses of active users with the given roles.
 * @returns {Promise<string[]>}
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

  // Filter through the validator to be safe
  return result.rows
    .map((r) => r.email)
    .filter((e) => isValidEmail(e));
};

/**
 * Check cooldown for a specific camera + issue type.
 * Returns true if the alert should be sent (not in cooldown).
 */
const checkAndSetCooldown = (cameraId, issueType) => {
  const key = `${cameraId}:${issueType}`;
  const lastAlertTime = cooldownMap.get(key);
  const now = Date.now();

  if (!lastAlertTime || now - lastAlertTime >= COOLDOWN_MS) {
    cooldownMap.set(key, now);
    return true;
  }
  return false;
};

/* ───────── Email builders ───────── */

/**
 * Build HTML email for camera issues (inactive / blur / shaking).
 * @param {string} title   – e.g. "Inactive Camera Detected"
 * @param {string} emoji   – e.g. "⚠"
 * @param {string} color   – heading colour
 * @param {string} description – paragraph text
 * @param {Array<{camera_name: string, siding: string}>} cameras
 */
const buildCameraAlertHtml = (title, emoji, color, description, cameras) => {
  const rows = cameras
    .map(
      (c) =>
        `<tr>
          <td style="padding:8px 12px;border:1px solid #ddd;">${c.camera_name}</td>
          <td style="padding:8px 12px;border:1px solid #ddd;">${c.siding}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:700px;">
      <h2 style="color:${color};">${emoji} ${title}</h2>
      <p>${description}</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <thead>
          <tr style="background:#0B3A6E;color:#fff;">
            <th style="padding:8px 12px;text-align:left;">Camera Name</th>
            <th style="padding:8px 12px;text-align:left;">Siding</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="color:#555;font-size:13px;">
        Detected at: ${new Date().toLocaleString()}<br/>
        Please check the camera dashboard for details.
      </p>
    </div>
  `;
};

/* ───────── Core poll logic ───────── */

const pollCameraStatuses = async () => {
  try {
    const cameras = await fetchAllCameras();

    // On the very first poll, just seed the in-memory map – don't alert
    if (isFirstPoll) {
      cameras.forEach((cam) =>
        lastKnownStates.set(cam.id, {
          status: cam.status,
          blur: cam.blur,
          shaking: cam.shaking,
        })
      );
      isFirstPoll = false;
      console.log(
        `[CAMERA-ALERT] Initial poll complete – tracking ${cameras.length} camera(s)`
      );
      return;
    }

    const newlyInactive = [];
    const newlyBlurred = [];
    const newlyShaking = [];

    cameras.forEach((cam) => {
      const prev = lastKnownStates.get(cam.id) || {};

      // 1. Inactive detection: status was true (or new), now false
      if ((prev.status === true || prev.status === undefined) && cam.status === false) {
        if (checkAndSetCooldown(cam.id, "inactive")) {
          newlyInactive.push(cam);
        } else {
          console.log(
            `[CAMERA-ALERT] Camera "${cam.camera_name}" (${cam.siding}) inactive – within cooldown, skipping`
          );
        }
      }

      // 2. Blur detection: blur was false (or new), now true
      if ((prev.blur === false || prev.blur === undefined) && cam.blur === true) {
        if (checkAndSetCooldown(cam.id, "blur")) {
          newlyBlurred.push(cam);
        } else {
          console.log(
            `[CAMERA-ALERT] Camera "${cam.camera_name}" (${cam.siding}) blur – within cooldown, skipping`
          );
        }
      }

      // 3. Shaking detection: shaking was false (or new), now true
      if ((prev.shaking === false || prev.shaking === undefined) && cam.shaking === true) {
        if (checkAndSetCooldown(cam.id, "shaking")) {
          newlyShaking.push(cam);
        } else {
          console.log(
            `[CAMERA-ALERT] Camera "${cam.camera_name}" (${cam.siding}) shaking – within cooldown, skipping`
          );
        }
      }

      // Always update the known state
      lastKnownStates.set(cam.id, {
        status: cam.status,
        blur: cam.blur,
        shaking: cam.shaking,
      });
    });

    // Remove cameras from the map that no longer exist in DB
    const currentIds = new Set(cameras.map((c) => c.id));
    for (const id of lastKnownStates.keys()) {
      if (!currentIds.has(id)) {
        lastKnownStates.delete(id);
        // Clean up all cooldown entries for this camera
        for (const key of cooldownMap.keys()) {
          if (key.startsWith(`${id}:`)) cooldownMap.delete(key);
        }
      }
    }

    // Nothing to report
    if (newlyInactive.length === 0 && newlyBlurred.length === 0 && newlyShaking.length === 0) {
      return;
    }

    const recipients = await fetchAlertRecipients();
    if (recipients.length === 0) {
      console.warn("[CAMERA-ALERT] No valid email recipients found – skipping email");
      return;
    }

    // Send Inactive alert
    if (newlyInactive.length > 0) {
      console.log(`[CAMERA-ALERT] ${newlyInactive.length} camera(s) went inactive – sending alert`);
      const subject = `Camera Alert: ${newlyInactive.length} camera(s) inactive`;
      const html = buildCameraAlertHtml(
        "Inactive Camera Detected",
        "⚠",
        "#c0392b",
        "The following camera(s) have become <strong>inactive</strong>:",
        newlyInactive
      );
      await sendAlertEmail(recipients, subject, html);
    }

    // Send Blur alert
    if (newlyBlurred.length > 0) {
      console.log(`[CAMERA-ALERT] ${newlyBlurred.length} camera(s) detected blur – sending alert`);
      const subject = `Camera Alert: ${newlyBlurred.length} camera(s) blur detected`;
      const html = buildCameraAlertHtml(
        "Camera Blur Detected",
        "🔍",
        "#e67e22",
        "The following camera(s) have <strong>blur</strong> detected:",
        newlyBlurred
      );
      await sendAlertEmail(recipients, subject, html);
    }

    // Send Shaking alert
    if (newlyShaking.length > 0) {
      console.log(`[CAMERA-ALERT] ${newlyShaking.length} camera(s) detected shaking – sending alert`);
      const subject = `Camera Alert: ${newlyShaking.length} camera(s) shaking detected`;
      const html = buildCameraAlertHtml(
        "Camera Shaking Detected",
        "📳",
        "#8e44ad",
        "The following camera(s) have <strong>shaking</strong> detected:",
        newlyShaking
      );
      await sendAlertEmail(recipients, subject, html);
    }
  } catch (err) {
    console.error("[CAMERA-ALERT] Poll error:", err.message);
  }
};

/* ───────── Public API ───────── */

let pollInterval = null;

/**
 * Start the camera alert polling service.
 * Safe to call multiple times – will not create duplicate intervals.
 */
const startCameraAlertPoller = () => {
  if (pollInterval) {
    console.warn("[CAMERA-ALERT] Poller already running");
    return;
  }

  console.log(
    `[CAMERA-ALERT] Starting poller (interval: ${POLL_INTERVAL_MS / 1000}s, cooldown: ${COOLDOWN_MS / 60000}min)`
  );

  // Run immediately on start, then every POLL_INTERVAL_MS
  pollCameraStatuses();
  pollInterval = setInterval(pollCameraStatuses, POLL_INTERVAL_MS);
};

/**
 * Stop the camera alert polling service.
 */
const stopCameraAlertPoller = () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log("[CAMERA-ALERT] Poller stopped");
  }
};

module.exports = { startCameraAlertPoller, stopCameraAlertPoller };
