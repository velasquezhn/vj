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
    expect(columns.map((row) => row.name)).toEqual(expect.arrayContaining([
      'personas', 'comprobante_nombre_archivo', 'confirmation_code', 'receipt_received_at',
      'reviewed_at', 'reviewed_by', 'rejection_reason', 'notification_status'
    ]));
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
    const cabinTypesWithPhotos = await query(dbPath, "SELECT type_key FROM CabinTypes WHERE fotos IS NOT NULL AND fotos != '[]'");
    expect(cabinTypesWithPhotos).toHaveLength(3);
    const activeCabinTypes = await query(dbPath, 'SELECT type_key FROM CabinTypes WHERE activo = 1');
    expect(activeCabinTypes).toHaveLength(3);
    const adminTable = await query(dbPath, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'WhatsAppAdmins'");
    expect(adminTable).toHaveLength(1);
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

  test('reenvía solicitudes pendientes a un administrador nuevo', async () => {
    const env = { ...process.env, DB_PATH: dbPath, NODE_ENV: 'test', WHATSAPP_ADMIN_NUMBERS: '' };
    execFileSync(process.execPath, ['scripts/migrate-database.js'], { cwd: path.join(__dirname, '..'), env });
    execFileSync(process.execPath, ['scripts/seed-database.js'], { cwd: path.join(__dirname, '..'), env });
    const script = `
      const { runExecute, runQuery, closeDatabase } = require('./db');
      const { sendPendingReviewsToAdmin } = require('./services/whatsappAdminService');
      (async () => {
        const user = await runExecute("INSERT INTO Users(phone_number,name) VALUES('50499990000','Prueba')");
        const cabin = (await runQuery('SELECT cabin_id FROM Cabins LIMIT 1'))[0];
        await runExecute(\`INSERT INTO Reservations(user_id,cabin_id,start_date,end_date,status,total_price,personas,comprobante_nombre_archivo,confirmation_code)
          VALUES(?,?, '2026-11-01','2026-11-03','pendiente',3000,2,'/comprobante.jpg','VJ-000001')\`, [user.lastID, cabin.cabin_id]);
        const sent = [];
        const result = await sendPendingReviewsToAdmin({ sendMessage: async (_to, body) => { sent.push(body); } }, '50487373838');
        if (result.sent !== 1 || !sent.some((body) => body.interactive)) process.exitCode = 2;
        await closeDatabase();
      })().catch((error) => { console.error(error); process.exit(1); });
    `;
    execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), env });
  });

  test('creates the pending reservation before requesting a receipt', async () => {
    const env = { ...process.env, DB_PATH: dbPath, NODE_ENV: 'test', WHATSAPP_ADMIN_NUMBERS: '' };
    execFileSync(process.execPath, ['scripts/migrate-database.js'], { cwd: path.join(__dirname, '..'), env });
    execFileSync(process.execPath, ['scripts/seed-database.js'], { cwd: path.join(__dirname, '..'), env });

    const script = `
      const { handleReservaState } = require('./controllers/flows/reservaFlowHandler');
      const { ESTADOS_RESERVA } = require('./controllers/reservaConstants');
      const { closeDatabase } = require('./db');
      const sent = [];
      const bot = { sendMessage: async (_to, content) => { sent.push(content); return {}; } };
      (async () => {
        await handleReservaState(bot, '50487373838@s.whatsapp.net', 'sí', ESTADOS_RESERVA.CONDICIONES, {
          nombre: 'Cliente Prueba', telefono: '50487373838', personas: 2, alojamiento: 'tortuga',
          fechaEntrada: '10/09/2026', fechaSalida: '12/09/2026', noches: 2, precioTotal: 3000
        }, {});
        if (!sent.some((item) => item.text && item.text.includes('SOLICITUD REGISTRADA'))) process.exitCode = 2;
        await closeDatabase();
      })().catch((error) => { console.error(error); process.exit(1); });
    `;
    execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), env });

    const reservations = await query(dbPath, `
      SELECT r.status, r.confirmation_code, u.name, u.phone_number
      FROM Reservations r JOIN Users u ON u.user_id = r.user_id
    `);
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toEqual(expect.objectContaining({
      status: 'pendiente', confirmation_code: 'VJ-000001', name: 'Cliente Prueba', phone_number: '50487373838'
    }));

    await query(dbPath, "UPDATE Reservations SET comprobante_nombre_archivo = '/comprobantes/prueba.pdf' WHERE reservation_id = 1");
    const approveScript = `
      const { approveReservation } = require('./services/reservationApprovalService');
      const { closeDatabase } = require('./db');
      (async () => {
        const result = await approveReservation(1, 99, { notify: async () => ({ ok: true }) });
        if (!result.ok || result.reservation.notification_status !== 'sent') process.exitCode = 3;
        await closeDatabase();
      })().catch((error) => { console.error(error); process.exit(1); });
    `;
    execFileSync(process.execPath, ['-e', approveScript], { cwd: path.join(__dirname, '..'), env });
    const approved = await query(dbPath, 'SELECT status, reviewed_by, reviewed_at, notification_status FROM Reservations WHERE reservation_id = 1');
    expect(approved[0]).toEqual(expect.objectContaining({
      status: 'confirmada', reviewed_by: 99, notification_status: 'sent'
    }));
    expect(approved[0].reviewed_at).toBeTruthy();
  });
});
