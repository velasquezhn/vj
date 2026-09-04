const { runQuery } = require('../db');

/**
 * Busca una cabaña física disponible según tipo y fechas
 * @param {string} tipo - 'tortuga', 'delfin', 'tiburon'
 * @param {string} fechaInicio - formato 'YYYY-MM-DD'
 * @param {string} fechaFin - formato 'YYYY-MM-DD'
 * @returns {Promise<object|null>} - Retorna la cabaña disponible o null
 */
async function buscarCabanaDisponible(tipo, fechaInicio, fechaFin, personas) {
    // Convertir fechas a YYYY-MM-DD si vienen en DD/MM/YYYY
    function toISO(fecha) {
        if (!fecha) return null;
        if (fecha.includes('/')) {
            const [d, m, y] = fecha.split('/');
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return fecha;
    }
    const fechaInicioISO = toISO(fechaInicio);
    const fechaFinISO = toISO(fechaFin);
    // 1. Obtener todas las cabañas físicas del tipo
    // Como no tenemos columna 'type', buscamos por patrón en el nombre
    const tipoNombre = {
        'tortuga': 'Tortuga',
        'delfin': 'Delfín', 
        'tiburon': 'Tiburón'
    };
    
    const nombreTipo = tipoNombre[tipo.toLowerCase()];
    if (!nombreTipo) {
        return null;
    }
    
    const cabins = await runQuery('SELECT * FROM Cabins WHERE name LIKE ? AND capacity >= ?', [`%${nombreTipo}%`, personas]);
    if (!cabins || cabins.length === 0) {
        return null;
    }

    // 2. Para cada cabaña, verificar si está reservada en el rango de fechas
    // Consulta robusta para solapamiento de fechas
    for (const cabin of cabins) {
        const reservas = await runQuery(
            `SELECT * FROM Reservations WHERE cabin_id = ?
             AND status IN ('pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion', 'confirmada', 'confirmado')
             AND date(start_date) < date(?) AND date(end_date) > date(?)`,
            [
                cabin.cabin_id,
                fechaFinISO,
                fechaInicioISO
            ]
        );
        if (!reservas || reservas.length === 0) {
            return cabin;
        }
    }
    return null;
}

module.exports = { buscarCabanaDisponible };
