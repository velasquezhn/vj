const express = require('express');
const logger = require('../config/logger');
const { getPaymentSettings, updatePaymentSettings } = require('../services/paymentSettingsService');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    return res.json({ success: true, data: await getPaymentSettings() });
  } catch (error) {
    logger.error('No se pudo consultar la configuración de pagos', { error: error.message });
    return res.status(500).json({ success: false, code: 'PAYMENT_SETTINGS_READ_ERROR' });
  }
});

router.put('/', async (req, res) => {
  try {
    const data = await updatePaymentSettings(req.body || {}, req.user.adminId);
    return res.json({ success: true, data });
  } catch (error) {
    if (String(error.code || '').startsWith('INVALID_')) {
      return res.status(400).json({ success: false, code: error.code, message: error.message });
    }
    logger.error('No se pudo actualizar la configuración de pagos', { error: error.message });
    return res.status(500).json({ success: false, code: 'PAYMENT_SETTINGS_UPDATE_ERROR' });
  }
});

module.exports = router;
