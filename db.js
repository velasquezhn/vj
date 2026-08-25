const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('./config/logger');

const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, 'data', 'bot_database.sqlite'));
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    logger.error('Error opening database', { error: err.message });
  } else {
    db.configure('busyTimeout', Number(process.env.DB_BUSY_TIMEOUT_MS || 5000));
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;', (pragmaError) => {
      if (pragmaError) logger.error('Error configuring SQLite', { error: pragmaError.message });
    });
    logger.info('SQLite connected', { database: path.basename(DB_PATH) });
  }
});

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function runExecute(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        logger.error('Database execution failed', { error: err.message });
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

function closeDatabase() {
  return new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
}

module.exports = {
  runQuery,
  runExecute,
  db,
  DB_PATH,
  closeDatabase
};
