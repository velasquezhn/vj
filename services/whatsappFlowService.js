const crypto = require('crypto');
const logger = require('../config/logger');

/**
 * Builds the native WhatsApp Flow used to capture a reservation without
 * opening a browser. The Flow ID is intentionally optional: until Meta
 * publishes the Flow, the caller can safely use the conversational fallback.
 */
function buildReservationFlowMessage(flowId, options = {}) {
  const id = String(flowId || '').trim();
  if (!id) return null;
  return {
    interactive: {
      type: 'flow',
      header: { type: 'text', text: options.header || 'Nueva reserva' },
      body: { text: options.body || 'Selecciona tu cabaña, fechas y número de huéspedes.' },
      footer: { text: options.footer || 'Villas Julie · Tela' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_id: id,
          flow_cta: 'Reservar ahora',
          flow_token: crypto.randomUUID()
        }
      }
    }
  };
}

async function sendReservationFlow(bot, to, flowId) {
  const message = buildReservationFlowMessage(flowId);
  if (!message) return false;
  try {
    await bot.sendMessage(to, message);
    return true;
  } catch (error) {
    logger.warn('No se pudo enviar el WhatsApp Flow; se usará el flujo conversacional', {
      status: error.response?.status,
      code: error.response?.data?.error?.code
    });
    return false;
  }
}

module.exports = { buildReservationFlowMessage, sendReservationFlow };
