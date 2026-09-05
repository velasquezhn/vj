const axios = require('axios');
const logger = require('../config/logger');
const { loadConfig } = require('../config/env');

function normalizeRecipient(value) {
  return String(value || '').replace(/@s\.whatsapp\.net$/, '').replace(/^\+/, '').replace(/\D/g, '');
}

class WhatsAppCloudService {
  constructor(options = {}) {
    const config = options.config || loadConfig({ validateWhatsApp: true }).whatsapp;
    this.config = config;
    this.http = options.http || axios.create({
      baseURL: `https://graph.facebook.com/${config.apiVersion}`,
      timeout: 15000,
      headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' }
    });
  }

  async request(payload) {
    const configuredRetries = Number(process.env.WHATSAPP_MAX_RETRIES || 3);
    const maxAttempts = Math.min(Math.max(Number.isFinite(configuredRetries) ? configuredRetries : 3, 0), 5) + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const { data } = await this.http.post(`/${this.config.phoneNumberId}/messages`, payload);
        logger.info('Mensaje de WhatsApp aceptado por Meta', { messageId: data.messages?.[0]?.id, attempt });
        return data;
      } catch (error) {
        const status = error.response?.status;
        const code = error.response?.data?.error?.code;
        const retryable = !status || status === 429 || status >= 500;
        logger.error('Error enviando mensaje de WhatsApp', { status, code, retryable, attempt });
        error.retryable = retryable;
        if (!retryable || attempt === maxAttempts) throw error;
        const retryAfter = Number(error.response?.headers?.['retry-after']);
        const delay = Number.isFinite(retryAfter)
          ? Math.min(Math.max(retryAfter * 1000, 0), 30000)
          : Math.min(500 * (2 ** (attempt - 1)), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async sendMessage(to, content) {
    const recipient = normalizeRecipient(to);
    if (!recipient) throw new Error('Destinatario de WhatsApp inválido');
    const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient };

    if (content.text) {
      const body = String(content.text).trim();
      if (!body) throw new Error('El mensaje de WhatsApp está vacío');
      if (body.length > 4096) throw new Error('El mensaje de WhatsApp supera el límite de 4096 caracteres');
      return this.request({ ...base, type: 'text', text: { body, preview_url: false } });
    }
    if (content.interactive) {
      return this.request({ ...base, type: 'interactive', interactive: content.interactive });
    }
    for (const type of ['image', 'video', 'document']) {
      if (content[type]) {
        const media = content[type];
        const payload = media.id ? { id: media.id } : { link: media.url };
        if (content.caption && type !== 'document') payload.caption = content.caption;
        if (content.caption && type === 'document') payload.caption = content.caption;
        return this.request({ ...base, type, [type]: payload });
      }
    }
    throw new Error('Tipo de mensaje no compatible con WhatsApp Cloud API');
  }

  sendTemplate(to, name, language = 'es', components = []) {
    return this.request({
      messaging_product: 'whatsapp', to: normalizeRecipient(to), type: 'template',
      template: { name, language: { code: language }, components }
    });
  }

  async downloadMedia(mediaId) {
    const metadata = await this.http.get(`/${mediaId}`);
    const response = await axios.get(metadata.data.url, {
      responseType: 'arraybuffer', timeout: 20000,
      headers: { Authorization: `Bearer ${this.config.accessToken}` }
    });
    return { buffer: Buffer.from(response.data), mimetype: metadata.data.mime_type };
  }
}

module.exports = { WhatsAppCloudService, normalizeRecipient };
