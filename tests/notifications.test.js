jest.mock('nodemailer');
const nodemailer = require('nodemailer');
const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'ok' });
nodemailer.createTransport.mockReturnValue({ sendMail: sendMailMock });

global.fetch = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

const { sendSlack, sendEmail, notifyRunComplete } = require('../notifications');

test('sendSlack posts JSON to webhook URL', async () => {
  await sendSlack('https://hooks.slack.com/test', 'Hello');
  expect(global.fetch).toHaveBeenCalledWith('https://hooks.slack.com/test',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Hello' }) }));
});

test('sendSlack is no-op when webhookUrl is empty', async () => {
  await sendSlack('', 'Hello');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('sendEmail calls nodemailer with correct fields', async () => {
  process.env.SMTP_HOST = 'smtp.test.com';
  process.env.SMTP_USER = 'u';
  process.env.SMTP_PASS = 'p';
  process.env.SMTP_FROM = 'From <f@t.com>';
  await sendEmail('to@test.com', 'Subj', '<p>Body</p>');
  expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'to@test.com', subject: 'Subj' }));
});

test('sendEmail is no-op when toEmail is empty', async () => {
  await sendEmail('', 'Subj', '<p>Body</p>');
  expect(sendMailMock).not.toHaveBeenCalled();
});

test('notifyRunComplete sends Slack and email', async () => {
  const checklist = {
    name: 'Test', slack_webhook_url: 'https://hooks.slack.com/x',
    notification_email: 'a@b.com',
    steps: [{ id: 's1', text: 'Do it', allow_note: false, skippable: false }]
  };
  const run = {
    runner_name: 'Alice', completed_at: '2026-04-16T10:00:00Z',
    responses: [{ step_id: 's1', answer: 'yes', note: '', answered_at: '2026-04-16T10:00:00Z' }]
  };
  await notifyRunComplete(checklist, run);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(sendMailMock).toHaveBeenCalledTimes(1);
});
