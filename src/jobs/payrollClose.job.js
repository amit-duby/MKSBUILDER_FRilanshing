const logger = require('../common/utils/logger');
const payrollService = require('../modules/accounts/payroll.service');

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

let timer = null;
let running = false;

async function runOnce() {
  if (running) return null;
  running = true;
  try {
    return await payrollService.persistPreviousIstPeriod();
  } catch (error) {
    logger.error({ err: error }, 'Payroll auto-save job failed');
    return null;
  } finally {
    running = false;
  }
}

function startPayrollCloseJob(intervalMs = DEFAULT_INTERVAL_MS) {
  if (timer) return timer;

  // Catch up on boot in case the 1st IST run was missed while the API was down.
  setTimeout(() => {
    runOnce().catch(() => {});
  }, 5000).unref();

  timer = setInterval(() => {
    runOnce().catch(() => {});
  }, intervalMs);
  timer.unref();

  logger.info({ intervalMs }, 'Payroll auto-save job scheduled');
  return timer;
}

function stopPayrollCloseJob() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = {
  startPayrollCloseJob,
  stopPayrollCloseJob,
  runOnce,
};
