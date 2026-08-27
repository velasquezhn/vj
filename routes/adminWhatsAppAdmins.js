const express = require('express');
const router = express.Router();
const settings = require('../services/whatsappAdminSettingsService');

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
  try { res.status(201).json({ success: true, data: await settings.createAdmin(req.body || {}) }); }
  catch (error) { handleError(res, error); }
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
