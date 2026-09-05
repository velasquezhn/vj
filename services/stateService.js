/**
 * Fachada compatible para el servicio persistente de conversaciones.
 */

// Importar el nuevo servicio persistente
const persistentStateService = require('./persistentStateService');

// Re-exportar las funciones para mantener compatibilidad
module.exports = {
  establecerEstado: persistentStateService.establecerEstado,
  obtenerEstado: persistentStateService.obtenerEstado,
  establecerUltimoSaludo: persistentStateService.establecerUltimoSaludo,
  obtenerUltimoSaludo: persistentStateService.obtenerUltimoSaludo,
  
  // Funciones adicionales del nuevo sistema
  initializeStateTables: persistentStateService.initializeStateTables,
  cleanupExpiredStates: persistentStateService.cleanupExpiredStates,
  getStateStatistics: persistentStateService.getStateStatistics
};

