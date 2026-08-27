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
INSERT OR IGNORE INTO AppSettings(setting_key, setting_value) VALUES ('payment_deposit_percentage', '50');
INSERT OR IGNORE INTO AppSettings(setting_key, setting_value) VALUES ('payment_bank_accounts', '[]');
INSERT OR IGNORE INTO AppSettings(setting_key, setting_value) VALUES ('payment_notes', '');
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON Reservations(cabin_id, start_date, end_date, status);
CREATE INDEX IF NOT EXISTS idx_reservations_user ON Reservations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_states_expires ON UserStates(expires_at);
CREATE INDEX IF NOT EXISTS idx_activities_menu ON Activities(activo, incluir_en_menu, orden_menu);
INSERT OR IGNORE INTO SchemaMigrations(version) VALUES (1);
`;

const compatibilityColumns = {
  Admins: ['last_login TEXT'],
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
  // Compatibilidad con solicitudes creadas por el flujo anterior de una sola aprobación.
  await exec(`UPDATE Reservations SET status = 'pendiente_verificacion'
    WHERE status = 'pendiente' AND comprobante_nombre_archivo IS NOT NULL`);
  await exec(`UPDATE Reservations SET status = 'pendiente_autorizacion'
    WHERE status = 'pendiente' AND comprobante_nombre_archivo IS NULL`);
  console.log(`Database migrated: ${dbPath}`);
}

migrate().then(() => db.close()).catch((error) => {
  console.error(`Database migration failed: ${error.message}`);
  db.close(() => process.exit(1));
});
