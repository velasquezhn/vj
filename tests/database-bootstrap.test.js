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

function execute(dbPath, sql) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.exec(sql, (error) => db.close(() => error ? reject(error) : resolve()));
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
    expect(tables.map((row) => row.name)).toEqual(expect.arrayContaining(['Admins', 'Reservations', 'UserStates', 'WhatsAppEvents', 'AppSettings']));
    const columns = await query(dbPath, 'PRAGMA table_info(Reservations)');
    expect(columns.map((row) => row.name)).toEqual(expect.arrayContaining([
      'personas', 'comprobante_nombre_archivo', 'confirmation_code', 'receipt_received_at',
      'reviewed_at', 'reviewed_by', 'rejection_reason', 'notification_status',
      'payment_authorized_at', 'payment_authorized_by', 'payment_due_at'
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

  test('prevents two active reservations from occupying the same cabin and dates', async () => {
    const env = { ...process.env, DB_PATH: dbPath, NODE_ENV: 'test' };
    execFileSync(process.execPath, ['scripts/migrate-database.js'], { cwd: path.join(__dirname, '..'), env });
    execFileSync(process.execPath, ['scripts/seed-database.js'], { cwd: path.join(__dirname, '..'), env });
    await execute(dbPath, `INSERT INTO Users(phone_number,name) VALUES('50499990001','Uno'),('50499990002','Dos');
      INSERT INTO Reservations(user_id,cabin_id,start_date,end_date,status,total_price,personas)
      VALUES(1,1,'2026-12-10','2026-12-12','pendiente_autorizacion',3000,2);`);
    await expect(execute(dbPath, `INSERT INTO Reservations(user_id,cabin_id,start_date,end_date,status,total_price,personas)
      VALUES(2,1,'2026-12-11','2026-12-13','pendiente_autorizacion',3000,2);`))
      .rejects.toThrow('CABIN_DATE_CONFLICT');
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
          VALUES(?,?, '2026-11-01','2026-11-03','pendiente_verificacion',3000,2,'/comprobante.jpg','VJ-000001')\`, [user.lastID, cabin.cabin_id]);
        const sent = [];
        const result = await sendPendingReviewsToAdmin({ sendMessage: async (_to, body) => { sent.push(body); } }, '50487373838');
        if (result.sent !== 1 || !sent.some((body) => body.interactive)) process.exitCode = 2;
        await closeDatabase();
      })().catch((error) => { console.error(error); process.exit(1); });
    `;
    execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), env });
  });

  test('requires authorization before receipt and final confirmation', async () => {
    const env = { ...process.env, DB_PATH: dbPath, RECEIPTS_DIR: path.join(directory, 'receipts'), NODE_ENV: 'test', WHATSAPP_ADMIN_NUMBERS: '' };
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
      status: 'pendiente_autorizacion', confirmation_code: 'VJ-000001', name: 'Cliente Prueba', phone_number: '50487373838'
    }));

    const blockedReceiptScript = `
      const { guardarComprobante } = require('./services/comprobanteService');
      const { closeDatabase } = require('./db');
      (async () => {
        let blocked = false;
        try {
          await guardarComprobante(1, Buffer.from('no-autorizado'), 'application/pdf', 'no-autorizado.pdf');
        } catch (error) {
          blocked = /no está habilitado/.test(error.message);
        }
        if (!blocked) process.exitCode = 3;
        await closeDatabase();
      })().catch((error) => { console.error(error); process.exit(1); });
    `;
    execFileSync(process.execPath, ['-e', blockedReceiptScript], { cwd: path.join(__dirname, '..'), env });
    expect((await query(dbPath, 'SELECT status, comprobante_nombre_archivo FROM Reservations WHERE reservation_id = 1'))[0])
      .toEqual({ status: 'pendiente_autorizacion', comprobante_nombre_archivo: null });

    const blockedAuthorizationScript = `
      const { authorizePayment } = require('./services/reservationApprovalService');
      const { closeDatabase } = require('./db');
      (async () => {
        const result = await authorizePayment(1, 99, { notify: async () => ({ ok: true }) });
        if (result.ok || result.code !== 'PAYMENT_SETTINGS_INCOMPLETE') process.exitCode = 4;
        await closeDatabase();
      })().catch((error) => { console.error(error); process.exit(1); });
    `;
    execFileSync(process.execPath, ['-e', blockedAuthorizationScript], { cwd: path.join(__dirname, '..'), env });
    await query(dbPath, `UPDATE AppSettings SET setting_value = '["BAC - Ahorros HNL - 123456 - Villas Julie"]'
      WHERE setting_key = 'payment_bank_accounts'`);

    const authorizeScript = `
      const { authorizePayment } = require('./services/reservationApprovalService');
      const { closeDatabase } = require('./db');
      (async () => {
        const result = await authorizePayment(1, 99, { notify: async () => ({ ok: true }) });
        if (!result.ok || result.reservation.status !== 'esperando_pago') process.exitCode = 5;
        await closeDatabase();
      })().catch((error) => { console.error(error); process.exit(1); });
    `;
    execFileSync(process.execPath, ['-e', authorizeScript], { cwd: path.join(__dirname, '..'), env });
    const authorized = await query(dbPath, 'SELECT status, payment_authorized_by, payment_authorized_at FROM Reservations WHERE reservation_id = 1');
    expect(authorized[0].status).toBe('esperando_pago');
    expect(authorized[0].payment_authorized_by).toBe(99);
    expect(authorized[0].payment_authorized_at).toBeTruthy();

    const receiptScript = `
      const { guardarComprobante } = require('./services/comprobanteService');
      const { closeDatabase } = require('./db');
      (async () => {
        const result = await guardarComprobante(1, Buffer.from('pdf-prueba'), 'application/pdf', 'prueba.pdf');
        if (!result || result.status !== 'pendiente_verificacion') process.exitCode = 6;
        await closeDatabase();
      })().catch((error) => { console.error(error); process.exit(1); });
    `;
    execFileSync(process.execPath, ['-e', receiptScript], { cwd: path.join(__dirname, '..'), env });
    const approveScript = `
      const { approveReservation } = require('./services/reservationApprovalService');
      const { closeDatabase } = require('./db');
      (async () => {
        const result = await approveReservation(1, 99, { notify: async () => ({ ok: true }) });
        if (!result.ok || result.reservation.notification_status !== 'sent') process.exitCode = 7;
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
