const express = require('express');
const router = express.Router();
const settings = require('../services/whatsappAdminSettingsService');
const logger = require('../config/logger');
const { WhatsAppCloudService } = require('../services/whatsappCloudService');
const { sendPendingReviewsToAdmin } = require('../services/whatsappAdminService');

async function testDelivery(admin) {
  if (!admin?.is_active) return { sent: false, pendingSent: 0, code: 'ADMIN_INACTIVE' };
  const client = new WhatsAppCloudService();
  try {
    await client.sendMessage(admin.phone_number, {
      text: `✅ *ADMINISTRADOR CONECTADO*\n\n${admin.display_name || 'Administrador'}, este número ya puede recibir y revisar solicitudes de Villas Julie.\n\nEscribe */admin* para ver los comandos disponibles.`
    });
    const pending = await sendPendingReviewsToAdmin(client, admin.phone_number);
    return { sent: true, pendingSent: pending.sent, pendingFailed: pending.failed };
  } catch (error) {
    const code = error.response?.data?.error?.code || 'META_DELIVERY_FAILED';
    logger.warn('No se pudo enviar la prueba al administrador de WhatsApp', { adminId: admin.id, code });
    return { sent: false, pendingSent: 0, code };
  }
}

function handleError(res, error) {
  if (error.code === 'INVALID_PHONE') return res.status(400).json({ success: false, message: error.message });
  if (error.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ success: false, message: 'Ese número ya está registrado' });
  console.error('Error managing WhatsApp administrators:', error.message);
  return res.status(500).json({ success: false, message: 'No se pudo actualizar la configuración' });
}

router.get('/', async (_req, res) => {
  try { res.json({ success: true, data: await settings.listAdmins() }); }
  catch (error) { handleError(res, error); }
});

router.post('/', async (req, res) => {
  try {
    const admin = await settings.createAdmin(req.body || {});
    return res.status(201).json({ success: true, data: admin, whatsapp: await testDelivery(admin) });
  }
  catch (error) { handleError(res, error); }
});

router.post('/:id/test', async (req, res) => {
  try {
    const admin = await settings.getAdmin(Number(req.params.id));
    if (!admin) return res.status(404).json({ success: false, message: 'Administrador no encontrado' });
    return res.json({ success: true, whatsapp: await testDelivery(admin) });
  } catch (error) { return handleError(res, error); }
});

router.put('/:id', async (req, res) => {
  try {
    const item = await settings.updateAdmin(Number(req.params.id), req.body || {});
    if (!item) return res.status(404).json({ success: false, message: 'Administrador no encontrado' });
    return res.json({ success: true, data: item });
  } catch (error) { return handleError(res, error); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!await settings.deleteAdmin(Number(req.params.id))) return res.status(404).json({ success: false, message: 'Administrador no encontrado' });
    return res.json({ success: true });
  } catch (error) { return handleError(res, error); }
});

module.exports = router;
