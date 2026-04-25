const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const logsDir = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logFile = path.join(logsDir, 'automation.log');

function writeLog(level, message) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
  });
  fs.appendFileSync(logFile, entry + '\n', 'utf8');
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${level.toUpperCase()}] ${message}`);
  }
}

module.exports = {
  info: (msg) => writeLog('info', msg),
  warn: (msg) => writeLog('warn', msg),
  error: (msg) => writeLog('error', msg),
};
