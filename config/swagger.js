/**
 * Configuración de Swagger para documentación API
 * Bot Villas Julie - Documentación Interactiva
 */

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Bot Villas Julie - Admin API',
      version: '1.0.0',
      description: `
        API completa para el sistema de administración de Bot Villas Julie.
        
        ## Funcionalidades principales:
        - **Autenticación JWT** con roles y permisos
        - **Gestión de Usuarios** (clientes del bot)
        - **Administración de Cabañas** con imágenes y capacidades
        - **Sistema de Reservas** completo con comprobantes
        - **Dashboard Analytics** con estadísticas en tiempo real
        - **Gestión de Actividades** locales y experiencias
        - **Estados de Conversación** del chatbot
        - **Sistema de Backup** automático y manual
        - **Calendario de Ocupación** mensual
        
        ## Seguridad implementada:
        - Rate limiting por usuario y global
        - Validación avanzada de entrada con detección de amenazas
        - Logging de seguridad completo
        - Sanitización automática de datos
        - Headers de seguridad (Helmet)
        
        ## Notas de uso:
        - Todos los endpoints admin requieren autenticación JWT
        - Use el endpoint \`/auth/login\` para obtener el token
        - Incluya el token en el header: \`Authorization: Bearer <token>\`
        - Los tokens expiran en 24 horas
      `,
      contact: {
        name: 'Bot Villas Julie Support',
        email: 'support@villasjulie.com'
      },
      license: {
        name: 'Private License',
        url: 'https://villasjulie.com/license'
      }
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Servidor de Desarrollo'
      },
      {
        url: 'https://api.villasjulie.com',
        description: 'Servidor de Producción'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtenido del endpoint /auth/login'
        }
      },
      schemas: {
        // Esquemas de respuesta estándar
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operación exitosa' },
            data: { type: 'object' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error en la operación' },
            error: { type: 'string', example: 'ERROR_CODE' }
          }
        },
        PaginationParams: {
          type: 'object',
          properties: {
            limit: { 
              type: 'integer', 
              minimum: 1, 
              maximum: 100, 
              default: 20,
              description: 'Número máximo de resultados' 
            },
            offset: { 
              type: 'integer', 
              minimum: 0, 
              default: 0,
              description: 'Número de resultados a omitir' 
            }
          }
        },
        // Modelos de datos principales
        User: {
          type: 'object',
          properties: {
            user_id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Juan Pérez' },
            phone_number: { type: 'string', example: '+1234567890' },
            email: { type: 'string', format: 'email', example: 'juan@email.com' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            last_interaction: { type: 'string', format: 'date-time' }
          }
        },
        UserCreate: {
          type: 'object',
          required: ['name', 'phone_number'],
          properties: {
            name: { 
              type: 'string', 
              minLength: 2, 
              maxLength: 100,
              example: 'Juan Pérez',
              description: 'Nombre completo del usuario' 
            },
            phone_number: { 
              type: 'string', 
              pattern: '^\\+?[1-9]\\d{7,14}$',
              example: '+1234567890',
              description: 'Número de teléfono en formato internacional' 
            },
            email: { 
              type: 'string', 
              format: 'email', 
              example: 'juan@email.com',
              description: 'Email del usuario (opcional)'
            }
          }
        },
        Cabin: {
          type: 'object',
          properties: {
            cabin_id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Cabaña Romántica' },
            description: { type: 'string', example: 'Perfecta para parejas con jacuzzi privado' },
            capacity: { type: 'integer', example: 2 },
            price_per_night: { type: 'number', format: 'decimal', example: 150.00 },
            photo_url: { type: 'string', example: '/images/cabin1.jpg' },
            amenities: { type: 'string', example: 'Jacuzzi, WiFi, Cocina' },
            is_available: { type: 'boolean', example: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        CabinCreate: {
          type: 'object',
          required: ['name', 'capacity', 'price_per_night'],
          properties: {
            name: { 
              type: 'string', 
              minLength: 3, 
              maxLength: 100,
              example: 'Cabaña Romántica' 
            },
            description: { 
              type: 'string', 
              maxLength: 500,
              example: 'Perfecta para parejas con jacuzzi privado' 
            },
            capacity: { 
              type: 'integer', 
              minimum: 1, 
              maximum: 20,
              example: 2 
            },
            price_per_night: { 
              type: 'number', 
              format: 'decimal', 
              minimum: 0,
              example: 150.00 
            },
            amenities: { 
              type: 'string', 
              example: 'Jacuzzi, WiFi, Cocina' 
            },
            is_available: { 
              type: 'boolean', 
              default: true 
            }
          }
        },
        Reservation: {
          type: 'object',
          properties: {
            reservation_id: { type: 'integer', example: 1 },
            cabin_id: { type: 'integer', example: 1 },
            user_id: { type: 'integer', example: 1 },
            start_date: { type: 'string', format: 'date', example: '2024-08-15' },
            end_date: { type: 'string', format: 'date', example: '2024-08-17' },
            status: { 
              type: 'string', 
              enum: ['pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion', 'confirmada', 'rechazada', 'cancelada', 'expirada'],
              example: 'confirmada'
            },
            total_price: { type: 'number', format: 'decimal', example: 300.00 },
            personas: { type: 'integer', example: 2 },
            comprobante_nombre_archivo: { type: 'string', example: 'comprobante-123.jpg' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            // Datos relacionados
            user_name: { type: 'string', example: 'Juan Pérez' },
            phone_number: { type: 'string', example: '+1234567890' },
            cabin_name: { type: 'string', example: 'Cabaña Romántica' },
            cabin_capacity: { type: 'integer', example: 2 }
          }
        },
        ReservationCreate: {
          type: 'object',
          required: ['cabin_id', 'user_id', 'start_date', 'end_date', 'number_of_people'],
          properties: {
            cabin_id: { 
              type: 'integer', 
              minimum: 1,
              example: 1,
              description: 'ID de la cabaña a reservar' 
            },
            user_id: { 
              type: 'integer', 
              minimum: 1,
              example: 1,
              description: 'ID del usuario que realiza la reserva' 
            },
            start_date: { 
              type: 'string', 
              format: 'date', 
              example: '2024-08-15',
              description: 'Fecha de check-in (YYYY-MM-DD)' 
            },
            end_date: { 
              type: 'string', 
              format: 'date', 
              example: '2024-08-17',
              description: 'Fecha de check-out (YYYY-MM-DD)' 
            },
            status: { 
              type: 'string', 
              enum: ['pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion', 'confirmada', 'rechazada', 'cancelada', 'expirada'],
              default: 'pendiente_autorizacion',
              example: 'pendiente_autorizacion'
            },
            total_price: { 
              type: 'number', 
              format: 'decimal', 
              minimum: 0,
              example: 300.00,
              description: 'Precio total de la reserva' 
            },
            number_of_people: { 
              type: 'integer', 
              minimum: 1,
              example: 2,
              description: 'Número de personas para la reserva' 
            }
          }
        },
        Activity: {
          type: 'object',
          properties: {
            activity_id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Senderismo Cerro Julie' },
            description: { type: 'string', example: 'Caminata guiada con vista panorámica' },
            duration: { type: 'string', example: '3 horas' },
            difficulty: { 
              type: 'string', 
              enum: ['fácil', 'moderado', 'difícil'],
              example: 'moderado' 
            },
            price: { type: 'number', format: 'decimal', example: 25.00 },
            includes: { type: 'string', example: 'Guía, agua, snacks' },
            is_available: { type: 'boolean', example: true },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        ConversationState: {
          type: 'object',
          properties: {
            conversation_id: { type: 'integer', example: 1 },
            user_id: { type: 'integer', example: 1 },
            state: { type: 'string', example: 'waiting_dates' },
            data: { type: 'object', example: { cabin_id: 1, guests: 2 } },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        DashboardStats: {
          type: 'object',
          properties: {
            totalUsers: { type: 'integer', example: 150 },
            totalReservations: { type: 'integer', example: 45 },
            totalCabins: { type: 'integer', example: 8 },
            totalRevenue: { type: 'number', format: 'decimal', example: 12500.00 },
            pendingReservations: { type: 'integer', example: 5 },
            confirmedReservations: { type: 'integer', example: 32 },
            occupancyRate: { type: 'number', format: 'decimal', example: 0.75 },
            averageReservationValue: { type: 'number', format: 'decimal', example: 277.78 }
          }
        },
        CalendarOccupancy: {
          type: 'object',
          properties: {
            cabanas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer', example: 1 },
                  nombre: { type: 'string', example: 'Cabaña Romántica' },
                  capacidad: { type: 'integer', example: 2 },
                  descripcion: { type: 'string', example: 'Perfecta para parejas' }
                }
              }
            },
            ocupacion: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                additionalProperties: { 
                  type: 'string', 
                  enum: ['pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion', 'confirmada', 'rechazada', 'cancelada', 'expirada'],
                  example: 'confirmada'
                }
              },
              example: {
                "1": { "2026-09-15": "confirmada", "2026-09-16": "confirmada" },
                "2": { "2026-09-20": "pendiente_autorizacion" }
              }
            },
            year: { type: 'integer', example: 2024 },
            month: { type: 'integer', example: 8 }
          }
        },
        BackupStatus: {
          type: 'object',
          properties: {
            isRunning: { type: 'boolean', example: true },
            lastBackup: { type: 'string', format: 'date-time' },
            totalBackups: { type: 'integer', example: 15 },
            backupSize: { type: 'string', example: '2.5 MB' },
            nextScheduled: { type: 'string', format: 'date-time' }
          }
        },
        BackupFile: {
          type: 'object',
          properties: {
            filename: { type: 'string', example: 'backup_2024-08-04_143025.sql' },
            size: { type: 'string', example: '1.2 MB' },
            created: { type: 'string', format: 'date-time' },
            type: { type: 'string', enum: ['auto', 'manual'], example: 'auto' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'Endpoints de autenticación y autorización'
      },
      {
        name: 'Users',
        description: 'Gestión de usuarios del sistema'
      },
      {
        name: 'Cabins',
        description: 'Administración de cabañas y alojamientos'
      },
      {
        name: 'Reservations',
        description: 'Sistema completo de reservas'
      },
      {
        name: 'Activities',
        description: 'Gestión de actividades y experiencias'
      },
      {
        name: 'Dashboard',
        description: 'Estadísticas y analytics del sistema'
      },
      {
        name: 'Conversation States',
        description: 'Estados de conversación del chatbot'
      },
      {
        name: 'Calendar',
        description: 'Calendario de ocupación'
      },
      {
        name: 'Backup',
        description: 'Sistema de respaldo de datos'
      },
      {
        name: 'System',
        description: 'Endpoints del sistema y monitoreo'
      }
    ]
  },
  apis: [
    './routes/*.js',
    './adminServer.js',
    './controllers/*.js',
    './config/swaggerDocs.js'
  ]
};

const specs = swaggerJsdoc(options);

module.exports = specs;
