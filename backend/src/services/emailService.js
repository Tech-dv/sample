/**
 * Email Service – sends emails via SendGrid
 *
 * Environment variables required (in backend/.env):
 *   SENDGRID_API_KEY   – your SendGrid API key (starts with "SG.")
 *   ALERT_FROM_EMAIL   – verified sender email address
 */

const sgMail = require("@sendgrid/mail");

const API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.ALERT_FROM_EMAIL;

// Initialise SendGrid only when a real key is present
if (API_KEY && API_KEY !== "SG.your_api_key_here") {
  sgMail.setApiKey(API_KEY);
  console.log("[EMAIL] SendGrid initialised");
} else {
  console.warn(
    "[EMAIL] SendGrid API key not configured – emails will be skipped. " +
    "Set SENDGRID_API_KEY in backend/.env"
  );
}

/**
 * Send an alert email to one or more recipients.
 *
 * @param {string[]} toList  – array of recipient email addresses
 * @param {string}   subject – email subject line
 * @param {string}   html    – email body (HTML)
 * @returns {Promise<boolean>} true if sent successfully, false otherwise
 */
const sendAlertEmail = async (toList, subject, html) => {
  if (!API_KEY || API_KEY === "SG.your_api_key_here") {
    console.warn("[EMAIL] Skipping send – SendGrid API key not configured");
    return false;
  }

  if (!FROM_EMAIL || FROM_EMAIL === "alerts@yourdomain.com") {
    console.warn("[EMAIL] Skipping send – ALERT_FROM_EMAIL not configured");
    return false;
  }

  if (!toList || toList.length === 0) {
    console.warn("[EMAIL] Skipping send – no recipients provided");
    return false;
  }

  try {
    const msg = {
      to: toList,
      from: FROM_EMAIL,
      subject,
      html,
    };

    await sgMail.send(msg);
    console.log(
      `[EMAIL] Alert sent to ${toList.length} recipient(s): ${subject}`
    );
    return true;
  } catch (err) {
    console.error("[EMAIL] Failed to send alert email:", err.message);
    if (err.response) {
      console.error("[EMAIL] SendGrid response body:", err.response.body);
    }
    return false;
  }
};

module.exports = { sendAlertEmail };
