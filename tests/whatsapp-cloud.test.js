const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { createWhatsAppWebhook, verifySignature, extractEvents, messageText, normalizeInteractiveReply } = require('../routes/whatsappWebhook');
const { WhatsAppCloudService, normalizeRecipient } = require('../services/whatsappCloudService');
const { sendReplyButtons, sendList } = require('../services/whatsappInteractiveService');
const { parseReservationId, isAdminSender, reviewText } = require('../services/whatsappAdminService');

const config = {
  apiVersion: 'v26.0', accessToken: 'test-token', phoneNumberId: '12345',
  verifyToken: 'verify-me', appSecret: 'app-secret'
};
const eventStore = { claim: async () => true, complete: async () => undefined, fail: async () => undefined };

describe('WhatsApp Business Cloud API', () => {
  test('verifica el challenge del webhook', async () => {
    const app = express().use('/webhooks/whatsapp', createWhatsAppWebhook({ config, client: {}, processMessage: jest.fn(), eventStore }));
    await request(app).get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42').expect(200, '42');
    await request(app).get('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42').expect(403);
  });

  test('valida la firma usando el cuerpo original', () => {
    const body = Buffer.from('{"object":"whatsapp_business_account"}');
    const signature = `sha256=${crypto.createHmac('sha256', config.appSecret).update(body).digest('hex')}`;
    expect(verifySignature(body, signature, config.appSecret)).toBe(true);
    expect(verifySignature(body, 'sha256=00', config.appSecret)).toBe(false);
  });

  test('rechaza firmas inválidas y procesa mensajes válidos', async () => {
    const processMessage = jest.fn().mockResolvedValue(undefined);
    const app = express().use('/webhooks/whatsapp', createWhatsAppWebhook({ config, client: {}, processMessage, eventStore }));
    const payload = { entry: [{ changes: [{ value: { messages: [{ id: 'wamid.1', from: '50499990000', type: 'text', text: { body: 'Hola' } }] } }] }] };
    const raw = JSON.stringify(payload);
    await request(app).post('/webhooks/whatsapp').set('Content-Type', 'application/json').send(raw).expect(401);
    const signature = `sha256=${crypto.createHmac('sha256', config.appSecret).update(raw).digest('hex')}`;
    await request(app).post('/webhooks/whatsapp').set('Content-Type', 'application/json').set('x-hub-signature-256', signature).send(raw).expect(200);
    await new Promise(setImmediate);
    expect(processMessage).toHaveBeenCalledWith(expect.anything(), '50499990000@s.whatsapp.net', 'Hola', expect.anything());
  });

  test('construye payload oficial de texto y normaliza destinatarios', async () => {
    const http = { post: jest.fn().mockResolvedValue({ data: { messages: [{ id: 'wamid.sent' }] } }) };
    const client = new WhatsAppCloudService({ config, http });
    await client.sendMessage('+504 9999-0000@s.whatsapp.net', { text: 'Hola' });
    expect(normalizeRecipient('+504 9999-0000@s.whatsapp.net')).toBe('50499990000');
    expect(http.post).toHaveBeenCalledWith('/12345/messages', expect.objectContaining({ to: '50499990000', type: 'text' }));
  });

  test('construye mensajes interactivos oficiales de Meta', async () => {
    const http = { post: jest.fn().mockResolvedValue({ data: { messages: [{ id: 'wamid.interactive' }] } }) };
    const client = new WhatsAppCloudService({ config, http });
    await client.sendMessage('50499990000', {
      interactive: {
        type: 'button', body: { text: '¿Deseas reservar?' },
        action: { buttons: [{ type: 'reply', reply: { id: 'reservation_start', title: 'Reservar' } }] }
      }
    });
    expect(http.post).toHaveBeenCalledWith('/12345/messages', expect.objectContaining({
      type: 'interactive',
      interactive: expect.objectContaining({ type: 'button' })
    }));
  });

  test('interpreta respuestas de botones y listas como comandos del flujo existente', () => {
    expect(messageText({ interactive: { list_reply: { id: 'main_2', title: 'Reservar ahora' } } })).toBe('2');
    expect(messageText({ interactive: { button_reply: { id: 'dates_yes', title: 'Sí, confirmar' } } })).toBe('sí');
    expect(normalizeInteractiveReply('detail_menu')).toBe('0');
    expect(normalizeInteractiveReply('texto-libre')).toBe('texto-libre');
  });

  test('limita botones y usa respaldo de texto si Meta rechaza el interactivo', async () => {
    const bot = { sendMessage: jest.fn().mockRejectedValueOnce(new Error('unsupported')).mockResolvedValueOnce({ ok: true }) };
    await sendReplyButtons(bot, '50499990000', {
      body: 'Elige',
      buttons: [
        { id: '1', title: 'Uno' }, { id: '2', title: 'Dos' },
        { id: '3', title: 'Tres' }, { id: '4', title: 'Cuatro' }
      ]
    });
    expect(bot.sendMessage.mock.calls[0][1].interactive.action.buttons).toHaveLength(3);
    expect(bot.sendMessage.mock.calls[1][1].text).toContain('1. Uno');
  });

  test('unifica galería, detalle y botones en un mensaje interactivo', async () => {
    const bot = { sendMessage: jest.fn().mockResolvedValue({ ok: true }) };
    await sendReplyButtons(bot, '50499990000', {
      body: 'Detalle de la cabaña',
      headerImage: { url: 'https://cdn.example.com/galeria.jpg' },
      buttons: [{ id: 'reserve', title: 'Reservar' }]
    });
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    expect(bot.sendMessage.mock.calls[0][1]).toEqual(expect.objectContaining({
      interactive: expect.objectContaining({
        header: { type: 'image', image: { link: 'https://cdn.example.com/galeria.jpg' } }
      })
    }));
  });

  test('construye listas con identificadores estables', async () => {
    const bot = { sendMessage: jest.fn().mockResolvedValue({ ok: true }) };
    await sendList(bot, '50499990000', {
      body: 'Menú', buttonText: 'Ver opciones',
      sections: [{ title: 'Servicios', rows: [{ id: 'main_1', title: 'Alojamientos', description: 'Ver cabañas' }] }]
    });
    expect(bot.sendMessage).toHaveBeenCalledWith('50499990000', {
      interactive: expect.objectContaining({
        type: 'list',
        action: expect.objectContaining({ sections: expect.any(Array) })
      })
    });
  });

  test('reintenta errores temporales de Meta sin reintentar errores permanentes', async () => {
    const temporary = Object.assign(new Error('rate limited'), { response: { status: 429, headers: { 'retry-after': '0' }, data: { error: { code: 4 } } } });
    const http = { post: jest.fn().mockRejectedValueOnce(temporary).mockResolvedValueOnce({ data: { messages: [{ id: 'wamid.retry' }] } }) };
    const client = new WhatsAppCloudService({ config, http });
    await expect(client.sendMessage('50499990000', { text: 'Hola' })).resolves.toBeDefined();
    expect(http.post).toHaveBeenCalledTimes(2);

    const permanent = Object.assign(new Error('bad request'), { response: { status: 400, data: { error: { code: 100 } } } });
    http.post.mockReset().mockRejectedValue(permanent);
    await expect(client.sendMessage('50499990000', { text: 'Hola' })).rejects.toThrow('bad request');
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  test('extrae mensajes y estados de entrega', () => {
    const events = extractEvents({ entry: [{ changes: [{ value: { messages: [{ id: '1' }], statuses: [{ id: '2', status: 'delivered' }] } }] }] });
    expect(events.map((event) => event.kind).sort()).toEqual(['message', 'status']);
  });

  test('restringe y entiende comandos administrativos de WhatsApp', async () => {
    process.env.WHATSAPP_ADMIN_NUMBERS = '50487373838, 50492083526';
    expect(await isAdminSender('50487373838@s.whatsapp.net')).toBe(true);
    expect(await isAdminSender('50411112222@s.whatsapp.net')).toBe(false);
    expect(parseReservationId('VJ-000123')).toBe(123);
    expect(parseReservationId('/aprobar 45')).toBe(45);
    expect(reviewText({
      reservation_id: 1, confirmation_code: 'VJ-000001', user_name: 'Ana', phone_number: '50499990000',
      cabin_name: 'Tortuga 1', start_date: '2026-09-01', end_date: '2026-09-03', personas: 2,
      total_price: 3000, comprobante_nombre_archivo: null
    })).toContain('VJ-000001');
    delete process.env.WHATSAPP_ADMIN_NUMBERS;
  });
});
