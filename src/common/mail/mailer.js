const { getConfig } = require('../../config/env');
const AppError = require('../errors/AppError');
const logger = require('../utils/logger');

let testInbox = [];

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

async function sendMail({ to, subject, text }) {
  const config = getConfig();
  const message = { to, subject, text };

  if (config.NODE_ENV === 'test') {
    testInbox.push(message);
    return message;
  }

  const resendConfig = assertResend(config);

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(resendConfig.apiKey);
    const result = await resend.emails.send({
      from: resendConfig.from,
      to: [to],
      subject,
      text,
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
