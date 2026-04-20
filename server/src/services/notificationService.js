const { query } = require('../config/db');

/**
 * notification_type values (kept as plain strings for simplicity):
 *   'application_received' | 'promotion_notice' | 'acknowledgement_confirmed'
 *   | 'decay_notice' | 'rejection_notice' | 'withdrawal_confirmed'
 *   | 'offer_extended'
 */

/**
 * Log a simulated outbound email notification.
 * In a production system this would call an SMTP / transactional email provider.
 *
 * @param {object} opts
 * @param {string} opts.applicantName
 * @param {string} opts.applicantEmail
 * @param {string} opts.notificationType
 * @param {string} opts.subject
 * @param {string} opts.body
 * @param {string|null} [opts.applicationId]
 * @param {string|null} [opts.jobId]
 * @param {string|null} [opts.jobTitle]
 */
async function logNotification({
  applicantName,
  applicantEmail,
  notificationType,
  subject,
  body,
  applicationId = null,
  jobId = null,
  jobTitle = null,
}) {
  try {
    await query(
      `INSERT INTO notifications
         (applicant_name, applicant_email, notification_type, subject, body, application_id, job_id, job_title)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [applicantName, applicantEmail, notificationType, subject, body, applicationId, jobId, jobTitle]
    );
    console.log(`📧 [SIMULATED EMAIL] → ${applicantEmail} | ${subject}`);
  } catch (err) {
    // Never let notification failures break the main pipeline flow
    console.error('⚠️  Failed to log notification:', err.message);
  }
}

// ─── Convenience helpers ────────────────────────────────────────────────────

async function notifyApplicationReceived({ applicantName, applicantEmail, jobTitle, applicationId, jobId, status }) {
  const isActive = status === 'active';
  await logNotification({
    applicantName,
    applicantEmail,
    notificationType: 'application_received',
    subject: `Application received — ${jobTitle}`,
    body: isActive
      ? `Hi ${applicantName}, you have been placed directly into the active review pool for "${jobTitle}". Please acknowledge your spot promptly.`
      : `Hi ${applicantName}, your application for "${jobTitle}" has been received and you have been added to the waitlist. We will notify you when a slot opens.`,
    applicationId,
    jobId,
    jobTitle,
  });
}

async function notifyPromotion({ applicantName, applicantEmail, jobTitle, applicationId, jobId, deadlineISO }) {
  const deadline = deadlineISO ? new Date(deadlineISO).toLocaleString() : 'soon';
  await logNotification({
    applicantName,
    applicantEmail,
    notificationType: 'promotion_notice',
    subject: `You have been promoted — action required (${jobTitle})`,
    body: `Hi ${applicantName}, great news! A slot opened up and you have been moved to active review for "${jobTitle}". Please acknowledge your spot before ${deadline} to keep your place.`,
    applicationId,
    jobId,
    jobTitle,
  });
}

async function notifyAcknowledgementConfirmed({ applicantName, applicantEmail, jobTitle, applicationId, jobId }) {
  await logNotification({
    applicantName,
    applicantEmail,
    notificationType: 'acknowledgement_confirmed',
    subject: `Spot confirmed — ${jobTitle}`,
    body: `Hi ${applicantName}, your spot for "${jobTitle}" is confirmed. The hiring team will be in touch with you about next steps, including a technical screen or interview scheduling.`,
    applicationId,
    jobId,
    jobTitle,
  });
}

async function notifyDecay({ applicantName, applicantEmail, jobTitle, applicationId, jobId, penaltyCount }) {
  await logNotification({
    applicantName,
    applicantEmail,
    notificationType: 'decay_notice',
    subject: `Acknowledgement window expired — ${jobTitle}`,
    body: `Hi ${applicantName}, your active review window for "${jobTitle}" has expired because no acknowledgement was received in time. You have been re-queued with a priority penalty (total penalties: ${penaltyCount}). Keep an eye out for your next promotion notice.`,
    applicationId,
    jobId,
    jobTitle,
  });
}

async function notifyRejection({ applicantName, applicantEmail, jobTitle, applicationId, jobId }) {
  await logNotification({
    applicantName,
    applicantEmail,
    notificationType: 'rejection_notice',
    subject: `Update on your application — ${jobTitle}`,
    body: `Hi ${applicantName}, after careful consideration we have decided not to move forward with your application for "${jobTitle}" at this time. We appreciate your interest and encourage you to apply for future openings.`,
    applicationId,
    jobId,
    jobTitle,
  });
}

async function notifyWithdrawal({ applicantName, applicantEmail, jobTitle, applicationId, jobId }) {
  await logNotification({
    applicantName,
    applicantEmail,
    notificationType: 'withdrawal_confirmed',
    subject: `Withdrawal confirmed — ${jobTitle}`,
    body: `Hi ${applicantName}, we have processed your request to withdraw from the "${jobTitle}" pipeline. We wish you all the best and hope to see you again in the future.`,
    applicationId,
    jobId,
    jobTitle,
  });
}

module.exports = {
  logNotification,
  notifyApplicationReceived,
  notifyPromotion,
  notifyAcknowledgementConfirmed,
  notifyDecay,
  notifyRejection,
  notifyWithdrawal,
};
