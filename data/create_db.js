const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const fs = require('fs');
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, 'bot_database.sqlite'));
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const schema = `
-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS Users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number TEXT UNIQUE NOT NULL,
  name TEXT,
  last_greeting_date DATE,
  role TEXT DEFAULT 'guest',
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de cabañas
CREATE TABLE IF NOT EXISTS Cabins (
  cabin_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  capacity INTEGER,
  description TEXT,
  price REAL,
  photos TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de fotos de cabañas
CREATE TABLE IF NOT EXISTS CabinPhotos (
  photo_id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabin_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cabin_id) REFERENCES Cabins(cabin_id)
);

-- Tabla de reservas
CREATE TABLE IF NOT EXISTS Reservations (
  reservation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabin_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL,
  total_price REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cabin_id) REFERENCES Cabins(cabin_id),
  FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

-- Tabla de actividades
CREATE TABLE IF NOT EXISTS Activities (
  activity_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL,
  photos TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para estados de conversación del bot
CREATE TABLE IF NOT EXISTS ConversationStates (
  state_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  state TEXT NOT NULL,
  data TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

-- Tabla de sesiones
CREATE TABLE IF NOT EXISTS Sessions (
  session_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_data TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(user_id)
);
`;

function initializeDatabase() {
  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      return;
    }
    console.log('Connected to SQLite database.');
  });

  db.exec(schema, (err) => {
    if (err) {
      console.error('Error creating tables:', err.message);
    } else {
      console.log('Database tables created or verified successfully.');
    }
    db.close();
  });
}

initializeDatabase();
