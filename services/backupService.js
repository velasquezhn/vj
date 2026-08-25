/**
 * Servicio de Backup Automático para Villas Julie
 * 
 * Funcionalidades:
 * - Backup automático de la base de datos SQLite
 * - Compresión de backups para ahorrar espacio
 * - Rotación automática (mantener últimos 7 días)
 * - Verificación de integridad
 * - Logs detallados de todas las operaciones
 * - Restauración automática en caso de corrupción
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const sqlite3 = require('sqlite3').verbose();
const winston = require('winston');

// Configuración desde variables de entorno
const CONFIG = {
  enabled: process.env.BACKUP_ENABLED === 'true',
  intervalHours: parseInt(process.env.BACKUP_INTERVAL_HOURS) || 6,
  retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 7,
  backupDir: path.resolve(process.env.BACKUP_DIR || './backups'),
  dbPath: path.resolve(process.env.DB_PATH || './data/bot_database.sqlite'),
  compression: process.env.BACKUP_COMPRESSION === 'true',
  verify: process.env.BACKUP_VERIFY === 'true'
};
fs.mkdirSync(CONFIG.backupDir, { recursive: true });

// Logger específico para backups
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [BACKUP-${level.toUpperCase()}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: path.join(CONFIG.backupDir, 'backup.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

class BackupService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.initializeBackupDirectory();
  }

  /**
   * Inicializar directorio de backups
   */
  initializeBackupDirectory() {
    try {
      if (!fs.existsSync(CONFIG.backupDir)) {
        fs.mkdirSync(CONFIG.backupDir, { recursive: true });
        logger.info('Directorio de backups creado', { dir: CONFIG.backupDir });
      }
    } catch (error) {
      logger.error('Error creando directorio de backups', { error: error.message });
      throw error;
    }
  }

  /**
   * Generar nombre de archivo de backup
   */
  generateBackupFilename() {
    const timestamp = new Date().toISOString()
      .replace(/:/g, '-')
      .replace(/\..+/, '');
    
    const extension = CONFIG.compression ? '.sqlite.gz' : '.sqlite';
    return `backup_${timestamp}${extension}`;
  }

  /**
   * Verificar integridad de la base de datos
   */
  async verifyDatabaseIntegrity(dbPath) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          reject(err);
          return;
        }

        db.get('PRAGMA integrity_check', (err, row) => {
          db.close();
          
          if (err) {
            reject(err);
            return;
          }
          
          const isValid = row && row.integrity_check === 'ok';
          resolve(isValid);
        });
      });
    });
  }

  /**
   * Crear backup de la base de datos
   */
  async createBackup() {
    if (this.isRunning) {
      logger.warn('Backup ya en progreso, saltando...');
      return false;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      logger.info('Iniciando backup de base de datos...');

      // Verificar que la BD original existe y es válida
      if (!fs.existsSync(CONFIG.dbPath)) {
        throw new Error(`Base de datos no encontrada: ${CONFIG.dbPath}`);
      }

      const isIntact = await this.verifyDatabaseIntegrity(CONFIG.dbPath);
      if (!isIntact) {
        throw new Error('Base de datos corrupta, no se puede hacer backup');
      }

      const backupFilename = this.generateBackupFilename();
      const backupPath = path.join(CONFIG.backupDir, backupFilename);
      
      // Obtener estadísticas de la BD original
      const originalStats = fs.statSync(CONFIG.dbPath);
      
      logger.info('Copiando base de datos...', {
        source: CONFIG.dbPath,
        destination: backupPath,
        originalSize: `${(originalStats.size / 1024 / 1024).toFixed(2)} MB`
      });

      // La API online-backup incluye páginas que aún estén en WAL.
      const consistentPath = CONFIG.compression ? `${backupPath}.tmp.sqlite` : backupPath;
      await this.createConsistentBackup(consistentPath);
      if (CONFIG.compression) {
        await this.createCompressedBackup(consistentPath, backupPath);
        fs.unlinkSync(consistentPath);
      }

      // Verificar el backup creado
      if (CONFIG.verify) {
        const tempPath = backupPath.replace('.gz', '_temp');
        
        if (CONFIG.compression) {
          // Descomprimir temporalmente para verificar
          await this.decompressFile(backupPath, tempPath);
          const isBackupValid = await this.verifyDatabaseIntegrity(tempPath);
          fs.unlinkSync(tempPath); // Limpiar archivo temporal
          
          if (!isBackupValid) {
            throw new Error('Backup creado está corrupto');
          }
        } else {
          const isBackupValid = await this.verifyDatabaseIntegrity(backupPath);
          if (!isBackupValid) {
            throw new Error('Backup creado está corrupto');
          }
        }
      }

      // Obtener estadísticas del backup
      const backupStats = fs.statSync(backupPath);
      const compressionRatio = CONFIG.compression ? 
        ((originalStats.size - backupStats.size) / originalStats.size * 100).toFixed(1) : 0;

      const duration = Date.now() - startTime;
      
      logger.info('Backup completado exitosamente', {
        file: backupFilename,
        backupSize: `${(backupStats.size / 1024 / 1024).toFixed(2)} MB`,
        compressionRatio: CONFIG.compression ? `${compressionRatio}%` : 'N/A',
        duration: `${duration}ms`
      });

      // Limpiar backups antiguos
      await this.cleanOldBackups();

      return true;

    } catch (error) {
      logger.error('Error durante el backup', { 
        error: error.message,
        duration: `${Date.now() - startTime}ms`
      });
      return false;
    } finally {
      this.isRunning = false;
    }
  }

  createConsistentBackup(destinationPath) {
    return new Promise((resolve, reject) => {
      const source = new sqlite3.Database(CONFIG.dbPath, sqlite3.OPEN_READONLY, (openError) => {
        if (openError) return reject(openError);
        source.backup(destinationPath, (backupError) => {
          source.close(() => backupError ? reject(backupError) : resolve());
        });
      });
    });
  }

  /**
   * Crear backup comprimido
   */
  async createCompressedBackup(sourcePath, destinationPath) {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(sourcePath);
      const writeStream = fs.createWriteStream(destinationPath);
      const gzipStream = zlib.createGzip({ level: 6 }); // Compresión balanceada

      readStream
        .pipe(gzipStream)
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });
  }

  /**
   * Descomprimir archivo
   */
  async decompressFile(sourcePath, destinationPath) {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(sourcePath);
      const writeStream = fs.createWriteStream(destinationPath);
      const gunzipStream = zlib.createGunzip();

      readStream
        .pipe(gunzipStream)
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });
  }

  /**
   * Limpiar backups antiguos
   */
  async cleanOldBackups() {
    try {
      const files = fs.readdirSync(CONFIG.backupDir)
        .filter(file => file.startsWith('backup_') && (file.endsWith('.sqlite') || file.endsWith('.sqlite.gz')))
        .map(file => ({
          name: file,
          path: path.join(CONFIG.backupDir, file),
          mtime: fs.statSync(path.join(CONFIG.backupDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime); // Más recientes primero

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - CONFIG.retentionDays);

      let deleted = 0;
      for (const file of files) {
        if (file.mtime < cutoffDate) {
          fs.unlinkSync(file.path);
          deleted++;
          logger.info('Backup antiguo eliminado', { 
            file: file.name,
            age: `${Math.round((Date.now() - file.mtime) / (1000 * 60 * 60 * 24))} días`
          });
        }
      }

      if (deleted > 0) {
        logger.info(`Limpieza completada: ${deleted} backup(s) antiguos eliminados`);
      }

      logger.info('Estado de backups', {
        total: files.length - deleted,
        retentionDays: CONFIG.retentionDays
      });

    } catch (error) {
      logger.error('Error limpiando backups antiguos', { error: error.message });
    }
  }

  /**
   * Listar backups disponibles
   */
  listBackups() {
    try {
      const files = fs.readdirSync(CONFIG.backupDir)
        .filter(file => file.startsWith('backup_') && (file.endsWith('.sqlite') || file.endsWith('.sqlite.gz')))
        .map(file => {
          const filePath = path.join(CONFIG.backupDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            path: filePath,
            size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
            created: stats.mtime.toISOString(),
            compressed: file.endsWith('.gz')
          };
        })
        .sort((a, b) => new Date(b.created) - new Date(a.created));

      return files;
    } catch (error) {
      logger.error('Error listando backups', { error: error.message });
      return [];
    }
  }

  /**
   * Restaurar backup
   */
  async restoreBackup(backupFilename) {
    try {
      const safeFilename = path.basename(String(backupFilename || ''));
      if (safeFilename !== backupFilename || !/^backup_[A-Za-z0-9_.-]+\.sqlite(?:\.gz)?$/.test(safeFilename)) {
        throw new Error('Nombre de backup inválido');
      }
      backupFilename = safeFilename;
      logger.info('Iniciando restauración de backup', { backup: backupFilename });

      const backupPath = path.resolve(CONFIG.backupDir, backupFilename);
      if (path.dirname(backupPath) !== path.resolve(CONFIG.backupDir)) throw new Error('Ruta de backup inválida');
      
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup no encontrado: ${backupFilename}`);
      }

      // Crear backup de la BD actual antes de restaurar
      const emergencyBackup = `emergency_${Date.now()}.sqlite`;
      const emergencyPath = path.join(CONFIG.backupDir, emergencyBackup);
      
      if (fs.existsSync(CONFIG.dbPath)) {
        fs.copyFileSync(CONFIG.dbPath, emergencyPath);
        logger.info('Backup de emergencia creado', { file: emergencyBackup });
      }

      // Restaurar el backup
      if (backupFilename.endsWith('.gz')) {
        await this.decompressFile(backupPath, CONFIG.dbPath);
      } else {
        fs.copyFileSync(backupPath, CONFIG.dbPath);
      }

      // Verificar integridad de la BD restaurada
      const isValid = await this.verifyDatabaseIntegrity(CONFIG.dbPath);
      if (!isValid) {
        // Restaurar backup de emergencia
        if (fs.existsSync(emergencyPath)) {
          fs.copyFileSync(emergencyPath, CONFIG.dbPath);
          logger.error('BD restaurada corrupta, revirtiendo a backup de emergencia');
        }
        throw new Error('Backup restaurado está corrupto');
      }

      logger.info('Backup restaurado exitosamente', { backup: backupFilename });
      
      // Limpiar backup de emergencia si todo salió bien
      if (fs.existsSync(emergencyPath)) {
        fs.unlinkSync(emergencyPath);
      }

      return true;

    } catch (error) {
      logger.error('Error durante restauración', { 
        backup: backupFilename,
        error: error.message 
      });
      return false;
    }
  }

  /**
   * Iniciar servicio de backup automático
   */
  start() {
    if (!CONFIG.enabled) {
      logger.info('Backup automático deshabilitado');
      return;
    }

    if (this.intervalId) {
      logger.warn('Servicio de backup ya está ejecutándose');
      return;
    }

    logger.info('Iniciando servicio de backup automático', {
      intervalHours: CONFIG.intervalHours,
      retentionDays: CONFIG.retentionDays,
      compression: CONFIG.compression,
      verify: CONFIG.verify
    });

    // Hacer un backup inicial
    this.createBackup();

    // Programar backups periódicos
    this.intervalId = setInterval(() => {
      this.createBackup();
    }, CONFIG.intervalHours * 60 * 60 * 1000);
  }

  /**
   * Detener servicio de backup automático
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Servicio de backup automático detenido');
    }
  }

  /**
   * Obtener estadísticas del servicio
   */
  getStats() {
    const backups = this.listBackups();
    const totalSize = backups.reduce((sum, backup) => {
      return sum + parseFloat(backup.size);
    }, 0);

    return {
      enabled: CONFIG.enabled,
      isRunning: this.isRunning,
      config: CONFIG,
      backups: {
        count: backups.length,
        totalSize: `${totalSize.toFixed(2)} MB`,
        latest: backups[0]?.created || 'N/A'
      }
    };
  }
}

// Singleton instance
const backupService = new BackupService();

module.exports = backupService;
