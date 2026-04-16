// notifications.js
require('dotenv').config();
const nodemailer = require('nodemailer');

async function sendSlack(webhookUrl, text) {
  if (!webhookUrl) return;
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error(`Slack webhook error: ${res.status}`);
}

async function sendEmail(toEmail, subject, html) {
  if (!toEmail) return;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transport.sendMail({ from: process.env.SMTP_FROM || 'Checklister', to: toEmail, subject, html });
}

async function notifyRunComplete(checklist, run) {
  const yes = run.responses.filter(r => r.answer === 'yes').length;
  const no = run.responses.filter(r => r.answer === 'no').length;
  const skipped = run.responses.filter(r => r.answer === 'skip').length;
  const runner = run.runner_name || 'Anonymous';
  const slackText = `✅ *${checklist.name}* completed by ${runner}\n${run.responses.length} steps · Yes: ${yes} · No: ${no} · Skipped: ${skipped}`;
  const rows = run.responses.map(r => {
    const step = checklist.steps.find(s => s.id === r.step_id);
    const icon = r.answer === 'yes' ? '✓' : r.answer === 'no' ? '✗' : '–';
    const note = r.note ? `<br><span style="color:#888;font-size:12px;">${r.note}</span>` : '';
    return `<tr><td style="padding:6px 4px;color:#666;">${icon}</td><td style="padding:6px 8px;">${step ? step.text : r.step_id}${note}</td></tr>`;
  }).join('');
  const html = `<h2>${checklist.name} — Complete</h2><p>Runner: <strong>${runner}</strong> · ${new Date(run.completed_at).toLocaleString()}</p><table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">${rows}</table>`;
  await Promise.all([
    sendSlack(checklist.slack_webhook_url, slackText),
    sendEmail(checklist.notification_email, `✅ ${checklist.name} completed by ${runner}`, html)
  ]);
}

module.exports = { sendSlack, sendEmail, notifyRunComplete };
