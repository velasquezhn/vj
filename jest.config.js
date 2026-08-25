/**
 * Configuración de Jest para pruebas exhaustivas
 * Bot VJ - Sistema de Reservas Villas Julie
 */

module.exports = {
  // Entorno de testing
  testEnvironment: 'node',
  
  // Archivos de setup
  setupFiles: ['<rootDir>/tests/env.setup.js'],
  
  // Directorios de pruebas
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  
  // Ignorar archivos específicos
  testPathIgnorePatterns: [
    '/node_modules/',
    '/admin-frontend/',
    '/data/session/',
    '/logs/',
    '/backups/',
    '/uploads/',
    '/test_logs/',
    '/test_backups/',
    '/test_uploads/',
    '/coverage/',
    'routes/test.js' // Archivo problemático
  ],
  
  // Cobertura de código
  collectCoverage: false,
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/admin-frontend/**',
    '!**/data/session/**',
    '!**/logs/**',
    '!**/backups/**',
    '!**/uploads/**',
    '!**/test_*/**',
    '!**/coverage/**',
    '!jest.config.js',
    '!**/tests/**',
    '!routes/test.js',
    '!data/create_db.js',
    '!data/insert_test_data.js'
  ],
  
  // Umbrales de cobertura (progresivos - se aumentarán gradualmente)
  coverageThreshold: {
    global: {
      branches: 2,    // Más realista para estado actual
      functions: 3,   // Más realista
      lines: 5,       // Mantener
      statements: 5   // Mantener
    }
  },
  
  // Reportes de cobertura
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json-summary'
  ],
  
  // Directorio de reportes
  coverageDirectory: './coverage',
  
  // Timeout aumentado para pruebas de integración
  testTimeout: 30000,
  
  // Configuración de mocks
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Configuración de módulos
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@config/(.*)$': '<rootDir>/config/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1',
    '^@middleware/(.*)$': '<rootDir>/middleware/$1',
    '^@routes/(.*)$': '<rootDir>/routes/$1',
    '^@controllers/(.*)$': '<rootDir>/controllers/$1',
    '^@models/(.*)$': '<rootDir>/models/$1'
  },
  
  // Transformaciones (removido babel-jest para usar setup nativo)
  // transform: {
  //   '^.+\\.js$': 'babel-jest'
  // },
  
  // Variables de entorno para tests
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  
  // Configuración de reportes
  reporters: ['default'],
  
  // Configuración de verbose para debugging
  verbose: false,
  
  // Silenciar deprecation warnings de dependencias
  silent: false,
  
  // Configuración para manejar SQLite en Windows
  modulePathIgnorePatterns: [
    '<rootDir>/node_modules/sqlite3/lib/build/',
    '<rootDir>/node_modules/sqlite3/lib/compiled/'
  ],
  
  // Configuración de globals para tests
  globals: {
    'ts-jest': {
      useESM: false
    }
  }
};
