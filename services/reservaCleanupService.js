/**
 * Servicio para limpiar automáticamente reservas pendientes expiradas
 */

const { runExecute, runQuery } = require('../db');
const logger = require('../config/logger');
const { getReservationForReview, notifyGuest } = require('./reservationApprovalService');
const notificationQueue = require('./notificationQueueService');
const { normalizeRecipient } = require('./whatsappCloudService');
const { establecerEstado } = require('./stateService');

class ReservaCleanupService {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    // Intervalo de verificación: cada 30 minutos
    this.CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutos en millisegundos
  }

  /**
   * Inicia el servicio de limpieza automática
   */
  iniciar() {
    if (this.isRunning) {
      logger.warn('El servicio de limpieza ya está ejecutándose');
      return;
    }

    logger.info('🧹 Iniciando servicio de limpieza automática de reservas pendientes');
    logger.info(`   - Intervalo de verificación: ${this.CLEANUP_INTERVAL / 60000} minutos`);

    // Ejecutar limpieza inmediatamente
    this.ejecutarLimpieza();

    // Programar limpiezas periódicas
    this.intervalId = setInterval(() => {
      this.ejecutarLimpieza();
    }, this.CLEANUP_INTERVAL);

    this.isRunning = true;
    logger.info('✅ Servicio de limpieza iniciado correctamente');
  }

  /**
   * Detiene el servicio de limpieza automática
   */
  detener() {
    if (!this.isRunning) {
      logger.warn('El servicio de limpieza no está ejecutándose');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('🛑 Servicio de limpieza detenido');
  }

  /**
   * Ejecuta la limpieza de reservas pendientes expiradas
   */
  async ejecutarLimpieza() {
    try {
      logger.info('🔍 Ejecutando limpieza de reservas pendientes...');

      const reservasAExpirar = await this.obtenerReservasExpiradas();
      
      if (reservasAExpirar.length === 0) {
        logger.info('✅ No hay reservas pendientes por expirar');
        return;
      }

      logger.info('Se marcarán pagos como vencidos', { total: reservasAExpirar.length });

      const resultado = await this.eliminarReservasExpiradas();
      
      if (resultado.changes > 0) {
        logger.info(`✅ Marcadas como expiradas ${resultado.changes} reservas pendientes`);
        
        await this.notificarExpiraciones(reservasAExpirar);
      } else {
        logger.info('ℹ️ No se expiraron reservas (posiblemente ya fueron procesadas)');
      }

    } catch (error) {
      logger.error('❌ Error durante la limpieza de reservas:', error);
    }
  }

  /**
   * Obtiene las reservas pendientes que han expirado
   */
  async obtenerReservasExpiradas() {
    const sql = `
      SELECT r.reservation_id, r.created_at, r.start_date, r.end_date, 
             u.name as guest_name, u.phone_number
      FROM Reservations r
      LEFT JOIN Users u ON r.user_id = u.user_id
      WHERE r.status = 'esperando_pago'
        AND r.payment_due_at IS NOT NULL
        AND datetime('now') > datetime(r.payment_due_at)
      ORDER BY r.payment_due_at ASC
    `;
    return runQuery(sql);
  }

  /**
   * Conserva el historial y marca las reservas pendientes como expiradas.
   * El nombre se mantiene por compatibilidad con llamadas existentes.
   */
  async eliminarReservasExpiradas() {
    const sql = `
      UPDATE Reservations
      SET status = 'expirada', notification_status = 'pending', updated_at = datetime('now')
      WHERE status = 'esperando_pago'
        AND payment_due_at IS NOT NULL
        AND datetime('now') > datetime(payment_due_at)
    `;
    return runExecute(sql);
  }

  async notificarExpiraciones(reservasExpiradas) {
    for (const item of reservasExpiradas) {
      const reservation = await getReservationForReview(item.reservation_id);
      if (!reservation || reservation.status !== 'expirada') continue;
      const phone = normalizeRecipient(reservation.phone_number);
      if (phone) {
        try {
          await establecerEstado(`${phone}@s.whatsapp.net`, 'MENU_PRINCIPAL', {});
        } catch (error) {
          logger.warn('No se pudo reiniciar el menú del huésped con pago vencido', {
            reservationId: reservation.reservation_id,
            error: error.message
          });
        }
      }
      try {
        await notifyGuest(reservation, 'payment_expired');
        await runExecute(`UPDATE Reservations SET notification_status = 'sent', updated_at = CURRENT_TIMESTAMP
          WHERE reservation_id = ?`, [reservation.reservation_id]);
      } catch (error) {
        await notificationQueue.enqueue({
          recipient: reservation.phone_number,
          kind: 'guest_decision',
          payload: { decision: 'payment_expired' },
          reservationId: reservation.reservation_id,
          idempotencyKey: `reservation:${reservation.reservation_id}:payment_expired`
        });
        await runExecute(`UPDATE Reservations SET notification_status = 'queued', updated_at = CURRENT_TIMESTAMP
          WHERE reservation_id = ?`, [reservation.reservation_id]);
        logger.error('Pago vencido; el aviso al huésped quedó en cola', {
          reservationId: reservation.reservation_id,
          code: error.response?.data?.error?.code
        });
      }
    }
    logger.info('Limpieza de pagos vencidos completada', { total: reservasExpiradas.length });
  }

  /**
   * Ejecuta limpieza manual (para testing o uso directo)
   */
  async limpiezaManual() {
    logger.info('🔧 Ejecutando limpieza manual...');
    await this.ejecutarLimpieza();
    return this.obtenerEstadisticas();
  }

  /**
   * Obtiene estadísticas de reservas
   */
  async obtenerEstadisticas() {
    try {
      const stats = await runQuery(`
        SELECT 
          status,
          COUNT(*) as cantidad,
          MIN(created_at) as mas_antigua,
          MAX(created_at) as mas_reciente
        FROM Reservations 
        GROUP BY status
        ORDER BY cantidad DESC
      `);

      return {
        estadisticas: stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error obteniendo estadísticas:', error);
      return null;
    }
  }

  /**
   * Verifica el estado del servicio
   */
  getEstado() {
    return {
      ejecutandose: this.isRunning,
      intervalo_minutos: this.CLEANUP_INTERVAL / 60000,
      proximo_cleanup: this.isRunning ? 
        new Date(Date.now() + this.CLEANUP_INTERVAL).toISOString() : 
        'No programado'
    };
  }
}

// Crear instancia singleton
const cleanupService = new ReservaCleanupService();

module.exports = cleanupService;
