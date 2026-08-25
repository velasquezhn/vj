require('dotenv').config();
const backupService = require('../services/backupService');

const [action, filename] = process.argv.slice(2);

async function main() {
  if (action === 'create') {
    if (!await backupService.createBackup()) throw new Error('No se pudo crear el backup');
    return;
  }
  if (action === 'restore' && filename) {
    if (!await backupService.restoreBackup(filename)) throw new Error('No se pudo restaurar el backup');
    return;
  }
  throw new Error('Uso: node scripts/manage-backup.js create | restore <backup_*.sqlite[.gz]>');
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
