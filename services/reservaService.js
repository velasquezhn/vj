const { runQuery, runExecute } = require('../db');
const logger = require('../config/logger');

/**
 * Normalize phone number by removing non-digit characters and leading zeros.
 * Supports formats like +50488776655, 50488776655, 8888-7766, etc.
 * @param {string} phone 
 * @returns {string} normalized phone number
 */
function normalizePhoneNumber(phone) {
    if (!phone) return '';
    // Remove all non-digit characters
    let normalized = phone.replace(/[^\d]/g, '');
    // Remove leading zeros
    normalized = normalized.replace(/^0+/, '');
    return normalized;
}

/**
 * Insert user if not exists and insert reservation.
 * @param {string} phoneNumber - raw phone number input
 * @param {object} reservaData - reservation data: {start_date, end_date, status, total_price}
 * @returns {Promise<{success: boolean, reservationId?: number, error?: string}>}
 */
async function createReservationWithUser(phoneNumber, reservaData, cabinId) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
        return { success: false, error: 'Número de teléfono inválido' };
    }

    if (!cabinId) {
        // Buscar una cabaña disponible si no se pasa el ID
        const { buscarCabanaDisponible } = require('./cabinsService');
        // Asegurar tipo correcto
        let tipo = reservaData.tipo || reservaData.alojamiento;
        if (!tipo) {
            tipo = 'tortuga'; // fallback por defecto
        }
        // Convertir fechas a YYYY-MM-DD si vienen en DD/MM/YYYY
        function toISO(fecha) {
            if (!fecha) return null;
            if (fecha.includes('/')) {
                const [d, m, y] = fecha.split('/');
                return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
            return fecha;
        }
        const personas = reservaData.personas;
        const start = toISO(reservaData.start_date);
        const end = toISO(reservaData.end_date);
        const cabinDisponible = await buscarCabanaDisponible(tipo, start, end, personas);
        if (!cabinDisponible) {
            return { success: false, error: 'No hay cabaña disponible para el tipo, fechas y cantidad de personas.' };
        }
        cabinId = cabinDisponible.cabin_id;
    }


    try {
        // Insert user if not exists (SQLite does not support INSERT IGNORE, use INSERT OR IGNORE)
        const insertUserSql = `INSERT OR IGNORE INTO Users (phone_number) VALUES (?)`;
        await runExecute(insertUserSql, [normalizedPhone]);

        // Get user_id
        const selectUserSql = `SELECT user_id FROM Users WHERE phone_number = ?`;
        const userRows = await runQuery(selectUserSql, [normalizedPhone]);
        if (userRows.length === 0) {
            return { success: false, error: 'No se pudo obtener ID de usuario' };
        }
        const user_id = userRows[0].user_id;


        // Validar capacidad de la cabaña
        const cabinRows = await runQuery('SELECT * FROM Cabins WHERE cabin_id = ?', [cabinId]);
        if (!cabinRows || cabinRows.length === 0) {
            return { success: false, error: 'No se encontró la cabaña seleccionada' };
        }
        const capacidad = cabinRows[0].capacity;
        if (reservaData.personas > capacidad) {
            return { success: false, error: `La cabaña seleccionada solo permite hasta ${capacidad} personas.` };
        }

        // Normalizar fechas antes de insertar
        function normalizarFecha(fecha) {
            if (!fecha) return null;
            
            // Si ya está en formato YYYY-MM-DD, devolverla tal como está
            if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
                return fecha;
            }
            
            // Si está en formato DD/MM/YYYY, convertir a YYYY-MM-DD
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fecha)) {
                const [dia, mes, año] = fecha.split('/');
                return `${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
            }
            
            return fecha; // Fallback
        }

        const startDateNormalizada = normalizarFecha(reservaData.start_date);
        const endDateNormalizada = normalizarFecha(reservaData.end_date);

        // Insert reservation solo con cabin_id real
        const insertReservaSql = `
            INSERT INTO Reservations (user_id, cabin_id, start_date, end_date, status, total_price, personas, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `;
        const insertResult = await runExecute(insertReservaSql, [
            user_id,
            cabinId,
            startDateNormalizada,
            endDateNormalizada,
            reservaData.status,
            reservaData.total_price,
            reservaData.personas || null
        ]);

        const reservationId = insertResult.lastID;

        if (!reservationId) {
            return { success: false, error: 'No se pudo obtener ID de reserva' };
        }

        const confirmationCode = `VJ-${String(reservationId).padStart(6, '0')}`;
        await runExecute(
            'UPDATE Reservations SET confirmation_code = ?, updated_at = CURRENT_TIMESTAMP WHERE reservation_id = ?',
            [confirmationCode, reservationId]
        );

        return { success: true, reservationId, confirmationCode };
    } catch (error) {
        logger.error('Error in createReservationWithUser:', error);
        if (String(error.message || '').includes('CABIN_DATE_CONFLICT')) {
            return { success: false, error: 'La cabaña dejó de estar disponible para esas fechas. Selecciona otra opción.' };
        }
        return { success: false, error: error.message || 'Error desconocido' };
    }
}

async function updateUserNameByPhone(phoneNumber, name) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
        return { success: false, error: 'Número de teléfono inválido' };
    }
    try {
        const updateSql = `UPDATE Users SET name = ? WHERE phone_number = ?`;
        await runExecute(updateSql, [name, normalizedPhone]);
        return { success: true };
    } catch (error) {
        logger.error('Error updating user name:', error);
        return { success: false, error: error.message || 'Error desconocido' };
    }
}

/**
 * Insert or update user with phone number and name.
 * If user exists, update the name.
 * If user does not exist, insert new user with phone and name.
 * @param {string} phoneNumber 
 * @param {string} name 
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function upsertUser(phoneNumber, name) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
        return { success: false, error: 'Número de teléfono inválido' };
    }
    try {
        // Try to update first
        const updateSql = `UPDATE Users SET name = ? WHERE phone_number = ?`;
        const updateResult = await runExecute(updateSql, [name, normalizedPhone]);
        if (updateResult.changes === 0) {
            // No rows updated, insert new user
            const insertSql = `INSERT INTO Users (phone_number, name) VALUES (?, ?)`;
            await runExecute(insertSql, [normalizedPhone, name]);
        }
        return { success: true };
    } catch (error) {
        logger.error('Error in upsertUser:', error);
        return { success: false, error: error.message || 'Error desconocido' };
    }
}

/**
 * Get reservation details by reservation ID, including user and cabin info.
 * @param {number} reservationId 
 * @returns {Promise<object|null>} reservation details or null if not found
 */
async function getReservationDetailsById(reservationId) {
    const sql = `
        SELECT 
            r.reservation_id,
            u.name AS nombre,
            u.phone_number AS telefono,
            r.total_price AS precioTotal,
            r.start_date AS fechaEntrada,
            r.end_date AS fechaSalida,
            r.cabin_id AS alojamiento,
            r.personas AS personas,
            r.status AS status
        FROM Reservations r
        JOIN Users u ON r.user_id = u.user_id
        LEFT JOIN Cabins c ON r.cabin_id = c.cabin_id
        WHERE r.reservation_id = ?
    `;
    try {
        logger.info('getReservationDetailsById called with reservationId:', reservationId);
        const rows = await runQuery(sql, [reservationId]);
        logger.info('getReservationDetailsById query result rows:', rows);
        if (rows.length === 0) {
            return null;
        }
        return rows[0];
    } catch (error) {
        logger.error('Error fetching reservation details:', error);
        return null;
    }
}

async function updateComprobante(reservationId, comprobanteData, comprobanteContentType, comprobanteNombreArchivo) {
    try {
        const sql = `
            UPDATE Reservations
            SET comprobante_nombre_archivo = ?, status = 'pendiente_verificacion',
                receipt_received_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE reservation_id = ? AND status = 'esperando_pago'
        `;
        const result = await runExecute(sql, [comprobanteNombreArchivo, reservationId]);
        return result.changes === 1
            ? { success: true }
            : { success: false, error: 'El pago no está autorizado para esta reserva' };
    } catch (error) {
        logger.error('Error updating comprobante:', error);
        return { success: false, error: error.message || 'Error desconocido' };
    }
}

async function updateReservationPrice(reservationId, totalPrice) {
    try {
        const sql = `
            UPDATE Reservations
            SET total_price = ?, updated_at = datetime('now')
            WHERE reservation_id = ?
        `;
        await runExecute(sql, [totalPrice, reservationId]);
        return { success: true };
    } catch (error) {
        logger.error('Error updating reservation price:', error);
        return { success: false, error: error.message || 'Error desconocido' };
    }
}

async function getUserByPhone(phoneNumber) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
        return null;
    }
    try {
        const sql = `SELECT * FROM Users WHERE phone_number = ?`;
        const rows = await runQuery(sql, [normalizedPhone]);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        logger.error('Error fetching user by phone:', error);
        return null;
    }
}

async function getReservationById(reservationId) {
    try {
        const sql = `SELECT * FROM Reservations WHERE reservation_id = ?`;
        const rows = await runQuery(sql, [reservationId]);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        logger.error('Error fetching reservation by ID:', error);
        return null;
    }
}

/**
 * Find user by phone number
 * @param {string} phoneNumber - phone number to search
 * @returns {Promise<object|null>} user object or null if not found
 */
async function findUserByPhone(phoneNumber) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
        return null;
    }

    try {
        const sql = `SELECT * FROM Users WHERE phone_number = ?`;
        const rows = await runQuery(sql, [normalizedPhone]);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        logger.error('Error finding user by phone:', error);
        return null;
    }
}

/**
 * Check if user has a pending reservation created in the last 2 minutes
 * @param {string} phoneNumber - phone number to check
 * @returns {Promise<object|null>} recent pending reservation or null
 */
async function checkRecentPendingReservation(phoneNumber) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
        return null;
    }

    try {
        const sql = `
            SELECT r.reservation_id, r.created_at, r.status
            FROM Reservations r
            JOIN Users u ON r.user_id = u.user_id
            WHERE u.phone_number = ? 
            AND r.status = 'pendiente_autorizacion'
            AND datetime('now') < datetime(r.created_at, '+2 minutes')
            ORDER BY r.created_at DESC
            LIMIT 1
        `;
        const rows = await runQuery(sql, [normalizedPhone]);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        logger.error('Error checking recent pending reservation:', error);
        return null;
    }
}

module.exports = {
    createReservationWithUser,
    normalizePhoneNumber,
    updateUserNameByPhone,
    getReservationDetailsById,
    updateComprobante,
    upsertUser,
    updateReservationPrice,
    getUserByPhone,
    getReservationById,
    findUserByPhone,
    checkRecentPendingReservation
};
