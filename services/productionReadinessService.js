const fs = require('fs');
const path = require('path');

function countFiles(directory) {
  if (!fs.existsSync(directory)) return 0;
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const entryPath = path.join(directory, entry.name);
    return total + (entry.isDirectory() ? countFiles(entryPath) : 1);
  }, 0);
}

async function verifyInitialProductionData({
  appEnv,
  enabled,
  databasePath,
  receiptsDir,
  runQuery
}) {
  if (appEnv !== 'production' || !enabled) return { enforced: false };

  const markerPath = path.join(path.dirname(databasePath), '.production-data-verified');
  if (fs.existsSync(markerPath)) return { enforced: true, verified: true };

  const [row] = await runQuery(`
    SELECT
      (SELECT COUNT(*) FROM Users) AS users,
      (SELECT COUNT(*) FROM Reservations) AS reservations
  `);
  const receipts = countFiles(receiptsDir);

  if (Number(row?.users || 0) > 0 || Number(row?.reservations || 0) > 0 || receipts > 0) {
    throw new Error('Production data store is not empty');
  }

  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, `${new Date().toISOString()}\n`, { encoding: 'utf8', flag: 'wx' });
  return { enforced: true, verified: true };
}

module.exports = { countFiles, verifyInitialProductionData };
