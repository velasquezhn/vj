const Reserva = require('../models/Reserva');
const fs = require('fs');
const path = require('path');

const COMPROBANTES_DIR = path.resolve(process.env.RECEIPTS_DIR || path.join(__dirname, '../public/comprobantes'));
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_RECEIPT_BYTES = Number(process.env.MAX_RECEIPT_BYTES || 5 * 1024 * 1024);

if (!fs.existsSync(COMPROBANTES_DIR)) {
  fs.mkdirSync(COMPROBANTES_DIR, { recursive: true });
}

async function guardarComprobante(reservaId, buffer, mimetype, nombreArchivo) {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_RECEIPT_BYTES) {
      throw new Error('Tamaño de comprobante inválido');
    }
    if (!ALLOWED_MIME_TYPES.has(mimetype)) throw new Error('Tipo de comprobante no permitido');
    let current = await Reserva.findById(reservaId);
    if (!current) {
      const error = new Error('Reserva no encontrada');
      error.code = 'RESERVATION_NOT_FOUND';
      throw error;
    }
    if (current.status === 'esperando_pago' && await Reserva.expirePaymentWindow(reservaId)) {
      const error = new Error('El plazo para enviar el comprobante venció');
      error.code = 'PAYMENT_WINDOW_EXPIRED';
      throw error;
    }
    if (current.status === 'pendiente_verificacion') {
      const error = new Error('El comprobante ya fue recibido y está en revisión');
      error.code = 'RECEIPT_ALREADY_RECEIVED';
      throw error;
    }
    if (current.status !== 'esperando_pago') {
      const error = new Error('El comprobante no está habilitado para esta reserva');
      error.code = 'RECEIPT_NOT_ALLOWED';
      throw error;
    }
    const safeName = path.basename(nombreArchivo || 'comprobante.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
    // Save file to disk
    const filePath = path.join(COMPROBANTES_DIR, `${reservaId}-${Date.now()}-${safeName}`);
    await fs.promises.writeFile(filePath, buffer);

    // Store relative path in DB
    const relativePath = `/comprobantes/${path.basename(filePath)}`;
    const resultado = await Reserva.updateComprobante(reservaId, null, null, relativePath);
    if (!resultado) {
      await fs.promises.unlink(filePath).catch(() => undefined);
      current = await Reserva.findById(reservaId);
      const expired = await Reserva.expirePaymentWindow(reservaId);
      const error = new Error(expired || current?.status === 'expirada'
        ? 'El plazo para enviar el comprobante venció'
        : 'El comprobante no está habilitado para esta reserva');
      error.code = expired || current?.status === 'expirada' ? 'PAYMENT_WINDOW_EXPIRED' : 'RECEIPT_NOT_ALLOWED';
      throw error;
    }
    const { runExecute } = require('../db');
    await runExecute(
      `UPDATE Reservations
       SET receipt_received_at = CURRENT_TIMESTAMP, notification_status = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE reservation_id = ?`,
      [reservaId]
    );
    return resultado;
  } catch (error) {
    if (!['RECEIPT_NOT_ALLOWED', 'RECEIPT_ALREADY_RECEIVED', 'PAYMENT_WINDOW_EXPIRED'].includes(error.code)) {
      console.error('Error guardando comprobante:', error);
    }
    throw error;
  }
}

async function actualizarEstado(reservaId, nuevoEstado) {
  try {
    return await Reserva.updateEstado(reservaId, nuevoEstado);
  } catch (error) {
    console.error('Error actualizando estado:', error);
    throw error;
  }
}

async function eliminarComprobante(reservaId) {
  try {
    // Delete file from disk if exists
    const reserva = await Reserva.findById(reservaId);
    if (reserva && reserva.comprobante_nombre_archivo) {
      const filePath = path.join(COMPROBANTES_DIR, path.basename(reserva.comprobante_nombre_archivo));
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    }
    return await Reserva.eliminarComprobante(reservaId);
  } catch (error) {
    console.error('Error eliminando comprobante:', error);
    throw error;
  }
}

module.exports = { guardarComprobante, actualizarEstado, eliminarComprobante, COMPROBANTES_DIR, ALLOWED_MIME_TYPES, MAX_RECEIPT_BYTES };
