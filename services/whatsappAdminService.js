const logger = require('../config/logger');
const { normalizeRecipient } = require('./whatsappCloudService');
const { sendReplyButtons } = require('./whatsappInteractiveService');
const { authorizePayment, approveReservation, rejectReservation, getReservationForReview } = require('./reservationApprovalService');
const { obtenerEstado, establecerEstado } = require('./stateService');
const { activeAdminNumbers } = require('./whatsappAdminSettingsService');
const { runQuery } = require('../db');
const { getPaymentSettings, paymentAmounts } = require('./paymentSettingsService');

async function getAdminNumbers() {
  const configured = await activeAdminNumbers();
  return new Set([
    ...configured,
    ...(
    String(process.env.WHATSAPP_ADMIN_NUMBERS || '')
      .split(',')
      .map(normalizeRecipient)
      .filter(Boolean)
    )
  ]);
}

async function isAdminSender(sender) {
  return (await getAdminNumbers()).has(normalizeRecipient(sender));
}

function parseReservationId(value) {
  const text = String(value || '').trim();
  const codeMatch = text.match(/VJ-?(\d{1,10})/i);
  if (codeMatch) return Number(codeMatch[1]);
  const numberMatch = text.match(/\b(\d{1,10})\b/);
  return numberMatch ? Number(numberMatch[1]) : null;
}

function receiptUrl(reservation) {
  if (!reservation.comprobante_nombre_archivo) return null;
  const base = process.env.PUBLIC_BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
  return base ? `${base}${reservation.comprobante_nombre_archivo}` : reservation.comprobante_nombre_archivo;
}

function reviewText(reservation, payment = { deposit_percentage: 50, bank_accounts: [] }) {
  const receipt = receiptUrl(reservation);
  const amounts = paymentAmounts(reservation.total_price, payment.deposit_percentage);
  const stage = reservation.status === 'pendiente_autorizacion'
    ? 'AUTORIZACIÓN PREVIA AL PAGO'
    : 'VERIFICACIÓN DEL COMPROBANTE';
  return `🧾 *${stage}*\n\n` +
    `Código: *${reservation.confirmation_code}*\n` +
    `Huésped: *${reservation.user_name || 'Sin nombre'}*\n` +
    `Teléfono: *${reservation.phone_number}*\n` +
    `Cabaña: *${reservation.cabin_name}*\n` +
    `Fechas: *${reservation.start_date} al ${reservation.end_date}*\n` +
    `Personas: *${reservation.personas}*\n` +
    `Total: *HNL ${Number(reservation.total_price).toLocaleString('es-HN')}*\n` +
    (reservation.status === 'pendiente_autorizacion'
      ? `Anticipo (${payment.deposit_percentage}%): *HNL ${amounts.deposit.toLocaleString('es-HN', { minimumFractionDigits: 2 })}*\n` +
        (!payment.bank_accounts.length ? '⚠️ Configura las cuentas bancarias en el panel antes de autorizar.\n' : '')
      : '') +
    (receipt ? `Comprobante: ${receipt}` : 'Comprobante: aún no permitido');
}

async function sendReview(bot, to, reservation) {
  const preapproval = reservation.status === 'pendiente_autorizacion';
  const payment = await getPaymentSettings();
  const body = reviewText(reservation, payment);
  return sendReplyButtons(bot, to, {
    header: 'Revisión administrativa',
    body,
    footer: 'Solo administradores autorizados',
    buttons: [
      { id: `${preapproval ? 'admin_authorize' : 'admin_approve'}_${reservation.reservation_id}`, title: preapproval ? 'Autorizar pago' : 'Confirmar' },
      { id: `admin_reject_${reservation.reservation_id}`, title: 'Rechazar' },
      { id: `admin_details_${reservation.reservation_id}`, title: 'Ver detalles' }
    ],
    fallbackText: `${body}\n\n/aprobar ${reservation.confirmation_code}\n/rechazar ${reservation.confirmation_code} MOTIVO`
  });
}

async function notifyWhatsAppAdmins(bot, reservationId) {
  const reservation = await getReservationForReview(reservationId);
  if (!reservation) throw new Error('Reserva no encontrada para notificación administrativa');

  const admins = [...await getAdminNumbers()];
  if (!admins.length) {
    logger.warn('No hay números administrativos de WhatsApp configurados', { reservationId });
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  for (const number of admins) {
    try {
      await sendReview(bot, number, reservation);
      sent += 1;
    } catch (error) {
      failed += 1;
      logger.error('No se pudo avisar a un administrador por WhatsApp', {
        reservationId, code: error.response?.data?.error?.code
      });
    }
  }
  return { sent, failed };
}

async function sendPendingReviewsToAdmin(bot, phoneNumber, limit = 5) {
  const rows = await runQuery(`SELECT reservation_id FROM Reservations
    WHERE status IN ('pendiente_autorizacion', 'pendiente_verificacion')
    ORDER BY CASE WHEN receipt_received_at IS NULL THEN 1 ELSE 0 END, receipt_received_at DESC, reservation_id DESC LIMIT ?`,
    [Math.min(Math.max(Number(limit) || 5, 1), 10)]);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const reservation = await getReservationForReview(row.reservation_id);
      if (reservation) await sendReview(bot, phoneNumber, reservation);
      sent += 1;
    } catch (error) {
      failed += 1;
      logger.error('No se pudo reenviar una solicitud pendiente al administrador', {
        reservationId: row.reservation_id, code: error.response?.data?.error?.code
      });
    }
  }
  return { sent, failed, total: rows.length };
}

async function handleAdminMessage(bot, sender, text) {
  if (!await isAdminSender(sender)) return false;
  const input = String(text || '').trim();
  const state = await obtenerEstado(sender);
  const lower = input.toLowerCase();
  const explicitAdminAction = lower === '/admin' || lower.startsWith('/aprobar ') ||
    lower.startsWith('/confirmar ') || lower.startsWith('/rechazar ') || lower.startsWith('/reserva ') ||
    lower.startsWith('admin_');
  const adminSession = String(state.estado || '').startsWith('ADMIN_');

  // Un número administrador también puede probar el flujo normal como huésped.
  if (!adminSession && !explicitAdminAction) return false;
  if (lower === '/cliente') {
    await establecerEstado(sender, null, {});
    await bot.sendMessage(sender, { text: 'Modo huésped activado. Escribe “menú” para comenzar.' });
    return true;
  }

  if (state.estado === 'ADMIN_REJECTION_REASON') {
    if (input.toLowerCase() === 'cancelar') {
      await establecerEstado(sender, 'ADMIN_READY', {});
      await bot.sendMessage(sender, { text: 'Operación cancelada.' });
      return true;
    }
    if (input.length < 3) {
      await bot.sendMessage(sender, { text: 'Escribe un motivo de al menos 3 caracteres o “cancelar”.' });
      return true;
    }
    const result = await rejectReservation(state.datos.reservationId, normalizeRecipient(sender), input.slice(0, 300));
    await establecerEstado(sender, 'ADMIN_READY', {});
    await bot.sendMessage(sender, {
      text: result.ok
        ? `❌ Solicitud ${result.reservation.confirmation_code} rechazada.${result.reservation.notification_status === 'sent' ? ' Huésped notificado.' : ' Aviso al huésped pendiente.'}`
        : `No se pudo rechazar: ${result.code}.`
    });
    return true;
  }

  const authorizeMatch = input.match(/^admin_authorize_(\d+)$/);
  if (authorizeMatch) {
    const result = await authorizePayment(Number(authorizeMatch[1]), normalizeRecipient(sender));
    await bot.sendMessage(sender, { text: result.ok
      ? `✅ Pago autorizado para ${result.reservation.confirmation_code}. El huésped ya puede enviar el comprobante.`
      : `No se pudo autorizar: ${result.code}.` });
    return true;
  }

  const approveMatch = input.match(/^admin_approve_(\d+)$/) || input.match(/^\/(?:aprobar|confirmar)\s+(.+)$/i);
  if (approveMatch) {
    const id = parseReservationId(approveMatch[1]);
    const current = id ? await getReservationForReview(id) : null;
    const result = !current ? { ok: false, code: 'INVALID_ID' }
      : current.status === 'pendiente_autorizacion'
        ? await authorizePayment(id, normalizeRecipient(sender))
        : await approveReservation(id, normalizeRecipient(sender));
    await bot.sendMessage(sender, {
      text: result.ok
        ? result.reservation.status === 'esperando_pago'
          ? `✅ Pago autorizado para ${result.reservation.confirmation_code}. Huésped habilitado para enviar comprobante.`
          : `✅ Reserva ${result.reservation.confirmation_code} confirmada.${result.reservation.notification_status === 'sent' ? ' Huésped notificado.' : ' Aviso al huésped pendiente.'}`
        : `No se pudo confirmar: ${result.code}.`
    });
    return true;
  }

  const rejectButton = input.match(/^admin_reject_(\d+)$/);
  const rejectCommand = input.match(/^\/rechazar\s+(\S+)(?:\s+(.+))?$/i);
  if (rejectButton || rejectCommand) {
    const id = parseReservationId(rejectButton?.[1] || rejectCommand?.[1]);
    const inlineReason = rejectCommand?.[2]?.trim();
    if (!id) {
      await bot.sendMessage(sender, { text: 'Código de reserva inválido.' });
      return true;
    }
    if (inlineReason && inlineReason.length >= 3) {
      const result = await rejectReservation(id, normalizeRecipient(sender), inlineReason.slice(0, 300));
      await bot.sendMessage(sender, { text: result.ok ? `❌ Solicitud ${result.reservation.confirmation_code} rechazada.` : `No se pudo rechazar: ${result.code}.` });
      return true;
    }
    await establecerEstado(sender, 'ADMIN_REJECTION_REASON', { reservationId: id });
    await bot.sendMessage(sender, { text: `Escribe el motivo para rechazar la solicitud VJ-${String(id).padStart(6, '0')}, o escribe “cancelar”.` });
    return true;
  }

  const detailsMatch = input.match(/^admin_details_(\d+)$/) || input.match(/^\/reserva\s+(.+)$/i);
  if (detailsMatch) {
    const id = parseReservationId(detailsMatch[1]);
    const reservation = id ? await getReservationForReview(id) : null;
    await bot.sendMessage(sender, { text: reservation ? reviewText(reservation) : 'Reserva no encontrada.' });
    return true;
  }

  await bot.sendMessage(sender, {
    text: '🔐 *ADMINISTRACIÓN VILLAS JULIE*\n\n' +
      'Recibirás aquí las solicitudes que esperan autorización de pago y las que tienen un comprobante pendiente de revisión.\n\n' +
      'Comandos de respaldo:\n' +
      '• /aprobar VJ-000001\n' +
      '• /rechazar VJ-000001 motivo\n' +
      '• /reserva VJ-000001\n' +
      '• /cliente para volver al menú de huéspedes'
  });
  await establecerEstado(sender, 'ADMIN_READY', {});
  return true;
}

module.exports = {
  getAdminNumbers, isAdminSender, parseReservationId, notifyWhatsAppAdmins,
  sendPendingReviewsToAdmin, handleAdminMessage, reviewText
};
