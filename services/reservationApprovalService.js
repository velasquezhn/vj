const { runQuery, runExecute } = require('../db');
const logger = require('../config/logger');
const { WhatsAppCloudService } = require('./whatsappCloudService');
const { sendReplyButtons } = require('./whatsappInteractiveService');
const { establecerEstado, obtenerEstado } = require('./stateService');
const { normalizeRecipient } = require('./whatsappCloudService');
const { getPaymentSettings, paymentAmounts } = require('./paymentSettingsService');
const notificationQueue = require('./notificationQueueService');

function trackingCode(id) {
  return `VJ-${String(id).padStart(6, '0')}`;
}

async function getReservationForReview(id) {
  const rows = await runQuery(`
    SELECT r.*, u.name AS user_name, u.phone_number, c.name AS cabin_name
    FROM Reservations r
    JOIN Users u ON u.user_id = r.user_id
    JOIN Cabins c ON c.cabin_id = r.cabin_id
    WHERE r.reservation_id = ?
  `, [id]);
  return rows[0] || null;
}

async function notifyGuest(reservation, decision, providedClient = null) {
  const client = providedClient || new WhatsAppCloudService();
  if (decision === 'payment_authorized') {
    const payment = await getPaymentSettings();
    const amounts = paymentAmounts(reservation.total_price, payment.deposit_percentage);
    const accounts = payment.bank_accounts.map((account) => `• ${account}`).join('\n');
    return sendReplyButtons(client, reservation.phone_number, {
      header: 'Pago autorizado',
      body: `✅ Tu solicitud *${reservation.confirmation_code}* fue autorizada por el administrador.\n\n` +
        `Alojamiento: *${reservation.cabin_name}*\n` +
        `Fechas: *${reservation.start_date} al ${reservation.end_date}*\n` +
        `Total: *HNL ${amounts.total.toLocaleString('es-HN', { minimumFractionDigits: 2 })}*\n` +
        `Anticipo requerido (${payment.deposit_percentage}%): *HNL ${amounts.deposit.toLocaleString('es-HN', { minimumFractionDigits: 2 })}*\n` +
        `Saldo pendiente: *HNL ${amounts.balance.toLocaleString('es-HN', { minimumFractionDigits: 2 })}*\n\n` +
        `*Cuentas para transferencia:*\n${accounts}\n` +
        `Plazo para enviar el comprobante: *24 horas* (vence ${reservation.payment_due_at || '24 horas después de esta autorización'}).\n` +
        `Política: *los pagos y anticipos no son reembolsables*.\n` +
        (payment.notes ? `\n${payment.notes}\n` : '\n') +
        '\nDespués de pagar, envía por este chat una foto o PDF del comprobante.',
      footer: 'La reserva se confirma después de revisar el comprobante',
      buttons: [{ id: 'main_menu', title: 'Menú principal' }]
    });
  }
  if (decision === 'approved') {
    return sendReplyButtons(client, reservation.phone_number, {
      header: 'Reserva confirmada',
      body: `✅ ¡Tu reserva en Villas Julie fue confirmada!\n\n` +
        `Código: *${reservation.confirmation_code}*\n` +
        `Alojamiento: *${reservation.cabin_name}*\n` +
        `Entrada: *${reservation.start_date}*\n` +
        `Salida: *${reservation.end_date}*\n` +
        `Total: *HNL ${Number(reservation.total_price).toLocaleString('es-HN')}*\n\n` +
        'Guarda este código para tu llegada.',
      footer: 'Villas Julie',
      buttons: [{ id: 'main_menu', title: 'Menú principal' }]
    });
  }

  return sendReplyButtons(client, reservation.phone_number, {
    header: 'Solicitud revisada',
    body: `No pudimos aprobar la solicitud *${reservation.confirmation_code}*.\n\n` +
      `Motivo: ${reservation.rejection_reason || 'No especificado'}\n\n` +
      'Puedes iniciar una nueva solicitud o comunicarte con nuestro equipo.',
    footer: 'Villas Julie',
    buttons: [
      { id: 'reservation_start', title: 'Nueva reserva' },
      { id: 'main_menu', title: 'Menú principal' }
    ]
  });
}

async function setGuestPaymentState(reservation) {
  const jid = `${normalizeRecipient(reservation.phone_number)}@s.whatsapp.net`;
  const current = await obtenerEstado(jid);
  await establecerEstado(jid, 'esperando_pago', {
    ...(current.datos || {}),
    reservaId: reservation.reservation_id,
    reservation_id: reservation.reservation_id,
    confirmationCode: reservation.confirmation_code,
    cabinId: reservation.cabin_id,
    cabinName: reservation.cabin_name
  });
}

async function authorizePayment(id, adminId, options = {}) {
  let reservation = await getReservationForReview(id);
  if (!reservation) return { ok: false, status: 404, code: 'RESERVATION_NOT_FOUND' };
  if (reservation.status === 'esperando_pago') return { ok: true, alreadyProcessed: true, reservation };
  if (reservation.status !== 'pendiente_autorizacion') {
    return { ok: false, status: 409, code: 'INVALID_RESERVATION_STATUS', currentStatus: reservation.status };
  }

  const payment = await getPaymentSettings();
  if (!payment.bank_accounts.length) {
    return { ok: false, status: 409, code: 'PAYMENT_SETTINGS_INCOMPLETE', currentStatus: reservation.status };
  }

  const code = reservation.confirmation_code || trackingCode(id);
  const hours = Math.min(Math.max(Number(process.env.PAYMENT_WINDOW_HOURS || 24), 1), 168);
  const result = await runExecute(`UPDATE Reservations
    SET status = 'esperando_pago', confirmation_code = ?, payment_authorized_at = CURRENT_TIMESTAMP,
        payment_authorized_by = ?, payment_due_at = datetime('now', ?), notification_status = 'pending',
        updated_at = CURRENT_TIMESTAMP
    WHERE reservation_id = ? AND status = 'pendiente_autorizacion'
      AND NOT EXISTS (
        SELECT 1 FROM Reservations other
        WHERE other.cabin_id = Reservations.cabin_id AND other.reservation_id <> Reservations.reservation_id
          AND other.status IN ('esperando_pago', 'pendiente_verificacion', 'confirmada', 'confirmado')
          AND date(other.start_date) < date(Reservations.end_date)
          AND date(other.end_date) > date(Reservations.start_date)
      )`, [code, adminId, `+${hours} hours`, id]);
  if (result.changes !== 1) return { ok: false, status: 409, code: 'CABIN_NO_LONGER_AVAILABLE' };

  reservation = await getReservationForReview(id);
  await setGuestPaymentState(reservation);
  try {
    await (options.notify || notifyGuest)(reservation, 'payment_authorized');
    await setNotificationStatus(id, 'sent');
    reservation.notification_status = 'sent';
  } catch (error) {
    await notificationQueue.enqueue({
      recipient: reservation.phone_number,
      kind: 'guest_decision',
      payload: { decision: 'payment_authorized' },
      reservationId: id,
      idempotencyKey: `reservation:${id}:payment_authorized`
    });
    await setNotificationStatus(id, 'queued');
    reservation.notification_status = 'queued';
    logger.error('Pago autorizado, pero falló el aviso al huésped', { reservationId: id, code: error.response?.data?.error?.code });
  }
  logger.info('Pago autorizado por administrador', { reservationId: id, adminId });
  return { ok: true, reservation };
}

async function setNotificationStatus(id, status) {
  await runExecute(
    'UPDATE Reservations SET notification_status = ?, updated_at = CURRENT_TIMESTAMP WHERE reservation_id = ?',
    [status, id]
  );
}

async function approveReservation(id, adminId, options = {}) {
  let reservation = await getReservationForReview(id);
  if (!reservation) return { ok: false, status: 404, code: 'RESERVATION_NOT_FOUND' };
  if (['confirmada', 'confirmado'].includes(reservation.status)) {
    return { ok: true, alreadyProcessed: true, reservation };
  }
  if (reservation.status !== 'pendiente_verificacion') {
    return { ok: false, status: 409, code: 'INVALID_RESERVATION_STATUS', currentStatus: reservation.status };
  }
  if (!reservation.comprobante_nombre_archivo) {
    return { ok: false, status: 409, code: 'RECEIPT_REQUIRED' };
  }

  const code = reservation.confirmation_code || trackingCode(id);
  const update = await runExecute(`
    UPDATE Reservations
    SET status = 'confirmada', confirmation_code = ?, reviewed_at = CURRENT_TIMESTAMP,
        reviewed_by = ?, rejection_reason = NULL, notification_status = 'pending', updated_at = CURRENT_TIMESTAMP
    WHERE reservation_id = ? AND status = 'pendiente_verificacion'
      AND NOT EXISTS (
        SELECT 1 FROM Reservations other
        WHERE other.cabin_id = Reservations.cabin_id
          AND other.reservation_id <> Reservations.reservation_id
          AND other.status IN ('confirmada', 'confirmado')
          AND date(other.start_date) < date(Reservations.end_date)
          AND date(other.end_date) > date(Reservations.start_date)
      )
  `, [code, adminId, id]);

  if (update.changes !== 1) {
    return { ok: false, status: 409, code: 'CABIN_NO_LONGER_AVAILABLE' };
  }

  reservation = await getReservationForReview(id);
  try {
    await (options.notify || notifyGuest)(reservation, 'approved');
    await setNotificationStatus(id, 'sent');
    reservation.notification_status = 'sent';
  } catch (error) {
    await notificationQueue.enqueue({
      recipient: reservation.phone_number,
      kind: 'guest_decision',
      payload: { decision: 'approved' },
      reservationId: id,
      idempotencyKey: `reservation:${id}:approved`
    });
    await setNotificationStatus(id, 'queued');
    reservation.notification_status = 'queued';
    logger.error('Reserva confirmada, pero falló la notificación de WhatsApp', {
      reservationId: id, code: error.response?.data?.error?.code
    });
  }

  logger.info('Reserva aprobada desde el panel', { reservationId: id, adminId });
  return { ok: true, reservation };
}

async function rejectReservation(id, adminId, reason, options = {}) {
  const current = await getReservationForReview(id);
  if (!current) return { ok: false, status: 404, code: 'RESERVATION_NOT_FOUND' };
  const rejectable = ['pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion'];
  if (!rejectable.includes(current.status)) {
    return { ok: false, status: 409, code: 'INVALID_RESERVATION_STATUS', currentStatus: current.status };
  }

  const code = current.confirmation_code || trackingCode(id);
  const result = await runExecute(`
    UPDATE Reservations
    SET status = 'rechazada', confirmation_code = ?, reviewed_at = CURRENT_TIMESTAMP,
        reviewed_by = ?, rejection_reason = ?, notification_status = 'pending', updated_at = CURRENT_TIMESTAMP
    WHERE reservation_id = ? AND status IN ('pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion')
  `, [code, adminId, reason, id]);
  if (result.changes !== 1) return { ok: false, status: 409, code: 'ALREADY_PROCESSED' };

  const reservation = await getReservationForReview(id);
  try {
    await (options.notify || notifyGuest)(reservation, 'rejected');
    await setNotificationStatus(id, 'sent');
    reservation.notification_status = 'sent';
  } catch (error) {
    await notificationQueue.enqueue({
      recipient: reservation.phone_number,
      kind: 'guest_decision',
      payload: { decision: 'rejected' },
      reservationId: id,
      idempotencyKey: `reservation:${id}:rejected`
    });
    await setNotificationStatus(id, 'queued');
    reservation.notification_status = 'queued';
    logger.error('Reserva rechazada, pero falló la notificación de WhatsApp', {
      reservationId: id, code: error.response?.data?.error?.code
    });
  }

  logger.info('Reserva rechazada desde el panel', { reservationId: id, adminId });
  return { ok: true, reservation };
}

module.exports = { authorizePayment, approveReservation, rejectReservation, getReservationForReview, trackingCode, notifyGuest };
