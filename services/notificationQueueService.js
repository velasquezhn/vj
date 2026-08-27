const { runQuery, runExecute } = require('../db');
const logger = require('../config/logger');
const { WhatsAppCloudService, normalizeRecipient } = require('./whatsappCloudService');

const RETRY_DELAYS_MINUTES = [1, 5, 15, 60, 240];
let timer = null;
let processing = false;

function safeErrorCode(error) {
  return String(error?.response?.data?.error?.code || error?.code || 'DELIVERY_FAILED').slice(0, 80);
}

function isRetryable(error) {
  if (typeof error?.retryable === 'boolean') return error.retryable;
  const status = Number(error?.response?.status || 0);
  return !status || status === 408 || status === 409 || status === 429 || status >= 500;
}

async function enqueue({ recipient, kind = 'generic', payload = {}, reservationId = null, idempotencyKey = null, maxAttempts = 5 }) {
  const phone = normalizeRecipient(recipient);
  if (!phone) throw new Error('Destinatario inválido para la cola de notificaciones');
  const attempts = Math.min(Math.max(Number(maxAttempts) || 5, 1), 10);
  const result = await runExecute(`INSERT OR IGNORE INTO OutboundMessages
    (idempotency_key, recipient, message_kind, payload_json, reservation_id, max_attempts)
    VALUES (?, ?, ?, ?, ?, ?)`, [
    idempotencyKey || null,
    phone,
    String(kind).slice(0, 40),
    JSON.stringify(payload || {}),
    reservationId || null,
    attempts
  ]);
  if (result.changes) return result.lastID;
  if (!idempotencyKey) return null;
  const existing = await runQuery('SELECT outbound_id FROM OutboundMessages WHERE idempotency_key = ?', [idempotencyKey]);
  return existing[0]?.outbound_id || null;
}

async function deliver(job, client) {
  const payload = JSON.parse(job.payload_json || '{}');
  if (job.message_kind === 'guest_decision') {
    const { getReservationForReview, notifyGuest } = require('./reservationApprovalService');
    const reservation = await getReservationForReview(job.reservation_id);
    if (!reservation) {
      const error = new Error('Reserva no encontrada');
      error.retryable = false;
      error.code = 'RESERVATION_NOT_FOUND';
      throw error;
    }
    return notifyGuest(reservation, payload.decision, client);
  }
  if (job.message_kind === 'admin_review') {
    const { getReservationForReview } = require('./reservationApprovalService');
    const { sendReview } = require('./whatsappAdminService');
    const reservation = await getReservationForReview(job.reservation_id);
    if (!reservation) {
      const error = new Error('Reserva no encontrada');
      error.retryable = false;
      error.code = 'RESERVATION_NOT_FOUND';
      throw error;
    }
    return sendReview(client, job.recipient, reservation);
  }
  return client.sendMessage(job.recipient, payload);
}

async function markReservation(job, status) {
  if (!job.reservation_id || job.message_kind !== 'guest_decision') return;
  await runExecute('UPDATE Reservations SET notification_status = ?, updated_at = CURRENT_TIMESTAMP WHERE reservation_id = ?', [status, job.reservation_id]);
}

async function processJob(job, client) {
  try {
    const result = await deliver(job, client);
    const providerId = result?.messages?.[0]?.id || null;
    await runExecute(`UPDATE OutboundMessages SET status = 'sent', attempts = attempts + 1,
      provider_message_id = ?, last_error_code = NULL, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE outbound_id = ?`, [providerId, job.outbound_id]);
    await markReservation(job, 'sent');
    logger.info('Notificación pendiente enviada', { outboundId: job.outbound_id, kind: job.message_kind, reservationId: job.reservation_id });
    return true;
  } catch (error) {
    const nextAttempt = job.attempts + 1;
    const retry = isRetryable(error) && nextAttempt < job.max_attempts;
    const delay = RETRY_DELAYS_MINUTES[Math.min(nextAttempt - 1, RETRY_DELAYS_MINUTES.length - 1)];
    await runExecute(`UPDATE OutboundMessages SET status = ?, attempts = ?, last_error_code = ?,
      next_attempt_at = datetime('now', ?), updated_at = CURRENT_TIMESTAMP WHERE outbound_id = ?`, [
      retry ? 'pending' : 'dead', nextAttempt, safeErrorCode(error), `+${delay} minutes`, job.outbound_id
    ]);
    await markReservation(job, retry ? 'queued' : 'failed');
    logger.warn('Notificación pendiente no entregada', {
      outboundId: job.outbound_id, kind: job.message_kind, reservationId: job.reservation_id,
      code: safeErrorCode(error), willRetry: retry
    });
    return false;
  }
}

async function processPending(options = {}) {
  if (processing) return { processed: 0, skipped: true };
  processing = true;
  try {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
    const jobs = await runQuery(`SELECT * FROM OutboundMessages
      WHERE status = 'pending' AND datetime(next_attempt_at) <= datetime('now')
      ORDER BY next_attempt_at, outbound_id LIMIT ?`, [limit]);
    if (!jobs.length) return { processed: 0, sent: 0, failed: 0 };
    const client = options.client || new WhatsAppCloudService();
    let sent = 0;
    for (const job of jobs) if (await processJob(job, client)) sent += 1;
    return { processed: jobs.length, sent, failed: jobs.length - sent };
  } finally {
    processing = false;
  }
}

async function list({ status = '', limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const where = status ? 'WHERE status = ?' : '';
  const params = status ? [status, safeLimit, safeOffset] : [safeLimit, safeOffset];
  return runQuery(`SELECT outbound_id AS id, recipient, message_kind, reservation_id, status, attempts,
    max_attempts, next_attempt_at, last_error_code, provider_message_id, created_at, updated_at, sent_at
    FROM OutboundMessages ${where} ORDER BY outbound_id DESC LIMIT ? OFFSET ?`, params);
}

async function stats() {
  const rows = await runQuery('SELECT status, COUNT(*) AS total FROM OutboundMessages GROUP BY status');
  return Object.fromEntries(rows.map((row) => [row.status, row.total]));
}

async function retry(id) {
  const result = await runExecute(`UPDATE OutboundMessages SET status = 'pending', attempts = 0,
    next_attempt_at = CURRENT_TIMESTAMP, last_error_code = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE outbound_id = ? AND status IN ('dead', 'pending')`, [id]);
  return result.changes > 0;
}

function start() {
  if (timer || process.env.NOTIFICATION_QUEUE_ENABLED === 'false') return;
  const interval = Math.max(Number(process.env.NOTIFICATION_QUEUE_INTERVAL_MS) || 60000, 15000);
  timer = setInterval(() => processPending().catch((error) => {
    logger.error('Error procesando notificaciones pendientes', { error: error.message });
  }), interval);
  timer.unref?.();
  processPending().catch((error) => logger.warn('No se pudieron procesar notificaciones al iniciar', { error: error.message }));
  logger.info('Cola persistente de notificaciones iniciada', { intervalMs: interval });
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { enqueue, processPending, list, stats, retry, start, stop, isRetryable };
