const fs = require('fs');
const os = require('os');
const path = require('path');
const { countFiles, verifyInitialProductionData } = require('../services/productionReadinessService');

describe('production readiness data guard', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'vj-production-ready-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('counts receipt files recursively', () => {
    fs.mkdirSync(path.join(root, 'nested'));
    fs.writeFileSync(path.join(root, 'one.jpg'), 'x');
    fs.writeFileSync(path.join(root, 'nested', 'two.png'), 'x');
    expect(countFiles(root)).toBe(2);
  });

  test('does nothing outside production', async () => {
    const runQuery = jest.fn();
    await expect(verifyInitialProductionData({
      appEnv: 'qa', enabled: true, databasePath: path.join(root, 'db.sqlite'),
      receiptsDir: path.join(root, 'receipts'), runQuery
    })).resolves.toEqual({ enforced: false });
    expect(runQuery).not.toHaveBeenCalled();
  });

  test('marks a clean production store as verified once', async () => {
    const runQuery = jest.fn().mockResolvedValue([{ users: 0, reservations: 0 }]);
    const options = {
      appEnv: 'production', enabled: true, databasePath: path.join(root, 'db.sqlite'),
      receiptsDir: path.join(root, 'receipts'), runQuery
    };

    await expect(verifyInitialProductionData(options)).resolves.toEqual({ enforced: true, verified: true });
    await expect(verifyInitialProductionData(options)).resolves.toEqual({ enforced: true, verified: true });
    expect(runQuery).toHaveBeenCalledTimes(1);
  });

  test.each([
    [{ users: 1, reservations: 0 }, false],
    [{ users: 0, reservations: 1 }, false],
    [{ users: 0, reservations: 0 }, true]
  ])('rejects a non-empty production store', async (counts, addReceipt) => {
    const receiptsDir = path.join(root, 'receipts');
    if (addReceipt) {
      fs.mkdirSync(receiptsDir);
      fs.writeFileSync(path.join(receiptsDir, 'receipt.jpg'), 'x');
    }
    await expect(verifyInitialProductionData({
      appEnv: 'production', enabled: true, databasePath: path.join(root, 'db.sqlite'),
      receiptsDir, runQuery: jest.fn().mockResolvedValue([counts])
    })).rejects.toThrow('Production data store is not empty');
  });
});
