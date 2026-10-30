const { Resend } = require('resend');
const { getConfig } = require('../../config/env');
const AppError = require('../errors/AppError');
const logger = require('../utils/logger');

let testInbox = [];
let client = null;
let clientKey = '';

if (process.env.NODE_ENV !== 'test') {
  fetch('https://api.resend.com', { method: 'GET' }).catch(() => {});
}

function lastTestMail() {
  return testInbox.at(-1) || null;
}

function resetTestInbox() {
  testInbox = [];
}

function assertResend(config) {
  if (!config.resend || !config.resend.apiKey || !config.resend.from) {
    throw new AppError('Email delivery is not configured', 503, 'EMAIL_UNAVAILABLE');
  }
  return config.resend;
}

async function sendMail({ to, subject, text, html }) {
  const config = getConfig();
  const message = { to, subject, text, html };

  if (config.NODE_ENV === 'test') {
    testInbox.push(message);
    return message;
  }

  const resendConfig = assertResend(config);

  try {
    if (!client || clientKey !== resendConfig.apiKey) {
      client = new Resend(resendConfig.apiKey);
      clientKey = resendConfig.apiKey;
    }
    const result = await client.emails.send({
      from: resendConfig.from,
      to: [to],
      subject,
      text,
      html,
    });

    if (result && result.error) {
      logger.error({ err: result.error, to }, 'Resend rejected the email');
      throw new AppError('Could not send the password reset email', 502, 'EMAIL_FAILED');
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error({ err: error, to }, 'Failed to send email through Resend');
    throw new AppError('Could not send the password reset email', 502, 'EMAIL_FAILED');
  }

  return message;
}

module.exports = { sendMail, lastTestMail, resetTestInbox };
