const express = require('express');
const queue = require('../services/notificationQueueService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [items, stats] = await Promise.all([queue.list(req.query), queue.stats()]);
    res.json({ success: true, data: items, stats });
  } catch (error) { next(error); }
});

router.post('/:id/retry', async (req, res, next) => {
  try {
    const updated = await queue.retry(Number(req.params.id));
    if (!updated) return res.status(404).json({ success: false, message: 'Notificación no encontrada o ya enviada' });
    queue.processPending().catch(() => {});
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

module.exports = router;
