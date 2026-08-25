require('dotenv').config();
const { startServer } = require('./adminServer');
const { closeDatabase } = require('./db');
const backupService = require('./services/backupService');

const server = startServer();
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  server.close(async () => {
    try {
      backupService.stop();
      await closeDatabase();
      process.exit(0);
    } catch (error) {
      console.error('Graceful shutdown failed:', error.message);
      process.exit(1);
    }
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
