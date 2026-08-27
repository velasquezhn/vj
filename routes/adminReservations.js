const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const { 
  validateAdminReservation,
  validateNumericId,
  validateReservationFilters,
  sanitizeRequestData,
  logAdminActivity
} = require('../middleware/apiValidation');
const logger = require('../config/logger');
const { COMPROBANTES_DIR, ALLOWED_MIME_TYPES, MAX_RECEIPT_BYTES } = require('../services/comprobanteService');
const { authorizePayment, approveReservation, rejectReservation } = require('../services/reservationApprovalService');

// Setup multer for file uploads to public/comprobantes
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = COMPROBANTES_DIR;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Use timestamp + original name to avoid conflicts
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_MIME_TYPES.has(file.mimetype))
});

/**
 * @swagger
 * /admin/reservations:
 *   get:
 *     tags: [Reservations]
 *     summary: Listar reservas
 *     description: Obtiene todas las reservas con filtros opcionales y paginación
 *     parameters:
 *       - $ref: '#/components/parameters/LimitParam'
 *       - $ref: '#/components/parameters/OffsetParam'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pendiente_autorizacion, esperando_pago, pendiente_verificacion, confirmada, rechazada, cancelada, expirada]
 *           example: confirmado
 *         description: Filtrar por estado de la reserva
 *       - in: query
 *         name: cabin_id
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Filtrar por ID de cabaña
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Filtrar por ID de usuario
 *       - in: query
 *         name: start_date_from
 *         schema:
 *           type: string
 *           format: date
 *           example: 2024-08-01
 *         description: Fecha de inicio mínima (YYYY-MM-DD)
 *       - in: query
 *         name: start_date_to
 *         schema:
 *           type: string
 *           format: date
 *           example: 2024-08-31
 *         description: Fecha de inicio máxima (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Lista de reservas obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Reservation'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     offset:
 *                       type: integer
 *                       example: 0
 *                     total:
 *                       type: integer
 *                       example: 45
 *       401:
 *         description: Token no válido o no proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security:
 *       - bearerAuth: []
 */
// GET /
router.get('/', 
  authenticateToken,
  sanitizeRequestData,
  validateReservationFilters,
  logAdminActivity('list_reservations'),
  async (req, res) => {
  try {
    let sql = `
      SELECT r.reservation_id, r.cabin_id, r.user_id, r.start_date, r.end_date, r.status, r.total_price, r.comprobante_nombre_archivo,
             r.personas, r.confirmation_code, r.receipt_received_at, r.reviewed_at, r.reviewed_by,
             r.rejection_reason, r.notification_status, r.payment_authorized_at,
             r.payment_authorized_by, r.payment_due_at,
             u.name AS user_name,
             u.phone_number AS phone_number,
             c.name AS cabin_name,
             c.capacity AS cabin_capacity
      FROM Reservations r
      LEFT JOIN Users u ON r.user_id = u.user_id
      LEFT JOIN Cabins c ON r.cabin_id = c.cabin_id
    `;
    
    const conditions = [];
    const params = [];
    
    // Usar valores validados con defaults
    const limit = req.query.limit || 50;
    const offset = req.query.offset || 0;
    
    // Aplicar filtros validados
    if (req.query.status) {
      conditions.push('r.status = ?');
      params.push(req.query.status);
    }
    
    if (req.query.cabin_id) {
      conditions.push('r.cabin_id = ?');
      params.push(req.query.cabin_id);
    }
    
    if (req.query.user_id) {
      conditions.push('r.user_id = ?');
      params.push(req.query.user_id);
    }
    
    if (req.query.start_date_from) {
      conditions.push('r.start_date >= ?');
      params.push(req.query.start_date_from);
    }
    
    if (req.query.start_date_to) {
      conditions.push('r.start_date <= ?');
      params.push(req.query.start_date_to);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' ORDER BY r.created_at DESC';
    
    // Aplicar limit y offset con valores seguros
    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const reservations = await db.runQuery(sql, params);
    
    logger.info('Reservas consultadas exitosamente', {
      adminUser: req.user.username,
      filtersApplied: Object.keys(req.query).length,
      resultsCount: reservations.length
    });
    
    res.json({
      success: true,
      data: reservations,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: reservations.length
      }
    });
  } catch (error) {
    logger.error('Error consultando reservas administrativas', { 
      error: error.message,
      adminUser: req.user?.username
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Error consultando reservas',
      code: 'DATABASE_ERROR'
    });
  }
});

// POST /:id/authorize-payment - autorización previa obligatoria antes del comprobante
router.post('/:id/authorize-payment',
  authenticateToken,
  validateNumericId('id'),
  logAdminActivity('authorize_reservation_payment'),
  async (req, res) => {
    try {
      const result = await authorizePayment(req.params.id, req.user.adminId);
      if (!result.ok) return res.status(result.status).json({ success: false, code: result.code, currentStatus: result.currentStatus });
      return res.json({
        success: true,
        message: result.alreadyProcessed ? 'El pago ya estaba autorizado' : 'Pago autorizado',
        data: result.reservation,
        notificationSent: result.reservation.notification_status === 'sent'
      });
    } catch (error) {
      logger.error('Error autorizando pago', { reservationId: req.params.id, error: error.message });
      return res.status(500).json({ success: false, code: 'PAYMENT_AUTHORIZATION_ERROR' });
    }
  }
);

// POST /:id/approve - confirmación final después de verificar el comprobante
router.post('/:id/approve',
  authenticateToken,
  validateNumericId('id'),
  logAdminActivity('approve_reservation'),
  async (req, res) => {
    try {
      const result = await approveReservation(req.params.id, req.user.adminId);
      if (!result.ok) {
        return res.status(result.status).json({
          success: false,
          code: result.code,
          currentStatus: result.currentStatus
        });
      }
      return res.json({
        success: true,
        message: result.alreadyProcessed ? 'La reserva ya estaba confirmada' : 'Reserva confirmada',
        data: result.reservation,
        notificationSent: result.reservation.notification_status === 'sent'
      });
    } catch (error) {
      logger.error('Error aprobando reserva', { reservationId: req.params.id, error: error.message });
      return res.status(500).json({ success: false, code: 'APPROVAL_ERROR' });
    }
  }
);

// POST /:id/reject - rechazo con motivo y aviso al huésped
router.post('/:id/reject',
  authenticateToken,
  validateNumericId('id'),
  sanitizeRequestData,
  logAdminActivity('reject_reservation'),
  async (req, res) => {
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3 || reason.length > 300) {
      return res.status(400).json({ success: false, code: 'INVALID_REJECTION_REASON' });
    }
    try {
      const result = await rejectReservation(req.params.id, req.user.adminId, reason);
      if (!result.ok) {
        return res.status(result.status).json({
          success: false,
          code: result.code,
          currentStatus: result.currentStatus
        });
      }
      return res.json({
        success: true,
        message: 'Solicitud rechazada',
        data: result.reservation,
        notificationSent: result.reservation.notification_status === 'sent'
      });
    } catch (error) {
      logger.error('Error rechazando reserva', { reservationId: req.params.id, error: error.message });
      return res.status(500).json({ success: false, code: 'REJECTION_ERROR' });
    }
  }
);

/**
 * @swagger
 * /admin/reservations:
 *   post:
 *     tags: [Reservations]
 *     summary: Crear nueva reserva
 *     description: Crea una nueva reserva con opción de subir comprobante de pago
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - cabin_id
 *               - user_id
 *               - start_date
 *               - end_date
 *               - number_of_people
 *             properties:
 *               cabin_id:
 *                 type: integer
 *                 example: 1
 *                 description: ID de la cabaña a reservar
 *               user_id:
 *                 type: integer
 *                 example: 1
 *                 description: ID del usuario que realiza la reserva
 *               start_date:
 *                 type: string
 *                 format: date
 *                 example: 2024-08-15
 *                 description: Fecha de check-in (YYYY-MM-DD)
 *               end_date:
 *                 type: string
 *                 format: date
 *                 example: 2024-08-17
 *                 description: Fecha de check-out (YYYY-MM-DD)
 *               status:
 *                 type: string
 *                 enum: [pendiente_autorizacion, esperando_pago, pendiente_verificacion, confirmada, rechazada, cancelada, expirada]
 *                 default: pendiente_autorizacion
 *                 example: pendiente_autorizacion
 *               total_price:
 *                 type: number
 *                 format: decimal
 *                 example: 300.00
 *                 description: Precio total de la reserva
 *               number_of_people:
 *                 type: integer
 *                 example: 2
 *                 description: Número de personas para la reserva
 *               comprobante:
 *                 type: string
 *                 format: binary
 *                 description: Archivo de comprobante de pago (opcional)
 *     responses:
 *       201:
 *         description: Reserva creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Reserva creada exitosamente
 *                 data:
 *                   type: object
 *                   properties:
 *                     reservation_id:
 *                       type: integer
 *                       example: 123
 *                     cabin_id:
 *                       type: integer
 *                       example: 1
 *                     user_id:
 *                       type: integer
 *                       example: 1
 *                     start_date:
 *                       type: string
 *                       format: date
 *                       example: 2024-08-15
 *                     end_date:
 *                       type: string
 *                       format: date
 *                       example: 2024-08-17
 *                     status:
 *                       type: string
 *                       example: pendiente_autorizacion
 *                     total_price:
 *                       type: number
 *                       example: 300.00
 *                     number_of_people:
 *                       type: integer
 *                       example: 2
 *                     comprobante_uploaded:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Token no válido o no proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security:
 *       - bearerAuth: []
 */
// POST / - create new reservation with optional comprobante upload
router.post('/', 
  authenticateToken,
  upload.single('comprobante'),
  sanitizeRequestData,
  validateAdminReservation,
  logAdminActivity('create_reservation'),
  async (req, res) => {
  try {
    const { cabin_id, user_id, start_date, end_date, status, total_price, number_of_people } = req.body;
    let comprobante_nombre_archivo = null;
    
    if (req.file) {
      comprobante_nombre_archivo = req.file.filename;
      logger.info('Comprobante subido con nueva reserva', {
        filename: comprobante_nombre_archivo,
        size: req.file.size,
        adminUser: req.user.username
      });
    }
    
    const sql = `
      INSERT INTO Reservations (cabin_id, user_id, start_date, end_date, status, total_price, comprobante_nombre_archivo, personas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await db.runExecute(sql, [cabin_id, user_id, start_date, end_date, status, total_price, comprobante_nombre_archivo, number_of_people]);
    
    logger.info('Reserva administrativa creada exitosamente', {
      reservationId: result.lastID,
      cabinId: cabin_id,
      userId: user_id,
      dateRange: `${start_date} to ${end_date}`,
      guests: number_of_people,
      totalPrice: total_price,
      adminUser: req.user.username
    });
    
    res.status(201).json({ 
      success: true, 
      message: 'Reserva creada exitosamente',
      data: {
        reservation_id: result.lastID,
        cabin_id,
        user_id,
        start_date,
        end_date,
        status,
        total_price,
        number_of_people,
        comprobante_uploaded: !!comprobante_nombre_archivo
      }
    });
  } catch (error) {
    logger.error('Error creando reserva administrativa', { 
      error: error.message,
      requestData: req.body,
      adminUser: req.user?.username
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Error creando reserva',
      code: 'CREATION_ERROR'
    });
  }
});

// PUT /:id - update reservation with optional comprobante upload
router.put('/:id', 
  authenticateToken,
  validateNumericId('id'),
  upload.single('comprobante'),
  sanitizeRequestData,
  validateAdminReservation,
  logAdminActivity('update_reservation'),
  async (req, res) => {
  try {
    const reservationId = req.params.id;
    const { cabin_id, user_id, start_date, end_date, status, total_price, number_of_people } = req.body;
    let comprobante_nombre_archivo = null;
    
    if (req.file) {
      comprobante_nombre_archivo = req.file.filename;
      logger.info('Comprobante actualizado en reserva', {
        reservationId,
        filename: comprobante_nombre_archivo,
        size: req.file.size,
        adminUser: req.user.username
      });
    }

    // Build SQL dynamically to update comprobante_nombre_archivo only if file uploaded
    let sql = `
      UPDATE Reservations
      SET cabin_id = ?, user_id = ?, start_date = ?, end_date = ?, status = ?, total_price = ?, personas = ?
    `;
    const params = [cabin_id, user_id, start_date, end_date, status, total_price, number_of_people];

    if (comprobante_nombre_archivo) {
      sql += `, comprobante_nombre_archivo = ?`;
      params.push(comprobante_nombre_archivo);
    }

    sql += ` WHERE reservation_id = ?`;
    params.push(reservationId);

    const result = await db.runExecute(sql, params);
    
    if (result.changes === 0) {
      logger.warn('Intento de actualizar reserva inexistente', {
        reservationId,
        adminUser: req.user.username
      });
      
      return res.status(404).json({ 
        success: false, 
        message: 'Reserva no encontrada',
        code: 'RESERVATION_NOT_FOUND'
      });
    }
    
    logger.info('Reserva administrativa actualizada exitosamente', {
      reservationId,
      changes: result.changes,
      newStatus: status,
      adminUser: req.user.username
    });
    
    res.json({ 
      success: true,
      message: 'Reserva actualizada exitosamente',
      data: {
        reservation_id: reservationId,
        changes: result.changes,
        comprobante_updated: !!comprobante_nombre_archivo
      }
    });
  } catch (error) {
    logger.error('Error actualizando reserva administrativa', { 
      error: error.message,
      reservationId: req.params.id,
      adminUser: req.user?.username
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Error actualizando reserva',
      code: 'UPDATE_ERROR'
    });
  }
});

// DELETE /:id - delete reservation
router.delete('/:id', 
  authenticateToken,
  validateNumericId('id'),
  logAdminActivity('delete_reservation'),
  async (req, res) => {
  try {
    const reservationId = req.params.id;
    
    // Verificar que la reserva existe antes de eliminar
    const checkSql = `SELECT reservation_id, status FROM Reservations WHERE reservation_id = ?`;
    const existingReservation = await db.runQuery(checkSql, [reservationId]);
    
    if (existingReservation.length === 0) {
      logger.warn('Intento de eliminar reserva inexistente', {
        reservationId,
        adminUser: req.user.username
      });
      
      return res.status(404).json({ 
        success: false, 
        message: 'Reserva no encontrada',
        code: 'RESERVATION_NOT_FOUND'
      });
    }
    
    const sql = `DELETE FROM Reservations WHERE reservation_id = ?`;
    const result = await db.runExecute(sql, [reservationId]);
    
    logger.warn('Reserva eliminada por administrador', {
      reservationId,
      previousStatus: existingReservation[0].status,
      adminUser: req.user.username
    });
    
    res.json({ 
      success: true,
      message: 'Reserva eliminada exitosamente',
      data: {
        reservation_id: reservationId,
        changes: result.changes
      }
    });
  } catch (error) {
    logger.error('Error eliminando reserva administrativa', { 
      error: error.message,
      reservationId: req.params.id,
      adminUser: req.user?.username
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Error eliminando reserva',
      code: 'DELETE_ERROR'
    });
  }
});

/**
 * @swagger
 * /admin/reservations/upcoming:
 *   get:
 *     tags: [Reservations]
 *     summary: Obtener reservas próximas
 *     description: Retorna las reservas con check-in o check-out en las próximas 24-72 horas
 *     responses:
 *       200:
 *         description: Reservas próximas obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Reservation'
 *                       - type: object
 *                         properties:
 *                           event_type:
 *                             type: string
 *                             enum: [check_in, check_out, other]
 *                             example: check_in
 *                             description: Tipo de evento próximo
 *                           urgency:
 *                             type: string
 *                             enum: [today, tomorrow, later]
 *                             example: today
 *                             description: Urgencia del evento
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     dateRange:
 *                       type: object
 *                       properties:
 *                         from:
 *                           type: string
 *                           format: date
 *                           example: 2024-08-04
 *                         to:
 *                           type: string
 *                           format: date
 *                           example: 2024-08-07
 *                     total:
 *                       type: integer
 *                       example: 5
 *       401:
 *         description: Token no válido o no proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security:
 *       - bearerAuth: []
 */
// GET /upcoming - get upcoming reservations (check-ins and check-outs in next 24-72h)
router.get('/upcoming', 
  authenticateToken,
  logAdminActivity('list_upcoming_reservations'),
  async (req, res) => {
  try {
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const next72h = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    
    // Format dates for SQLite (YYYY-MM-DD format)
    const today = now.toISOString().split('T')[0];
    const tomorrow = next24h.toISOString().split('T')[0];
    const dayAfterTomorrow = next72h.toISOString().split('T')[0];
    
    const sql = `
      SELECT 
        r.reservation_id, 
        r.cabin_id, 
        r.user_id, 
        r.start_date, 
        r.end_date, 
        r.status, 
        r.total_price,
        r.personas,
        u.name AS user_name,
        u.phone_number AS phone_number,
        c.name AS cabin_name,
        c.capacity AS cabin_capacity,
        CASE 
          WHEN r.start_date BETWEEN ? AND ? THEN 'check_in'
          WHEN r.end_date BETWEEN ? AND ? THEN 'check_out'
          ELSE 'other'
        END as event_type,
        CASE 
          WHEN r.start_date = ? OR r.end_date = ? THEN 'today'
          WHEN r.start_date = ? OR r.end_date = ? THEN 'tomorrow'
          ELSE 'later'
        END as urgency
      FROM Reservations r
      LEFT JOIN Users u ON r.user_id = u.user_id
      LEFT JOIN Cabins c ON r.cabin_id = c.cabin_id
      WHERE 
        (r.start_date BETWEEN ? AND ? OR r.end_date BETWEEN ? AND ?)
        AND r.status IN (
          'confirmado', 'confirmada', 'pendiente_autorizacion',
          'esperando_pago', 'pendiente_verificacion'
        )
      ORDER BY 
        CASE 
          WHEN r.start_date = ? OR r.end_date = ? THEN 1
          WHEN r.start_date = ? OR r.end_date = ? THEN 2
          ELSE 3
        END,
        r.start_date ASC,
        r.end_date ASC
    `;
    
    const reservations = await db.runQuery(sql, [
      today, dayAfterTomorrow, // check-in range
      today, dayAfterTomorrow, // check-out range
      today, today, // today comparisons
      tomorrow, tomorrow, // tomorrow comparisons
      today, dayAfterTomorrow, // main where clause check-in
      today, dayAfterTomorrow, // main where clause check-out
      today, today, // final ordering today
      tomorrow, tomorrow // final ordering tomorrow
    ]);
    
    logger.info('Reservas próximas consultadas', {
      adminUser: req.user.username,
      dateRange: `${today} to ${dayAfterTomorrow}`,
      resultsCount: reservations.length
    });
    
    res.json({
      success: true,
      data: reservations,
      metadata: {
        dateRange: {
          from: today,
          to: dayAfterTomorrow
        },
        total: reservations.length
      }
    });
  } catch (error) {
    logger.error('Error consultando reservas próximas', { 
      error: error.message,
      adminUser: req.user?.username
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Error consultando reservas próximas',
      code: 'UPCOMING_RESERVATIONS_ERROR'
    });
  }
});

// POST /calculate-price - calculate reservation price
router.post('/calculate-price', 
  authenticateToken,
  sanitizeRequestData,
  async (req, res) => {
  try {
    const { cabin_id, start_date, end_date } = req.body;
    
    if (!cabin_id || !start_date || !end_date) {
      return res.status(400).json({ 
        success: false, 
        message: 'cabin_id, start_date y end_date son obligatorios' 
      });
    }
    
    // Get cabin info
    const cabinQuery = 'SELECT * FROM Cabins WHERE cabin_id = ?';
    const cabinResults = await db.runQuery(cabinQuery, [cabin_id]);
    
    if (cabinResults.length === 0) {
      return res.status(404).json({ success: false, message: 'Cabaña no encontrada' });
    }
    
    const cabin = cabinResults[0];
    
    try {
      // Calculate price using the pricing service
      const { calcularPrecioTotal } = require('../services/reservaPriceService');
      
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      const nights = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      
      if (nights <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'La fecha de salida debe ser posterior a la fecha de entrada' 
        });
      }
      
      // Format date for pricing service
      const startDateStr = startDate.toLocaleDateString('es-HN', {
        day: '2-digit',
        month: '2-digit', 
        year: 'numeric'
      });
      
      // Determine cabin type from name
      let tipoCabana = '';
      const cabinName = cabin.name.toLowerCase();
      if (cabinName.includes('tortuga')) {
        tipoCabana = 'tortuga';
      } else if (cabinName.includes('delfín') || cabinName.includes('delfin')) {
        tipoCabana = 'delfin';
      } else if (cabinName.includes('tiburón') || cabinName.includes('tiburon')) {
        tipoCabana = 'tiburon';
      }
      
      const totalPrice = tipoCabana ? calcularPrecioTotal(tipoCabana, startDateStr, nights) : cabin.price * nights;
      
      logger.info('Precio calculado para reserva', {
        cabinId: cabin_id,
        cabinType: tipoCabana,
        nights: nights,
        totalPrice: totalPrice,
        adminUser: req.user.username
      });
      
      res.json({ 
        success: true, 
        data: {
          total_price: totalPrice,
          nights: nights,
          price_per_night: Math.round(totalPrice / nights),
          cabin_name: cabin.name,
          cabin_type: tipoCabana
        }
      });
      
    } catch (priceError) {
      logger.error('Error calculando precio', { 
        error: priceError.message,
        cabinId: cabin_id
      });
      res.status(500).json({ success: false, message: 'Error calculando precio' });
    }
    
  } catch (error) {
    logger.error('Error en endpoint de cálculo de precio', { 
      error: error.message,
      adminUser: req.user?.username
    });
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

module.exports = router;
