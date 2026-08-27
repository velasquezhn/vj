const moment = require('moment');
require('moment/locale/es');
const db = require('../db');

// Función original que trae todas las cabañas
const loadCabañas = async () => {
  try {
    const cabins = await db.runQuery('SELECT * FROM Cabins');
    for (const cabin of cabins) {
      const reservations = await db.runQuery(
        'SELECT * FROM Reservations WHERE cabin_id = ?',
        [cabin.cabin_id]
      );
      cabin.reservas = reservations;
    }
    return cabins;
  } catch (e) {
    console.error('Error loading cabins from DB:', e);
    return [];
  }
};

// Nueva función que devuelve solo los tipos únicos para el menú
const loadTiposCabañas = async () => {
  try {
    // Obtener un representante de cada tipo
    const tiposQuery = `
      SELECT 
        type,
        MIN(cabin_id) as cabin_id,
        name,
        capacity,
        description,
        price,
        photos
      FROM Cabins 
      WHERE type IS NOT NULL 
      GROUP BY type 
      ORDER BY 
        CASE type 
          WHEN 'tortuga' THEN 1 
          WHEN 'delfin' THEN 2 
          WHEN 'tiburon' THEN 3 
          ELSE 4 
        END
    `;
    
    const tipos = await db.runQuery(tiposQuery);
    
    // Agregar información adicional de cabañas.json para mantener compatibilidad
    const tiposConInfo = tipos.map(tipo => {
      const infoExtra = getExtraInfoForType(tipo.type);
      return {
        ...tipo,
        ...infoExtra,
        // Mantener campos originales para compatibilidad
        nombre: tipo.name.replace(/\s\d+$/, ''), // Remover número al final
        tipo: getDisplayType(tipo.type),
        capacidad: tipo.capacity,
        precio_noche: tipo.price,
        reservas: [] // Se llenará si es necesario
      };
    });
    
    return tiposConInfo;
  } catch (e) {
    console.error('Error loading cabin types from DB:', e);
    return [];
  }
};

// Información adicional para cada tipo (desde cabañas.json)
const getExtraInfoForType = (type) => {
  const extraInfo = {
    tortuga: {
      habitaciones: 1,
      baños: 1,
      fotos: [
        "https://res.cloudinary.com/dpajxjfyj/image/upload/v1751586373/cab1_1_pckc3x.jpg",
        "https://res.cloudinary.com/dpajxjfyj/image/upload/v1751586373/cab1_2_ov26wn.jpg",
        "https://res.cloudinary.com/dpajxjfyj/image/upload/v1751586373/cab1_3_q3wrdj.jpg",
        "https://res.cloudinary.com/dpajxjfyj/image/upload/v1751586373/cab1_4_e9prqi.jpg"
      ],
      comodidades: ["Piscina privada", "WiFi", "Cocina equipada"],
      ubicacion: {
        ciudad: "Tela Atlántida",
        departamento: "Atlántida"
      }
    },
    delfin: {
      habitaciones: 2,
      baños: 2,
      fotos: [
        "https://res.cloudinary.com/dpajxjfyj/image/upload/v1751931157/WhatsApp_Image_2025-07-07_at_12.24.40_PM_2_yfxzze.jpg",
        "https://res.cloudinary.com/dpajxjfyj/image/upload/v1751931158/WhatsApp_Image_2025-07-07_at_12.24.41_PM_1_rgrpaf.jpg",
        "https://res.cloudinary.com/dpajxjfyj/image/upload/v1751931157/WhatsApp_Image_2025-07-07_at_12.24.41_PM_ok5spo.jpg"
      ],
      comodidades: ["Piscina privada", "WiFi", "Cocina equipada"],
      ubicacion: {
        ciudad: "Tela Atlántida",
        departamento: "Atlántida"
      }
    },
    tiburon: {
      habitaciones: 3,
      baños: 2,
      fotos: [
        "https://res.cloudinary.com/dpajxjfyj/image/upload/v1751927030/cab2_11_pfog3z.jpg",
        "https://res.cloudinary.com/dpajxjfyj/image/upload/v1751927030/cab2_4_dyt1oo.jpg",
        "https://res.cloudinary.com/dpajxjfyj/image/upload/v1751927030/cab2_3_tvwtpn.jpg"
      ],
      comodidades: ["Piscina privada", "WiFi", "Cocina equipada"],
      ubicacion: {
        ciudad: "Tela Atlántida",
        departamento: "Atlántida"
      }
    }
  };
  
  return extraInfo[type] || {};
};

// Convertir tipo de base a nombre para display
const getDisplayType = (type) => {
  const displayTypes = {
    'tortuga': '3 personas',
    'delfin': '6 personas', 
    'tiburon': '9 personas'
  };
  return displayTypes[type] || type;
};

const checkDisponibilidad = (cabaña, fechaEntrada, fechaSalida) => {
  return !cabaña.reservas.some(reserva => {
    if (reserva.status !== 'confirmada') return false;
    const resInicio = moment(reserva.start_date);
    const resFin = moment(reserva.end_date);
    return fechaEntrada.isBefore(resFin) && fechaSalida.isAfter(resInicio);
  });
};

const parsearFechas = (texto) => {
  const meses = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
  };
  
  const match = texto.match(/(\\d{1,2})[\\s\\-]*(?:al?)?[\\s\\-]*(\\d{1,2})?\\s*(?:de)?\\s*(\\w+)/i);
  
  if (!match) return null;
  
  const diaIn = parseInt(match[1]);
  const mesNombre = match[3].toLowerCase();
  const año = new Date().getFullYear();
  
  const diaOut = match[2] ? parseInt(match[2]) : diaIn;
  
  return {
    entrada: moment(new Date(año, meses[mesNombre], diaIn)),
    salida: moment(new Date(año, meses[mesNombre], diaOut))
  };
};

const addReserva = async (cabañaId, userId, reservaData) => {
  try {
    const sql = `
      INSERT INTO Reservations (cabin_id, user_id, start_date, end_date, status, total_price, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `;
    const params = [
      cabañaId,
      userId,
      reservaData.start_date,
      reservaData.end_date,
      reservaData.status,
      reservaData.total_price || 0
    ];
    const result = await db.runExecute(sql, params);
    return result.lastID ? true : false;
  } catch (e) {
    console.error('Error adding reservation:', e);
    return false;
  }
};

const updateCabin = async (cabinId, cabinData) => {
  try {
    const sql = `
      UPDATE Cabins SET name = ?, capacity = ?, price = ?, description = ?, updated_at = datetime('now')
      WHERE cabin_id = ?
    `;
    const params = [
      cabinData.name,
      cabinData.capacity,
      cabinData.price,
      cabinData.description,
      cabinId
    ];
    const result = await db.runExecute(sql, params);
    return result.changes > 0;
  } catch (e) {
    console.error('Error updating cabin:', e);
    return false;
  }
};

const deleteCabin = async (cabinId) => {
  try {
    const sql = `DELETE FROM Cabins WHERE cabin_id = ?`;
    const result = await db.runExecute(sql, [cabinId]);
    return result.changes > 0;
  } catch (e) {
    console.error('Error deleting cabin:', e);
    return false;
  }
};

const updateReservation = async (reservationId, reservationData) => {
  try {
    const sql = `
      UPDATE Reservations SET start_date = ?, end_date = ?, status = ?, total_price = ?, updated_at = datetime('now')
      WHERE reservation_id = ?
    `;
    const params = [
      reservationData.start_date,
      reservationData.end_date,
      reservationData.status,
      reservationData.total_price,
      reservationId
    ];
    const result = await db.runExecute(sql, params);
    return result.changes > 0;
  } catch (e) {
    console.error('Error updating reservation:', e);
    return false;
  }
};

const deleteReservation = async (reservationId) => {
  try {
    const sql = `DELETE FROM Reservations WHERE reservation_id = ?`;
    const result = await db.runExecute(sql, [reservationId]);
    return result.changes > 0;
  } catch (e) {
    console.error('Error deleting reservation:', e);
    return false;
  }
};

const createCabin = async (cabinData) => {
  try {
    const sql = `
      INSERT INTO Cabins (name, capacity, price, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `;
    const params = [
      cabinData.name,
      cabinData.capacity,
      cabinData.price,
      cabinData.description
    ];
    const result = await db.runExecute(sql, params);
    return result.lastID ? true : false;
  } catch (e) {
    console.error('Error creating cabin:', e);
    return false;
  }
};

const loadReservations = async () => {
  try {
    console.log('Intentando cargar reservas desde la base de datos...');
    const sql = `
      SELECT r.*, u.name as user_name, u.phone_number, r.comprobante_nombre_archivo
      FROM Reservations r
      LEFT JOIN Users u ON r.user_id = u.user_id
      ORDER BY r.start_date DESC
    `;
    const reservations = await db.runQuery(sql);
    console.log('Reservas cargadas:', reservations);
    return reservations;
  } catch (e) {
    console.error('Error cargando reservas desde la base de datos:', e);
    return [];
  }
};

const getLatestPendingReservation = async () => {
  try {
    const sql = `
      SELECT * FROM Reservations
      WHERE status IN ('pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const results = await db.runQuery(sql);
    return results.length > 0 ? results[0] : null;
  } catch (e) {
    console.error('Error fetching latest pending reservation:', e);
    return null;
  }
};

const updateReservationStatus = async (reservationId, status) => {
  try {
    const sql = `
      UPDATE Reservations
      SET status = ?, updated_at = datetime('now')
      WHERE reservation_id = ?
    `;
    const params = [status, reservationId];
    const result = await db.runExecute(sql, params);
    return result.changes > 0;
  } catch (e) {
    console.error('Error updating reservation status:', e);
    return false;
  }
};

async function getReservationById(reservationId) {
  try {
    const sql = `
      SELECT * FROM Reservations WHERE reservation_id = ?
    `;
    const results = await db.runQuery(sql, [reservationId]);
    return results.length > 0 ? results[0] : null;
  } catch (e) {
    console.error('Error fetching reservation by ID:', e);
    return null;
  }
}

async function getReservationByPhone(phoneNumber) {
  try {
    const sql = `
      SELECT r.*, u.phone_number
      FROM Reservations r
      JOIN Users u ON r.user_id = u.user_id
      WHERE u.phone_number = ?
      ORDER BY r.created_at DESC
      LIMIT 1
    `;
    const results = await db.runQuery(sql, [phoneNumber]);
    return results.length > 0 ? results[0] : null;
  } catch (e) {
    console.error('Error fetching reservation by phone:', e);
    return null;
  }
}

module.exports = {
  loadCabañas,           // Función original para todas las cabañas
  loadTiposCabañas,      // Nueva función para tipos únicos
  checkDisponibilidad,
  parsearFechas,
  addReserva,
  updateCabin,
  deleteCabin,
  updateReservation,
  deleteReservation,
  createCabin,
  loadReservations,
  getLatestPendingReservation,
  updateReservationStatus,
  getReservationById,
  getReservationByPhone
};

