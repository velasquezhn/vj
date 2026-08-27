/**
 * 🛡️ MIDDLEWARE DE VALIDACIÓN PARA APIs ADMINISTRATIVAS
 * Validaciones específicas para endpoints administrativos - Versión simplificada sin Joi
 */

const logger = require('../config/logger');

/**
 * Valida si una fecha tiene formato YYYY-MM-DD válido
 * @param {string} dateString - String de fecha a validar
 * @returns {boolean} true si es válida
 */
function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date) && dateString === date.toISOString().split('T')[0];
}

/**
 * Valida número de teléfono de Costa Rica
 * @param {string} phone - Número de teléfono
 * @returns {boolean} true si es válido
 */
function isValidInternationalPhone(phone) {
  // Formato internacional: +[código país][número] (8-15 dígitos total)
  // Acepta números de cualquier país del mundo
  const regex = /^\+\d{8,15}$/;
  return regex.test(phone);
}

// Función de sanitización simple
function sanitizeText(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/<img[^>]*src[^>]*>/gi, '')
    .replace(/<svg[^>]*>/gi, '')
    .trim();
}

/**
 * Validador para login de administradores
 */
const validateAdminLogin = (req, res, next) => {
  try {
    const { username, password } = req.body;
    
    // Validar username
    if (!username || typeof username !== 'string') {
      logger.warn('Login fallido: username faltante', { ip: req.ip });
      return res.status(400).json({
        success: false,
        message: 'El nombre de usuario es requerido',
        code: 'VALIDATION_ERROR'
      });
    }

    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de usuario debe tener entre 3 y 30 caracteres',
        code: 'VALIDATION_ERROR'
      });
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return res.status(400).json({
        success: false,
        message: 'El nombre de usuario solo puede contener letras y números',
        code: 'VALIDATION_ERROR'
      });
    }

    // Validar password
    if (!password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'La contraseña es requerida',
        code: 'VALIDATION_ERROR'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'La contraseña debe tener al menos 8 caracteres'
      });
    }

    req.body.username = sanitizeText(username);
    req.body.password = password; // No sanitizar contraseñas
    
    logger.info('Validación de login exitosa', {
      username: req.body.username,
      ip: req.ip
    });
    
    next();
  } catch (err) {
    logger.error('Error en validación de login', { error: err.message });
    res.status(500).json({
      success: false,
      message: 'Error interno en validación',
      code: 'VALIDATION_SYSTEM_ERROR'
    });
  }
};

/**
 * Validador para creación/actualización de reservas administrativas
 */
const validateAdminReservation = (req, res, next) => {
  try {
    const { cabin_id, user_id, start_date, end_date, status, total_price, number_of_people } = req.body;
    
    // Validar cabin_id
    if (!cabin_id || typeof cabin_id !== 'number' || cabin_id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de cabaña debe ser un número positivo',
        code: 'VALIDATION_ERROR'
      });
    }

    // Validar user_id
    if (!user_id || typeof user_id !== 'number' || user_id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario debe ser un número positivo',
        code: 'VALIDATION_ERROR'
      });
    }

    // Validar start_date
    if (!start_date || typeof start_date !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Fecha de inicio es requerida',
        code: 'VALIDATION_ERROR'
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return res.status(400).json({
        success: false,
        message: 'Fecha de inicio debe tener formato YYYY-MM-DD',
        code: 'VALIDATION_ERROR'
      });
    }

    // Validar end_date
    if (!end_date || typeof end_date !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Fecha de fin es requerida',
        code: 'VALIDATION_ERROR'
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      return res.status(400).json({
        success: false,
        message: 'Fecha de fin debe tener formato YYYY-MM-DD',
        code: 'VALIDATION_ERROR'
      });
    }

    // Validar que start_date sea antes que end_date
    const startDateObj = new Date(start_date);
    const endDateObj = new Date(end_date);
    if (startDateObj >= endDateObj) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_DATE_RANGE'
      });
    }

    // Validar status
    if (!status || typeof status !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Estado es requerido',
        code: 'VALIDATION_ERROR'
      });
    }

    const validStatuses = [
      'pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion',
      'confirmado', 'confirmada', 'cancelado', 'cancelada', 'rechazada',
      'completado', 'completada', 'expirada'
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Estado no permitido: ${status}`
      });
    }

    // Validar total_price
    if (!total_price || typeof total_price !== 'number' || total_price <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Precio total debe ser un número positivo',
        code: 'VALIDATION_ERROR'
      });
    }

    // Validar number_of_people
    if (!number_of_people || typeof number_of_people !== 'number' || number_of_people < 1 || number_of_people > 10) {
      return res.status(400).json({
        success: false,
        error: 'Máximo 10 personas permitidas por reserva'
      });
    }

    // Sanitizar datos
    req.body.cabin_id = cabin_id;
    req.body.user_id = user_id;
    req.body.start_date = start_date.trim();
    req.body.end_date = end_date.trim();
    req.body.status = status.trim();
    req.body.total_price = total_price;
    req.body.number_of_people = number_of_people;
    
    logger.info('Validación de reserva administrativa exitosa', {
      adminUser: req.user?.username,
      cabin_id,
      user_id,
      start_date: req.body.start_date,
      end_date: req.body.end_date
    });
    
    next();
  } catch (err) {
    logger.error('Error en validación de reserva administrativa', { error: err.message });
    res.status(500).json({
      success: false,
      message: 'Error interno en validación',
      code: 'VALIDATION_SYSTEM_ERROR'
    });
  }
};

/**
 * Middleware para sanitizar datos de entrada general
 */
const sanitizeRequestData = (req, res, next) => {
  try {
    // Sanitizar strings en body
    if (req.body && typeof req.body === 'object') {
      for (const [key, value] of Object.entries(req.body)) {
        if (typeof value === 'string' && key !== 'password') {
          req.body[key] = sanitizeText(value);
        }
      }
    }

    // Sanitizar strings en query params
    if (req.query && typeof req.query === 'object') {
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === 'string') {
          req.query[key] = sanitizeText(value);
        }
      }
    }

    next();
  } catch (err) {
    logger.error('Error en sanitización de datos', { error: err.message });
    res.status(500).json({
      success: false,
      message: 'Error interno en procesamiento de datos',
      code: 'SANITIZATION_ERROR'
    });
  }
};

/**
 * Middleware para logging de actividades administrativas
 * @param {string} activity - Tipo de actividad a registrar
 * @returns {Function} Middleware function
 */
function logAdminActivity(activity) {
  return (req, res, next) => {
    try {
      const timestamp = new Date().toISOString();
      const ip = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent') || 'Unknown';
      
      logger.info('Admin activity', { activity, ip });
      
      // Agregar información al request para usar en el handler
      req.adminActivity = {
        activity,
        timestamp,
        ip,
        userAgent
      };
      
      next();
    } catch (error) {
      console.error('Error en logAdminActivity:', error);
      next(); // Continuar incluso si falla el logging
    }
  };
}

/**
 * Middleware para validar filtros de reservaciones
 * @param {Object} req - Request object
 * @param {Object} res - Response object  
 * @param {Function} next - Next middleware function
 */
function validateReservationFilters(req, res, next) {
  try {
    const { status, cabin_id, start_date, end_date, phone_number, limit, offset, start_date_from, start_date_to } = req.query;
    const errors = [];

    // Convertir y validar limit
    if (limit) {
      const numLimit = Number(limit);
      if (!Number.isInteger(numLimit) || numLimit <= 0) {
        errors.push('limit debe ser un número entero positivo');
      } else {
        req.query.limit = numLimit;
      }
    }

    // Convertir y validar offset
    if (offset) {
      const numOffset = Number(offset);
      if (!Number.isInteger(numOffset) || numOffset < 0) {
        errors.push('offset debe ser un número entero no negativo');
      } else {
        req.query.offset = numOffset;
      }
    }

    // Validar status si se proporciona
    const validStatuses = [
      'pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion',
      'confirmado', 'confirmada', 'cancelado', 'cancelada', 'rechazada',
      'completado', 'completada', 'expirada'
    ];
    if (status && !validStatuses.includes(status)) {
      errors.push('Status de reserva no permitido');
    }

    // Validar cabin_id si se proporciona
    if (cabin_id && (!Number.isInteger(Number(cabin_id)) || Number(cabin_id) <= 0)) {
      errors.push('cabin_id debe ser un número entero positivo');
    }

    // Validar fechas si se proporcionan
    if (start_date && !isValidDate(start_date)) {
      errors.push('start_date debe tener formato YYYY-MM-DD válido');
    }

    if (end_date && !isValidDate(end_date)) {
      errors.push('end_date debe tener formato YYYY-MM-DD válido');
    }

    // Validar que start_date sea antes que end_date
    if (start_date && end_date) {
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      if (startDate >= endDate) {
        errors.push('start_date debe ser anterior a end_date');
      }
    }

    // Validar phone_number si se proporciona (formato internacional)
    if (phone_number && !isValidInternationalPhone(phone_number)) {
      errors.push('phone_number debe tener formato internacional válido (+[código país][número])');
    }

    // Validar rangos de fechas start_date_from y start_date_to
    if (start_date_from && !isValidDate(start_date_from)) {
      errors.push('start_date_from debe tener formato YYYY-MM-DD válido');
    }

    if (start_date_to && !isValidDate(start_date_to)) {
      errors.push('start_date_to debe tener formato YYYY-MM-DD válido');
    }

    // Validar que start_date_from sea antes que start_date_to
    if (start_date_from && start_date_to) {
      const fromDate = new Date(start_date_from);
      const toDate = new Date(start_date_to);
      if (fromDate >= toDate) {
        errors.push('La fecha final debe ser posterior a la fecha inicial');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Errores de validación en filtros',
        errors: errors,
        code: 'VALIDATION_ERROR'
      });
    }

    next();
  } catch (err) {
    logger.error('Error en validación de filtros de reservación', { error: err.message });
    res.status(500).json({
      success: false,
      message: 'Error interno en validación de filtros',
      code: 'FILTER_VALIDATION_ERROR'
    });
  }
}

/**
 * Middleware para validar que un ID sea numérico y positivo
 * @param {string} paramName - Nombre del parámetro a validar (por defecto 'id')
 * @returns {Function} Middleware de validación
 */
function validateNumericId(paramName = 'id') {
  return (req, res, next) => {
    try {
      const id = req.params?.[paramName];
      
      // Verificar que el ID esté presente
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID es requerido',
          code: 'MISSING_ID'
        });
      }

      // Verificar que sea numérico
      const numId = Number(id);
      if (!Number.isInteger(numId) || numId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'ID debe ser un número entero positivo',
          code: 'INVALID_ID_FORMAT'
        });
      }

      // Convertir el ID a número y agregarlo al request
      req.params[paramName] = numId;
      req.numericId = numId;
      next();
    } catch (err) {
      logger.error('Error en validación de ID numérico', { 
        error: err.message, 
        id: req.params?.[paramName],
        hasParams: !!req.params 
      });
      res.status(500).json({
        success: false,
        message: 'Error interno en validación de ID',
        code: 'ID_VALIDATION_ERROR'
      });
    }
  };
}

module.exports = {
  validateAdminLogin,
  validateAdminReservation,
  sanitizeRequestData,
  logAdminActivity,
  validateReservationFilters,
  validateNumericId
};
