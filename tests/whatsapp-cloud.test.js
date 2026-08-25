const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { createWhatsAppWebhook, verifySignature, extractEvents } = require('../routes/whatsappWebhook');
const { WhatsAppCloudService, normalizeRecipient } = require('../services/whatsappCloudService');

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
});
