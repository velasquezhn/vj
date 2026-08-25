const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

function query(dbPath, sql) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.all(sql, (error, rows) => db.close(() => error ? reject(error) : resolve(rows)));
  });
}

describe('database bootstrap', () => {
  let directory;
  let dbPath;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vj-db-'));
    dbPath = path.join(directory, 'clean.sqlite');
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  test('migrates a clean database idempotently with required tables and columns', async () => {
    const env = { ...process.env, DB_PATH: dbPath, NODE_ENV: 'test' };
    execFileSync(process.execPath, ['scripts/migrate-database.js'], { cwd: path.join(__dirname, '..'), env });
    execFileSync(process.execPath, ['scripts/migrate-database.js'], { cwd: path.join(__dirname, '..'), env });
    const tables = await query(dbPath, "SELECT name FROM sqlite_master WHERE type='table'");
    expect(tables.map((row) => row.name)).toEqual(expect.arrayContaining(['Admins', 'Reservations', 'UserStates', 'WhatsAppEvents']));
    const columns = await query(dbPath, 'PRAGMA table_info(Reservations)');
    expect(columns.map((row) => row.name)).toEqual(expect.arrayContaining(['personas', 'comprobante_nombre_archivo']));
  });

  test('seeds cabins and activities without creating duplicates', async () => {
    const env = { ...process.env, DB_PATH: dbPath, NODE_ENV: 'test' };
    execFileSync(process.execPath, ['scripts/migrate-database.js'], { cwd: path.join(__dirname, '..'), env });
    execFileSync(process.execPath, ['scripts/seed-database.js'], { cwd: path.join(__dirname, '..'), env });
    execFileSync(process.execPath, ['scripts/seed-database.js'], { cwd: path.join(__dirname, '..'), env });
    const counts = await query(dbPath, 'SELECT (SELECT COUNT(*) FROM Cabins) AS cabins, (SELECT COUNT(*) FROM Activities) AS activities');
    expect(counts[0].cabins).toBeGreaterThan(0);
    expect(counts[0].activities).toBeGreaterThan(0);
    const duplicateNames = await query(dbPath, 'SELECT name FROM Cabins GROUP BY name HAVING COUNT(*) > 1');
    expect(duplicateNames).toHaveLength(0);
  });

  test('creates a consistent SQLite backup through the online backup API', async () => {
    const backupDir = path.join(directory, 'backups');
    const env = { ...process.env, DB_PATH: dbPath, BACKUP_DIR: backupDir, BACKUP_VERIFY: 'true', NODE_ENV: 'test' };
    execFileSync(process.execPath, ['scripts/migrate-database.js'], { cwd: path.join(__dirname, '..'), env });
    execFileSync(process.execPath, ['scripts/manage-backup.js', 'create'], { cwd: path.join(__dirname, '..'), env });
    const backups = fs.readdirSync(backupDir).filter((name) => name.endsWith('.sqlite'));
    expect(backups).toHaveLength(1);
    const integrity = await query(path.join(backupDir, backups[0]), 'PRAGMA integrity_check');
    expect(integrity[0].integrity_check).toBe('ok');
  });
});
