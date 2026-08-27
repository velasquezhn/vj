const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const dbPath = path.resolve(process.env.DB_PATH || './data/bot_database.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath);

const exec = (sql) => new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve()));
const all = (sql) => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));

const schema = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS SchemaMigrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS Users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT, phone_number TEXT UNIQUE NOT NULL, name TEXT,
  last_greeting_date TEXT, role TEXT NOT NULL DEFAULT 'guest', is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS Admins (
  admin_id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE,
  full_name TEXT, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 1,
  last_login TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS CabinTypes (
  cabin_type_id INTEGER PRIMARY KEY AUTOINCREMENT, type_id INTEGER UNIQUE, type_key TEXT UNIQUE NOT NULL,
  type_name TEXT, nombre TEXT NOT NULL, tipo TEXT, capacidad INTEGER NOT NULL DEFAULT 1,
  habitaciones INTEGER DEFAULT 1, baños INTEGER DEFAULT 1, precio_noche REAL NOT NULL DEFAULT 0,
  base_price REAL NOT NULL DEFAULT 0, moneda TEXT NOT NULL DEFAULT 'HNL', fotos TEXT NOT NULL DEFAULT '[]',
  comodidades TEXT NOT NULL DEFAULT '[]', ubicacion TEXT NOT NULL DEFAULT '{}', descripcion TEXT DEFAULT '',
  orden INTEGER NOT NULL DEFAULT 999, activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS trg_cabin_types_alias AFTER INSERT ON CabinTypes WHEN NEW.type_id IS NULL
BEGIN UPDATE CabinTypes SET type_id = NEW.cabin_type_id, type_name = COALESCE(NEW.type_name, NEW.nombre) WHERE cabin_type_id = NEW.cabin_type_id; END;
CREATE TABLE IF NOT EXISTS Cabins (
  cabin_id INTEGER PRIMARY KEY AUTOINCREMENT, cabin_type_id INTEGER, name TEXT NOT NULL, capacity INTEGER NOT NULL DEFAULT 1,
  description TEXT DEFAULT '', price REAL NOT NULL DEFAULT 0, base_price REAL NOT NULL DEFAULT 0,
  price_per_night REAL NOT NULL DEFAULT 0, price_per_additional_person REAL NOT NULL DEFAULT 0,
  photos TEXT DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cabin_type_id) REFERENCES CabinTypes(cabin_type_id)
);
CREATE TABLE IF NOT EXISTS CabinPhotos (
  photo_id INTEGER PRIMARY KEY AUTOINCREMENT, cabin_id INTEGER NOT NULL, url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (cabin_id) REFERENCES Cabins(cabin_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS Reservations (
  reservation_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, cabin_id INTEGER NOT NULL,
  start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pendiente_autorizacion', total_price REAL NOT NULL DEFAULT 0,
  personas INTEGER NOT NULL DEFAULT 1, comprobante_nombre_archivo TEXT, grupoMessageId TEXT,
  confirmation_code TEXT UNIQUE, receipt_received_at TEXT, reviewed_at TEXT, reviewed_by INTEGER,
  rejection_reason TEXT, notification_status TEXT, payment_authorized_at TEXT,
  payment_authorized_by INTEGER, payment_due_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (date(end_date) > date(start_date)), CHECK (personas > 0),
  FOREIGN KEY (user_id) REFERENCES Users(user_id), FOREIGN KEY (cabin_id) REFERENCES Cabins(cabin_id)
);
CREATE TABLE IF NOT EXISTS UserStates (
  user_id TEXT PRIMARY KEY, state TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT
);
CREATE TABLE IF NOT EXISTS ConversationStates (
  state_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_number TEXT, state TEXT NOT NULL, data TEXT DEFAULT '{}',
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS Sessions (
  session_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, session_data TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS Activities (
  activity_id INTEGER PRIMARY KEY AUTOINCREMENT, activity_key TEXT UNIQUE, name TEXT, nombre TEXT,
  categoria TEXT, subcategoria TEXT, description TEXT, descripcion TEXT, descripcion_corta TEXT,
  ubicacion TEXT DEFAULT '{}', contacto TEXT DEFAULT '{}', horarios TEXT DEFAULT '{}', precios TEXT DEFAULT '{}',
  servicios TEXT DEFAULT '[]', dificultad TEXT, duracion TEXT, capacidad_maxima INTEGER DEFAULT 0,
  edad_minima INTEGER DEFAULT 0, idiomas TEXT DEFAULT '[]', recomendaciones TEXT DEFAULT '{}', disponibilidad TEXT DEFAULT '{}',
  multimedia TEXT DEFAULT '{}', calificacion TEXT DEFAULT '{}', certificaciones TEXT DEFAULT '[]', photos TEXT,
  price REAL DEFAULT 0, orden INTEGER DEFAULT 999, activo INTEGER DEFAULT 1, incluir_en_menu INTEGER DEFAULT 1,
  orden_menu INTEGER DEFAULT 999, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS WhatsAppEvents (
  message_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, status TEXT, received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS WhatsAppAdmins (
  whatsapp_admin_id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS AppSettings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER
);
CREATE TABLE IF NOT EXISTS AdminAuditLogs (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  username TEXT,
  role TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES Admins(admin_id)
);
CREATE TABLE IF NOT EXISTS OutboundMessages (
  outbound_id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT UNIQUE,
  recipient TEXT NOT NULL,
  message_kind TEXT NOT NULL DEFAULT 'generic',
  payload_json TEXT NOT NULL DEFAULT '{}',
  reservation_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error_code TEXT,
  provider_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  FOREIGN KEY (reservation_id) REFERENCES Reservations(reservation_id)
);
INSERT OR IGNORE INTO AppSettings(setting_key, setting_value) VALUES ('payment_deposit_percentage', '50');
INSERT OR IGNORE INTO AppSettings(setting_key, setting_value) VALUES ('payment_bank_accounts', '[]');
INSERT OR IGNORE INTO AppSettings(setting_key, setting_value) VALUES ('payment_notes', '');
INSERT OR IGNORE INTO AppSettings(setting_key, setting_value) VALUES ('check_in_time', '14:00');
INSERT OR IGNORE INTO AppSettings(setting_key, setting_value) VALUES ('check_out_time', '11:00');
INSERT OR IGNORE INTO AppSettings(setting_key, setting_value) VALUES ('office_hours', '08:00-16:00');
INSERT OR IGNORE INTO AppSettings(setting_key, setting_value) VALUES ('support_availability', '24/7');
INSERT OR IGNORE INTO AppSettings(setting_key, setting_value) VALUES ('refund_policy', 'no_refunds');
INSERT OR IGNORE INTO AppSettings(setting_key, setting_value) VALUES ('data_retention_days', '730');
INSERT OR IGNORE INTO AppSettings(setting_key, setting_value) VALUES ('review_enabled', 'true');
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON Reservations(cabin_id, start_date, end_date, status);
CREATE INDEX IF NOT EXISTS idx_reservations_user ON Reservations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_states_expires ON UserStates(expires_at);
CREATE INDEX IF NOT EXISTS idx_activities_menu ON Activities(activo, incluir_en_menu, orden_menu);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON AdminAuditLogs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON AdminAuditLogs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_due ON OutboundMessages(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbound_reservation ON OutboundMessages(reservation_id, created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_reservation_no_overlap_insert
BEFORE INSERT ON Reservations
WHEN NEW.status IN ('pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion', 'confirmada', 'confirmado')
AND EXISTS (
  SELECT 1 FROM Reservations r WHERE r.cabin_id = NEW.cabin_id
  AND r.status IN ('pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion', 'confirmada', 'confirmado')
  AND date(r.start_date) < date(NEW.end_date) AND date(r.end_date) > date(NEW.start_date)
)
BEGIN SELECT RAISE(ABORT, 'CABIN_DATE_CONFLICT'); END;
CREATE TRIGGER IF NOT EXISTS trg_reservation_no_overlap_update
BEFORE UPDATE OF cabin_id, start_date, end_date, status ON Reservations
WHEN NEW.status IN ('pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion', 'confirmada', 'confirmado')
AND EXISTS (
  SELECT 1 FROM Reservations r WHERE r.cabin_id = NEW.cabin_id AND r.reservation_id != NEW.reservation_id
  AND r.status IN ('pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion', 'confirmada', 'confirmado')
  AND date(r.start_date) < date(NEW.end_date) AND date(r.end_date) > date(NEW.start_date)
)
BEGIN SELECT RAISE(ABORT, 'CABIN_DATE_CONFLICT'); END;
INSERT OR IGNORE INTO SchemaMigrations(version) VALUES (1);
`;

const compatibilityColumns = {
  Admins: ['last_login TEXT', 'must_change_password INTEGER NOT NULL DEFAULT 0', 'token_version INTEGER NOT NULL DEFAULT 1'],
  Cabins: ['cabin_type_id INTEGER', 'base_price REAL DEFAULT 0', 'price_per_night REAL DEFAULT 0', 'price_per_additional_person REAL DEFAULT 0', 'is_active INTEGER DEFAULT 1'],
  Reservations: [
    'personas INTEGER DEFAULT 1', 'comprobante_nombre_archivo TEXT', 'grupoMessageId TEXT',
    'confirmation_code TEXT', 'receipt_received_at TEXT', 'reviewed_at TEXT', 'reviewed_by INTEGER',
    'rejection_reason TEXT', 'notification_status TEXT', 'payment_authorized_at TEXT',
    'payment_authorized_by INTEGER', 'payment_due_at TEXT'
  ],
  ConversationStates: ['user_number TEXT', 'created_at TEXT', 'updated_at TEXT'],
  Activities: ['activity_key TEXT', 'nombre TEXT', 'categoria TEXT', 'subcategoria TEXT', 'descripcion TEXT', 'descripcion_corta TEXT', 'ubicacion TEXT', 'contacto TEXT', 'horarios TEXT', 'precios TEXT', 'servicios TEXT', 'dificultad TEXT', 'duracion TEXT', 'capacidad_maxima INTEGER', 'edad_minima INTEGER', 'idiomas TEXT', 'recomendaciones TEXT', 'disponibilidad TEXT', 'multimedia TEXT', 'calificacion TEXT', 'certificaciones TEXT', 'orden INTEGER DEFAULT 999', 'activo INTEGER DEFAULT 1', 'incluir_en_menu INTEGER DEFAULT 1', 'orden_menu INTEGER DEFAULT 999']
};

async function migrate() {
  await exec(schema);
  for (const [table, definitions] of Object.entries(compatibilityColumns)) {
    const columns = new Set((await all(`PRAGMA table_info("${table}")`)).map((row) => row.name));
    for (const definition of definitions) {
      const name = definition.split(/\s+/)[0];
      if (!columns.has(name)) await exec(`ALTER TABLE "${table}" ADD COLUMN ${definition}`);
    }
  }
  await exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_confirmation_code ON Reservations(confirmation_code)');
  await exec(`UPDATE Admins SET role = 'superadmin' WHERE lower(replace(role, '-', '_')) = 'super_admin'`);
  // El panel nunca debe quedar sin un superadministrador activo. En instalaciones
  // antiguas se promueve únicamente la cuenta activa más antigua.
  await exec(`UPDATE Admins SET role = 'superadmin', updated_at = CURRENT_TIMESTAMP
    WHERE admin_id = (SELECT admin_id FROM Admins WHERE is_active = 1 ORDER BY admin_id LIMIT 1)
      AND NOT EXISTS (
        SELECT 1 FROM Admins WHERE is_active = 1
          AND lower(replace(role, '-', '_')) IN ('superadmin', 'super_admin')
      )`);
  // Compatibilidad con solicitudes creadas por el flujo anterior de una sola aprobación.
  await exec(`UPDATE Reservations SET status = 'pendiente_verificacion'
    WHERE status = 'pendiente' AND comprobante_nombre_archivo IS NOT NULL`);
  await exec(`UPDATE Reservations SET status = 'pendiente_autorizacion'
    WHERE status = 'pendiente' AND comprobante_nombre_archivo IS NULL`);
  await exec(`DELETE FROM WhatsAppAdmins WHERE phone_number IN ('92083526', '50492083526')`);
  await exec(`INSERT INTO WhatsAppAdmins(phone_number, display_name, is_active)
    VALUES ('50487373838', 'Carlos Velasquez', 1)
    ON CONFLICT(phone_number) DO UPDATE SET display_name = excluded.display_name, is_active = 1, updated_at = CURRENT_TIMESTAMP`);
  await exec(`INSERT INTO WhatsAppAdmins(phone_number, display_name, is_active)
    VALUES ('50499705022', 'Gregorio Gonzalez', 1)
    ON CONFLICT(phone_number) DO UPDATE SET display_name = excluded.display_name, is_active = 1, updated_at = CURRENT_TIMESTAMP`);
  console.log(`Database migrated: ${dbPath}`);
}

migrate().then(() => db.close()).catch((error) => {
  console.error(`Database migration failed: ${error.message}`);
  db.close(() => process.exit(1));
});
