// @ts-nocheck
const { db, runQuery, runExecute } = require('../db');

const TABLE_NAME = 'Reservations';

async function findById(id) {
  const rows = await runQuery(`SELECT * FROM ${TABLE_NAME} WHERE reservation_id = ?`, [id]);
  return rows[0];
}

async function findByPhoneAndStatus(phone, status) {
  const sql = `
    SELECT r.*
    FROM ${TABLE_NAME} r
    JOIN Users u ON r.user_id = u.user_id
    WHERE u.phone_number = ? AND r.status = ?
  `;
  const rows = await runQuery(sql, [phone, status]);
  return rows[0];
}

async function updateComprobante(id, buffer, contentType, nombreArchivo) {
  // La fecha límite se valida dentro de la escritura para evitar aceptar pagos vencidos.
  const sql = `UPDATE ${TABLE_NAME} SET status = ?, comprobante_nombre_archivo = ?, updated_at = CURRENT_TIMESTAMP
    WHERE reservation_id = ? AND status = 'esperando_pago'
      AND (payment_due_at IS NULL OR datetime('now') <= datetime(payment_due_at))`;
  const params = ['pendiente_verificacion', nombreArchivo, id];
  const result = await runExecute(sql, params);
  return result.changes === 1 ? findById(id) : null;
}

async function expirePaymentWindow(id) {
  const result = await runExecute(`UPDATE ${TABLE_NAME}
    SET status = 'expirada', notification_status = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE reservation_id = ? AND status = 'esperando_pago'
      AND payment_due_at IS NOT NULL AND datetime('now') > datetime(payment_due_at)`, [id]);
  return result.changes === 1;
}

async function updateEstado(id, nuevoEstado) {
  const sql = `UPDATE ${TABLE_NAME} SET status = ? WHERE reservation_id = ?`;
  try {
    await runExecute(sql, [nuevoEstado, id]);
    return findById(id);
  } catch (error) {
    console.error(`[ERROR] updateEstado failed: ${error.message}`, error);
    throw error;
  }
}

async function eliminarComprobante(id) {
  const sql = `UPDATE ${TABLE_NAME} SET status = ?, comprobante_nombre_archivo = NULL WHERE reservation_id = ?`;
  await runExecute(sql, ['cancelada', id]);
  return findById(id);
}

module.exports = {
  findById,
  findByPhoneAndStatus,
  updateComprobante,
  expirePaymentWindow,
  updateEstado,
  eliminarComprobante
};
