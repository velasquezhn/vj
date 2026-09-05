/**
 * Servicio mejorado para manejo de estados de conversación con persistencia en BD.
 * Reemplaza el sistema de estado en memoria con almacenamiento en base de datos.
 */

const { runQuery, runExecute } = require('../db');
const logger = require('../config/logger');

const estadosCache = new Map();

function sessionTtlMs(state) {
  const defaultMinutes = Math.min(Math.max(Number(process.env.CONVERSATION_SESSION_TTL_MINUTES || 60), 5), 1440);
  const longLivedStates = new Set([
    'esperando_pago', 'ESPERANDO_PAGO', 'esperando_autorizacion',
    'esperando_confirmacion', 'RESERVA_PENDIENTE'
  ]);
  const minutes = longLivedStates.has(state) ? Math.max(defaultMinutes, 24 * 60) : defaultMinutes;
  return minutes * 60 * 1000;
}

function sqliteUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Inicializa las tablas necesarias para el estado persistente
 */
async function initializeStateTables() {
  try {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS UserStates (
        user_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        data TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_states_expires 
      ON UserStates(expires_at);
    `;
    
    await runExecute(createTableSQL);
    logger.info('Tablas de estado inicializadas correctamente');
    
    // Limpiar estados expirados al inicializar
    await cleanupExpiredStates();
    
  } catch (error) {
    logger.error('Error inicializando tablas de estado:', error);
    throw error;
  }
}

/**
 * Establece el estado de un usuario con persistencia en BD
 * @param {string} numero - Número del usuario (JID)
 * @param {string} estado - Estado a establecer
 * @param {Object} datos - Datos adicionales
 */
async function establecerEstado(numero, estado, datos = {}) {
  try {
    logger.info('Estableciendo estado de conversación', { estado, userId: numero });
    
    // Calcular fecha de expiración según el estado
    const now = new Date();
    const expiresAt = new Date(now.getTime() + sessionTtlMs(estado));
    
    // Si el estado es null, eliminar el registro
    if (!estado || estado === null) {
      await runExecute('DELETE FROM UserStates WHERE user_id = ?', [numero]);
      estadosCache.delete(numero);
      logger.info(`Estado eliminado para ${numero}`);
      return;
    }
    
    const datosJson = JSON.stringify(datos);
    
    // Usar UPSERT (INSERT OR REPLACE)
    const sql = `
      INSERT OR REPLACE INTO UserStates 
      (user_id, state, data, updated_at, expires_at)
      VALUES (?, ?, ?, datetime('now'), ?)
    `;
    
    await runExecute(sql, [numero, estado, datosJson, sqliteUtc(expiresAt)]);
    
    // Actualizar cache
    estadosCache.set(numero, {
      estado,
      datos,
      timestamp: Date.now(),
      expiresAt: expiresAt.getTime()
    });
    
    logger.info(`Estado establecido exitosamente para ${numero}`, {
      estado,
      expiresAt: expiresAt.toISOString()
    });
    
  } catch (error) {
    logger.error(`Error estableciendo estado para ${numero}:`, {
      error: error.message,
      stack: error.stack,
      estado,
      dataKeys: Object.keys(datos || {})
    });
    
    // Fallback a memoria si falla la BD
    const estadosMemoria = global.estadosMemoriaFallback || new Map();
    estadosMemoria.set(numero, { estado, datos, timestamp: Date.now(), expiresAt: Date.now() + sessionTtlMs(estado) });
    global.estadosMemoriaFallback = estadosMemoria;
    
    logger.warn(`Usando fallback de memoria para ${numero}`);
  }
}

/**
 * Obtiene el estado actual de un usuario desde la BD
 * @param {string} numero - Número del usuario (JID)
 * @returns {Object} Estado y datos
 */
async function obtenerEstado(numero) {
  try {
    logger.debug(`Obteniendo estado para ${numero}`);
    
    // Verificar cache primero
    const cached = estadosCache.get(numero);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug(`Estado obtenido desde cache para ${numero}: ${cached.estado}`);
      return cached;
    }
    
    // Consultar base de datos
    if (cached) estadosCache.delete(numero);

    const sql = `SELECT state, data, expires_at,
      CASE WHEN datetime(expires_at) > datetime('now') THEN 1 ELSE 0 END AS active
      FROM UserStates WHERE user_id = ?`;
    
    const results = await runQuery(sql, [numero]);
    
    if (results.length > 0 && results[0].active === 1) {
      const row = results[0];
      let datos = {};
      
      try {
        datos = JSON.parse(row.data || '{}');
      } catch (parseError) {
        logger.warn(`Error parseando datos para ${numero}:`, parseError);
        datos = {};
      }
      
      const estado = {
        estado: row.state,
        datos,
        timestamp: Date.now(),
      expiresAt: new Date(`${row.expires_at.replace(' ', 'T')}Z`).getTime()
      };
      
      // Actualizar cache
      estadosCache.set(numero, estado);
      
      logger.debug(`Estado obtenido desde BD para ${numero}: ${estado.estado}`);
      return estado;
    }
    
    if (results.length > 0) {
      await runExecute('DELETE FROM UserStates WHERE user_id = ?', [numero]);
      return { estado: 'MENU_PRINCIPAL', datos: {}, expired: true };
    }

    // No hay estado válido, retornar estado por defecto
    logger.debug(`No se encontró estado válido para ${numero}, retornando MENU_PRINCIPAL`);
    return { estado: 'MENU_PRINCIPAL', datos: {} };
    
  } catch (error) {
    logger.error(`Error obteniendo estado para ${numero}:`, error);
    
    // Fallback a memoria
    const estadosMemoria = global.estadosMemoriaFallback || new Map();
    const fallbackState = estadosMemoria.get(numero);
    
    if (fallbackState?.expiresAt > Date.now()) {
      logger.warn(`Usando fallback de memoria para ${numero}`);
      return fallbackState;
    }
    
    return { estado: 'MENU_PRINCIPAL', datos: {} };
  }
}

/**
 * Limpia estados expirados de la base de datos
 */
async function cleanupExpiredStates() {
  try {
    const result = await runExecute(
      'DELETE FROM UserStates WHERE datetime(expires_at) <= datetime("now")'
    );
    
    const eliminados = result.changes || 0;
    
    if (eliminados > 0) {
      logger.info(`Limpiados ${eliminados} estados expirados`);
    }
    
    // Limpiar cache también
    const now = Date.now();
    for (const [key, value] of estadosCache.entries()) {
      if (value.expiresAt < now) {
        estadosCache.delete(key);
      }
    }
    
    return eliminados;
    
  } catch (error) {
    logger.error('Error limpiando estados expirados:', error);
    return 0;
  }
}

/**
 * Obtiene estadísticas de estados activos
 */
async function getStateStatistics() {
  try {
    const sql = `
      SELECT 
        state,
        COUNT(*) as count,
        MIN(created_at) as oldest,
        MAX(updated_at) as newest
      FROM UserStates 
      WHERE expires_at > datetime('now')
      GROUP BY state
      ORDER BY count DESC
    `;
    
    const stats = await runQuery(sql);
    
    const totalActiveStates = await runQuery(
      'SELECT COUNT(*) as total FROM UserStates WHERE expires_at > datetime("now")'
    );
    
    return {
      byState: stats,
      totalActive: totalActiveStates[0]?.total || 0,
      cacheSize: estadosCache.size
    };
    
  } catch (error) {
    logger.error('Error obteniendo estadísticas de estado:', error);
    return { byState: [], totalActive: 0, cacheSize: estadosCache.size };
  }
}

/**
 * Migra estados existentes en memoria a la base de datos
 * (Para usar durante la transición)
 */
async function migrateMemoryStatesToDB(estadosMemoria) {
  if (!estadosMemoria || Object.keys(estadosMemoria).length === 0) {
    logger.info('No hay estados en memoria para migrar');
    return;
  }
  
  let migrated = 0;
  
  try {
    for (const [numero, estadoData] of Object.entries(estadosMemoria)) {
      if (estadoData && estadoData.estado) {
        await establecerEstado(numero, estadoData.estado, estadoData.datos || {});
        migrated++;
      }
    }
    
    logger.info(`Migrados ${migrated} estados desde memoria a BD`);
    
  } catch (error) {
    logger.error('Error migrando estados:', error);
  }
}

/**
 * Inicializar cleanup automático cada 30 minutos
 */
function startPeriodicCleanup() {
  setInterval(async () => {
    try {
      await cleanupExpiredStates();
    } catch (error) {
      logger.error('Error en cleanup periódico:', error);
    }
  }, 30 * 60 * 1000); // 30 minutos
  
  logger.info('Cleanup periódico de estados iniciado (cada 30 minutos)');
}

// Gestión de último saludo (mantenemos funcionalidad existente)
const ultimosSaludo = {};

function establecerUltimoSaludo(numero, fecha) {
  ultimosSaludo[numero] = fecha;
}

function obtenerUltimoSaludo(numero) {
  return ultimosSaludo[numero] || null;
}

module.exports = {
  // Funciones principales (compatibilidad con código existente)
  establecerEstado,
  obtenerEstado,
  establecerUltimoSaludo,
  obtenerUltimoSaludo,
  
  // Nuevas funciones de administración
  initializeStateTables,
  cleanupExpiredStates,
  getStateStatistics,
  migrateMemoryStatesToDB,
  startPeriodicCleanup
};
