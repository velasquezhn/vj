const crypto = require('crypto');
const express = require('express');
const logger = require('../config/logger');
const { loadConfig } = require('../config/env');
const { WhatsAppCloudService } = require('../services/whatsappCloudService');
const { BUTTON_IDS } = require('../services/whatsappConversation');

const processed = new Map();
const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

function safeEqual(left, right) {
  const a = Buffer.from(left || '');
  const b = Buffer.from(right || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifySignature(rawBody, signature, appSecret) {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  return safeEqual(expected, signature);
}

function extractEvents(payload) {
  const events = [];
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {};
    for (const status of value.statuses || []) events.push({ kind: 'status', status });
    for (const message of value.messages || []) events.push({ kind: 'message', message, contact: value.contacts?.[0] });
  }
  return events;
}

function normalizeInteractiveReply(value) {
  const reply = String(value || '').trim();
  const numbered = reply.match(/^(?:main|cabin|activity|post)_(\d+)$/);
  if (numbered) return numbered[1];
  const commands = {
    [BUTTON_IDS.DETAIL_BACK]: '1', [BUTTON_IDS.DETAIL_RESERVE]: '2', [BUTTON_IDS.DETAIL_MENU]: '0',
    [BUTTON_IDS.DATES_YES]: 'sí', [BUTTON_IDS.DATES_NO]: 'no',
    [BUTTON_IDS.TERMS_ACCEPT]: 'sí', [BUTTON_IDS.TERMS_DECLINE]: 'no',
    [BUTTON_IDS.ACTIVITIES_MORE]: '1', [BUTTON_IDS.MAIN_MENU]: 'menu',
    [BUTTON_IDS.RESERVATION_START]: '2', [BUTTON_IDS.WEATHER_RETRY]: '1',
    [BUTTON_IDS.POST_CANCEL_YES]: '1', [BUTTON_IDS.POST_CANCEL_NO]: '2',
    [BUTTON_IDS.HELP_REQUEST]: 'ayuda'
  };
  return commands[reply] || reply;
}

function messageText(message) {
  const interactiveId = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id;
  if (interactiveId) return normalizeInteractiveReply(interactiveId);
  return message.text?.body || message.button?.payload || message.button?.text ||
    message.image?.caption || message.document?.caption || '';
}

function flowReply(message) {
  const raw = message.interactive?.nfm_reply?.response_json;
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

function createEventStore() {
  const { runExecute } = require('../db');
  return {
    async claim(id, type, status = null) {
      if (type === 'status') {
        const inserted = await runExecute(
          `INSERT OR IGNORE INTO WhatsAppEvents(message_id, event_type, status) VALUES (?, 'status', ?)`,
          [id, status]
        );
        if (inserted.changes === 1) return true;
        const updated = await runExecute(`UPDATE WhatsAppEvents
          SET status = ?, received_at = CURRENT_TIMESTAMP
          WHERE message_id = ? AND event_type = 'status' AND COALESCE(status, '') <> COALESCE(?, '')`,
        [status, id, status]);
        return updated.changes === 1;
      }
      const result = await runExecute(
        'INSERT OR IGNORE INTO WhatsAppEvents(message_id, event_type, status) VALUES (?, ?, ?)',
        [id, type, status]
      );
      if (result.changes === 1) return true;
      // Un evento fallido puede reintentarse cuando Meta lo reenvía. La condición
      // sobre error evita que dos entregas concurrentes reclamen el mismo mensaje.
      const retry = await runExecute(`UPDATE WhatsAppEvents
        SET error = NULL, received_at = CURRENT_TIMESTAMP
        WHERE message_id = ? AND event_type = ? AND processed_at IS NULL AND error IS NOT NULL`, [id, type]);
      return retry.changes === 1;
    },
    complete(id) {
      return runExecute('UPDATE WhatsAppEvents SET processed_at = CURRENT_TIMESTAMP, error = NULL WHERE message_id = ?', [id]);
    },
    fail(id, error) {
      return runExecute('UPDATE WhatsAppEvents SET error = ? WHERE message_id = ?', [String(error).slice(0, 500), id]);
    }
  };
}

function createSenderQueue() {
  const pending = new Map();
  return async function enqueue(sender, work) {
    const previous = pending.get(sender) || Promise.resolve();
    const current = previous.catch(() => undefined).then(work);
    pending.set(sender, current);
    try {
      return await current;
    } finally {
      if (pending.get(sender) === current) pending.delete(sender);
    }
  };
}

function createWhatsAppWebhook(options = {}) {
  const config = options.config || loadConfig({ validateWhatsApp: true }).whatsapp;
  const client = options.client || new WhatsAppCloudService({ config });
  // Carga diferida: permite probar/verificar el webhook sin abrir SQLite.
  const processMessage = options.processMessage || require('../controllers/messageHandler').procesarMensaje;
  const eventStore = options.eventStore || createEventStore();
  const enqueue = options.enqueue || createSenderQueue();
  const router = express.Router();

  router.get('/', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && safeEqual(req.query['hub.verify_token'], config.verifyToken)) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.sendStatus(403);
  });

  router.post('/', express.raw({ type: 'application/json', limit: '2mb' }), (req, res) => {
    if (!verifySignature(req.body, req.get('x-hub-signature-256'), config.appSecret)) return res.sendStatus(401);
    let payload;
    try { payload = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
    res.sendStatus(200);

    setImmediate(async () => {
      for (const event of extractEvents(payload)) {
        try {
        if (event.kind === 'status') {
          if (await eventStore.claim(event.status.id, 'status', event.status.status)) {
            logger.info('Estado de mensaje WhatsApp', { messageId: event.status.id, status: event.status.status });
          }
          continue;
        }
        const { message } = event;
        if (!message.id || processed.has(message.id)) continue;
        const sender = `${message.from}@s.whatsapp.net`;
        await enqueue(sender, async () => {
          if (processed.has(message.id)) return;
          if (!await eventStore.claim(message.id, 'message')) return;
          processed.set(message.id, Date.now());
          for (const [id, timestamp] of processed) if (Date.now() - timestamp > DEDUPE_TTL_MS) processed.delete(id);
          const normalized = { key: { remoteJid: sender, fromMe: false }, message: {} };
          if (message.type === 'image') normalized.message.imageMessage = message.image;
          else if (message.type === 'document') normalized.message.documentMessage = message.document;
          else normalized.message.conversation = messageText(message);
          const submittedFlow = flowReply(message);
          if (submittedFlow) normalized.flowReply = submittedFlow;
          try {
            await processMessage(client, sender, messageText(message), normalized);
            await eventStore.complete(message.id);
          } catch (error) {
            processed.delete(message.id);
            await eventStore.fail(message.id, error.message);
            logger.error('Error procesando webhook de WhatsApp', { messageId: message.id, error: error.message });
          }
        });
        } catch (error) {
          logger.error('Error almacenando evento de WhatsApp', {
            messageId: event.message?.id || event.status?.id,
            error: error.message
          });
        }
      }
    });
  });
  return router;
}

module.exports = {
  createWhatsAppWebhook,
  verifySignature,
  extractEvents,
  createEventStore,
  createSenderQueue,
  messageText,
  flowReply,
  normalizeInteractiveReply
};
