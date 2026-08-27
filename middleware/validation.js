const { body, validationResult, param, query } = require('express-validator');

/**
 * Middleware para manejar errores de validación de forma segura
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Log de intento de validación fallida para seguridad
    console.warn(`[SECURITY] Validation failed for ${req.method} ${req.path}:`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
    
    return res.status(400).json({
      success: false,
      message: 'Datos de entrada inválidos',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value ? '[HIDDEN]' : undefined // No exponer valores sensibles
      })),
      error: 'VALIDATION_ERROR'
    });
  }
  next();
};

/**
 * Sanitización anti-XSS
 */
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Remover scripts y HTML peligroso
        req.body[key] = req.body[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .trim();
      }
    });
  }
  next();
};

/**
 * Validaciones para usuarios
 */
const validateUserCreation = [
  body('phone_number')
    .matches(/^\+?[1-9]\d{7,14}$/)
    .withMessage('Número de teléfono inválido'),
  body('name')
    .isLength({ min: 2, max: 100 })
    .withMessage('Nombre debe tener entre 2 y 100 caracteres')
    .trim()
    .escape(),
  body('role')
    .optional()
    .isIn(['admin', 'guest', 'staff'])
    .withMessage('Rol inválido'),
  handleValidationErrors
];

const validateUserUpdate = [
  param('id').isInt({ min: 1 }).withMessage('ID de usuario inválido'),
  body('phone_number')
    .optional()
    .matches(/^\+?[1-9]\d{7,14}$/)
    .withMessage('Número de teléfono inválido'),
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Nombre debe tener entre 2 y 100 caracteres')
    .trim()
    .escape(),
  body('role')
    .optional()
    .isIn(['admin', 'guest', 'staff'])
    .withMessage('Rol inválido'),
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active debe ser booleano'),
  handleValidationErrors
];

/**
 * Validaciones para reservas
 */
const validateReservationCreation = [
  body('cabin_id')
    .isInt({ min: 1 })
    .withMessage('ID de cabaña inválido'),
  body('user_id')
    .isInt({ min: 1 })
    .withMessage('ID de usuario inválido'),
  body('start_date')
    .isISO8601()
    .withMessage('Fecha de inicio inválida (formato ISO8601)')
    .custom((value, { req }) => {
      const startDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (startDate < today) {
        throw new Error('Fecha de inicio no puede ser en el pasado');
      }
      return true;
    }),
  body('end_date')
    .isISO8601()
    .withMessage('Fecha de fin inválida (formato ISO8601)')
    .custom((value, { req }) => {
      const endDate = new Date(value);
      const startDate = new Date(req.body.start_date);
      if (endDate <= startDate) {
        throw new Error('Fecha de fin debe ser posterior a fecha de inicio');
      }
      return true;
    }),
  body('status')
    .isIn(['pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion', 'confirmada', 'cancelada', 'rechazada', 'completada', 'expirada'])
    .withMessage('Estado de reserva inválido'),
  body('total_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Precio total debe ser un número positivo'),
  body('personas')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Número de personas debe estar entre 1 y 20'),
  handleValidationErrors
];

const validateReservationUpdate = [
  param('id').isInt({ min: 1 }).withMessage('ID de reserva inválido'),
  body('cabin_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('ID de cabaña inválido'),
  body('start_date')
    .optional()
    .isISO8601()
    .withMessage('Fecha de inicio inválida'),
  body('end_date')
    .optional()
    .isISO8601()
    .withMessage('Fecha de fin inválida'),
  body('status')
    .optional()
    .isIn(['pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion', 'confirmada', 'cancelada', 'rechazada', 'completada', 'expirada'])
    .withMessage('Estado de reserva inválido'),
  body('total_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Precio total debe ser un número positivo'),
  body('personas')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Número de personas debe estar entre 1 y 20'),
  handleValidationErrors
];

/**
 * Validaciones para cabañas
 */
const validateCabinCreation = [
  body('name')
    .isLength({ min: 2, max: 100 })
    .withMessage('Nombre debe tener entre 2 y 100 caracteres')
    .trim()
    .escape(),
  body('capacity')
    .isInt({ min: 1, max: 20 })
    .withMessage('Capacidad debe estar entre 1 y 20 personas'),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Precio debe ser un número positivo'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Descripción no puede exceder 1000 caracteres')
    .trim(),
  handleValidationErrors
];

/**
 * Validaciones para login
 */
const validateLogin = [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('Usuario debe tener entre 3 y 50 caracteres')
    .trim()
    .escape(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Contraseña debe tener al menos 6 caracteres'),
  handleValidationErrors
];

/**
 * Validaciones para parámetros de ID
 */
const validateId = [
  param('id').isInt({ min: 1 }).withMessage('ID inválido'),
  handleValidationErrors
];

/**
 * Validaciones para consultas de fecha
 */
const validateDateQuery = [
  query('year')
    .optional()
    .isInt({ min: 2020, max: 2030 })
    .withMessage('Año debe estar entre 2020 y 2030'),
  query('month')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('Mes debe estar entre 1 y 12'),
  handleValidationErrors
];

/**
 * Validaciones adicionales de seguridad
 */
const validateReservationDates = [
  body('start_date')
    .custom((value, { req }) => {
      const startDate = new Date(value);
      const endDate = new Date(req.body.end_date);
      const diffTime = Math.abs(endDate - startDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Máximo 30 días de reserva
      if (diffDays > 30) {
        throw new Error('Reserva no puede exceder 30 días');
      }
      
      // Mínimo 1 día
      if (diffDays < 1) {
        throw new Error('Reserva debe ser de al menos 1 día');
      }
      
      return true;
    }),
  handleValidationErrors
];

/**
 * Validación anti-SQL injection para búsquedas de texto
 */
const validateSearchQuery = [
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Búsqueda debe tener entre 1-100 caracteres')
    .matches(/^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s\-_.@]+$/)
    .withMessage('Búsqueda contiene caracteres no permitidos'),
  handleValidationErrors
];

/**
 * Validación de paginación segura
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Página debe estar entre 1-1000'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Límite debe estar entre 1-100'),
  handleValidationErrors
];

module.exports = {
  // Middlewares base
  handleValidationErrors,
  sanitizeInput,
  
  // Validaciones de entidades
  validateUserCreation,
  validateUserUpdate,
  validateReservationCreation,
  validateReservationUpdate,
  validateCabinCreation,
  validateLogin,
  
  // Validaciones comunes
  validateId,
  validateDateQuery,
  validateReservationDates,
  validateSearchQuery,
  validatePagination
};
